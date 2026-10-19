import { createRemoteJWKSet, jwtVerify } from "jose";
import { createPublicClient, createWalletClient, http, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { welcomeDripAbi } from "@/lib/abis";
import { chain, contracts, env } from "@/lib/config";

/**
 * Welcome MON: pays the gas to call WelcomeDrip.claimFor(address) for a brand-new wallet, which has no MON to
 * claim with. The limits (once per wallet, only near-empty wallets, a daily cap) live in the contract, so this
 * route cannot give away more than the contract allows. The relayer key only ever pays gas.
 *
 * Server-only env: DRIP_RELAYER_KEY (0x-prefixed private key of a wallet holding a little MON for gas).
 * When Privy is configured, the caller must send a valid Privy access token (Authorization: Bearer ...).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLAIM_GAS = BigInt(200_000); // Monad charges the gas limit; a first claim of the day estimates ~141k, so keep headroom

const jwks = env.privyAppId ? createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${env.privyAppId}/jwks.json`)) : null;

function fail(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}

async function signedIn(req: Request): Promise<boolean> {
  if (!jwks) return true; // no Privy (plain wallet login): the contract limits still apply
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  try {
    await jwtVerify(token, jwks, { issuer: "privy.io", audience: env.privyAppId });
    return true;
  } catch {
    return false;
  }
}

function relayerKey(): Hex | undefined {
  const k = process.env.DRIP_RELAYER_KEY?.trim();
  return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : undefined;
}

export async function POST(req: Request) {
  const drip = contracts.welcomeDrip;
  const key = relayerKey();
  if (!drip || !key) return fail(503, "Welcome MON isn't switched on yet.");
  if (!(await signedIn(req))) return fail(401, "Please sign in first.");

  let to: Address;
  try {
    const body = (await req.json()) as { address?: unknown };
    if (typeof body.address !== "string" || !isAddress(body.address)) return fail(400, "That isn't a wallet address.");
    to = body.address;
  } catch {
    return fail(400, "Bad request.");
  }

  const transport = http(env.rpcUrl);
  const pub = createPublicClient({ chain, transport });
  const reason = await pub.readContract({ address: drip, abi: welcomeDripAbi, functionName: "status", args: [to] }).catch(() => "unavailable");
  if (reason) return fail(409, reason === "already claimed" ? "This wallet already got its welcome MON." : `Can't send welcome MON: ${reason}.`);

  const wallet = createWalletClient({ chain, transport, account: privateKeyToAccount(key) });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { request } = await pub.simulateContract({
        address: drip,
        abi: welcomeDripAbi,
        functionName: "claimFor",
        args: [to],
        account: wallet.account,
        gas: CLAIM_GAS,
      });
      const hash = await wallet.writeContract(request);
      return Response.json({ ok: true, hash });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[welcome] claim failed:", msg.slice(0, 400));
      // Two claims at once can race for the relayer's nonce: try once more.
      if (attempt === 0 && /nonce/i.test(msg)) continue;
      return fail(502, "The network didn't take the welcome MON transaction. Try again in a moment.");
    }
  }
  return fail(502, "Try again in a moment.");
}
