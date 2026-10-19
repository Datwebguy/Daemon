import { createRemoteJWKSet, jwtVerify } from "jose";
import { createPublicClient, createWalletClient, http, isAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { welcomeDripAbi } from "@/lib/abis";
import { chain, contracts, env } from "@/lib/config";

/**
 * Welcome MON: pays the gas to call WelcomeDrip.claimFor(address, userId) for a brand-new wallet, which has no MON
 * to claim with. The limits (once per wallet, once per signed-in account, only near-empty wallets, a daily cap) live
 * in the contract, so this route cannot give away more than the contract allows. The account id is a hash of the
 * verified Privy user id, so one person cannot farm gifts by inventing fresh wallets. The relayer key only ever pays gas.
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

/** The verified sign-in identity ("" when anonymous claims are explicitly allowed), or null when not signed in. */
async function signedIn(req: Request): Promise<string | null> {
  if (!jwks) return process.env.ALLOW_ANON_WELCOME === "1" ? "" : null; // no Privy configured: closed unless explicitly opened
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: "privy.io", audience: env.privyAppId, algorithms: ["ES256"] });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
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
  const identity = await signedIn(req);
  if (identity === null) return fail(401, "Please sign in first.");

  let to: Address;
  try {
    const body = (await req.json()) as { address?: unknown };
    if (typeof body.address !== "string" || !isAddress(body.address)) return fail(400, "That isn't a wallet address.");
    to = body.address;
  } catch {
    return fail(400, "Bad request.");
  }

  // anonymous mode has no account to count, so it falls back to one claim per wallet
  const userId = keccak256(toBytes(identity ? `privy:${identity}` : `wallet:${to.toLowerCase()}`));

  const transport = http(env.rpcUrl);
  const pub = createPublicClient({ chain, transport });
  if (await pub.readContract({ address: drip, abi: welcomeDripAbi, functionName: "userClaimed", args: [userId] }).catch(() => false))
    return fail(409, "This account already got its welcome MON.");
  const reason = await pub.readContract({ address: drip, abi: welcomeDripAbi, functionName: "status", args: [to] }).catch(() => "unavailable");
  if (reason) return fail(409, reason === "already claimed" ? "This wallet already got its welcome MON." : `Can't send welcome MON: ${reason}.`);

  const wallet = createWalletClient({ chain, transport, account: privateKeyToAccount(key) });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { request } = await pub.simulateContract({
        address: drip,
        abi: welcomeDripAbi,
        functionName: "claimFor",
        args: [to, userId],
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
