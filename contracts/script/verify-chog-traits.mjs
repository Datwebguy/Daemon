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
for (let from = 0; from < expected.length; from += 100) {
  const ids = expected.slice(from, from + 100).map((_, i) => from + i + 1);
  const res = await client.multicall({ contracts: ids.map((id) => ({ address: reader, abi, functionName: "traitsJson", args: [BigInt(id)] })), allowFailure: true });
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
