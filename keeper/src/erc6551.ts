import { type Address, type Hex, concat, encodeAbiParameters, getContractAddress, keccak256 } from "viem";

/** Canonical ERC-6551 registry (same address on every chain, verified on Monad testnet 10143). */
export const CANONICAL_ERC6551_REGISTRY: Address = "0x000000006551c19487814612e58FE06813775758";

/**
 * Off-chain ERC-6551 account address, identical to IERC6551Registry.account(...).
 * Account bytecode (EIP-6551):
 *   ERC-1167 header (10 bytes) | implementation (20) | ERC-1167 footer (15)
 *   | abi.encode(salt, chainId, tokenContract, tokenId)
 * deployed with CREATE2(registry, salt, keccak256(bytecode)).
 * Saves one RPC call per token; verified against the live registry in tests.
 */
export function computeErc6551Account(params: {
  registry: Address;
  implementation: Address;
  salt: Hex;
  chainId: bigint | number;
  tokenContract: Address;
  tokenId: bigint;
}): Address {
  const footer = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }],
    [params.salt, BigInt(params.chainId), params.tokenContract, params.tokenId],
  );
  const bytecode = concat([
    "0x3d60ad80600a3d3981f3363d3d373d3d3d363d73",
    params.implementation,
    "0x5af43d82803e903d91602b57fd5bf3",
    footer,
  ]);
  return getContractAddress({
    opcode: "CREATE2",
    from: params.registry,
    salt: params.salt,
    bytecodeHash: keccak256(bytecode),
  });
}
