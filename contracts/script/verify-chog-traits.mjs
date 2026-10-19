// Compares the on-chain real traits of every artwork with the downloaded Chog Genesis metadata.
// Usage: RPC=<url> READER=<ChogRealTraits address> node script/verify-chog-traits.mjs [expected.json]
// (expected.json is written by gen-chog-traits.mjs next to the downloaded metadata.)
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { monadTestnet } from "viem/chains";

const rpc = process.env.RPC ?? "http://127.0.0.1:8545";
const reader = process.env.READER;
if (!reader) throw new Error("set READER to the ChogRealTraits address");
const expected = JSON.parse(readFileSync(process.argv[2] ?? "script/.chog-metadata/expected.json", "utf8"));
const client = createPublicClient({ chain: monadTestnet, transport: http(rpc) });
const abi = parseAbi(["function traitsJson(uint256) view returns (string)"]);

let bad = 0;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8); // a public RPC rate-limits bursts, so read in small parallel groups
const read = async (id) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return { status: "success", result: await client.readContract({ address: reader, abi, functionName: "traitsJson", args: [BigInt(id)] }) };
    } catch (e) {
      if (attempt >= 5) return { status: "failure", error: e };
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); // back off and retry
    }
  }
};
for (let from = 0; from < expected.length; from += CONCURRENCY) {
  const ids = expected.slice(from, from + CONCURRENCY).map((_, i) => from + i + 1);
  const res = await Promise.all(ids.map(read));
  res.forEach((r, i) => {
    const id = ids[i];
    const want = JSON.stringify(expected[id - 1].map(([trait_type, value]) => ({ trait_type, value }))).slice(1, -1);
    if (r.status !== "success" || r.result !== want) {
      if (bad++ < 5) console.log(`MISMATCH #${id}`, r.status, r.status === "success" ? r.result : r.error?.shortMessage, "\n  want", want);
    }
  });
}
console.log(bad === 0 ? `OK: all ${expected.length} artworks match the real metadata` : `FAILED: ${bad} artworks differ`);
process.exit(bad === 0 ? 0 : 1);
