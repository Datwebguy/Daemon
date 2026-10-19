# Agent Coding Standards – Daemon

## Non-Negotiable Rules

- 100% of Foundry tests must pass before any milestone is considered complete.
- Frontend must build with zero TypeScript errors.
- Never commit private keys, mnemonics, API keys (Privy, RPC, Pimlico) or other secrets.
- **No session keys, no executor, no delegations.** Do not add privileged operators or admin roles over user funds.
- Treat any address or provider claim from docs as unverified until checked on-chain (`eth_getCode`) or in the provider's own docs.
- Target network is Monad Testnet (10143).

## Solidity / Foundry

- Solidity ^0.8.24; foundry.toml with `network = "monad"` (Foundry v1.8.0+)
- Use Foundry best practices (forge-std, consistent naming)
- Use the canonical ERC-6551 registry; do not deploy a duplicate
- Prefer events over storage for historical messages
- Dynamic `owner()` resolution via ERC-6551
- Implement ERC-1271 for signature validation
- `sweepToOwner()` callable only by the current NFT owner; it exits every adapter
- Ownership-cycle guard: the account must reject being owned by its own NFT
- Gas: Monad charges the gas **limit**. Set explicit, tight limits on multicalls and `compoundMany`
- Never order events by `block.timestamp` (1-second granularity); use block number and log index
- No EIP-7702 for user funds (10 MON reserve rule, no CREATE/CREATE2 in delegated code)
- Contract size limit 128 KB; type 3 (blob) transactions are unsupported

## Compounding Rules

- `compound()` is public. It must: check the cooldown, require pending profit > gas + bounty, touch only registered adapters, and send funds only back into the same account.
- Swaps use a whitelisted router and an **oracle-based minimum output**, never caller-supplied.
- Harvested gains unlock/stream over a short window.
- Bounty = gas reimbursement + a share of profit that rises with time since last compound, capped. The caller receives nothing else.
- Re-entrancy guards on `compound`, `hype`, `hypeWithChog`, `sweepToOwner`.

## Adapter / Registry Rules

- Yield sources implement `IYieldSource` and can never be removed once registered.
- New adapters are added only behind a timelock and must never block an owner's exit.
- Per-adapter and per-Daemon caps.
- Before adding an adapter, check ERC-4626 status, contract-caller behavior, and withdrawal paths.

## TypeScript / Frontend

- Next.js App Router + TypeScript strict
- Viem ^2.40 + Wagmi ^2.x, using the viem `monadTestnet` chain (10143)
- Tailwind CSS
- Privy for login
- No dummy mock states when wallet is connected
- Clear loading and error states
- Read history via the indexer, not wide `eth_getLogs` ranges

## Audit-Derived Rules

- `DaemonAccount.execute` must keep rejecting approval selectors (`approve`, `increaseAllowance`, `setApprovalForAll`, `permit`, Permit2 `approve`).
- `MockChog._update` must keep rejecting transfers into token-bound accounts of its own collection.
- `Compounded.caller` is the bounty recipient (the keeper), not `msg.sender` (the hub).
- Keepers decide to send only from a decoded simulation of the exact batch; empty/undecodable results are errors.
- See SECURITY.md for the audit summary and known limitations.

## Security Invariants

1. Only the current NFT owner can call `execute`, `multicall`, `allocate`, `deallocate` and `sweepToOwner`.
2. `compound()` can only move funds back into the same account through registered adapters; the caller receives only the bounty.
3. `hype()` / `hypeWithChog()` can only add value to that Daemon's boost pot; the hyper cannot extract anything.
4. The boost effect can never exceed the pot balance and the maximum multiplier/duration.
5. Boost / hype state is readable and expires correctly.
6. On NFT transfer, cooldowns reset and the new owner holds all rights; no previous party retains any authority.
7. No admin can move user funds or block exits.

## Testing Requirements

- Unit tests for registry address computation
- Ownership-cycle guard
- `compound()`: cooldown, min-profit revert, unregistered adapter revert, bounty math (start, rise, cap), unlock window, funds return to the same account, re-entrancy
- Swap min-out: reverts below oracle-based minimum
- `compoundMany` gas and bounty accounting
- Sweep only by owner; exits all adapters; returns unused pot
- Hype: anyone can hype; per-hyper and per-Daemon cooldowns; boost cap; pot funds boost; no pot means no boost
- Mood / decay logic
- Yield-source tests: `StableVault` and `DegenVault` (deposit, harvest, withdraw, reward-pool exhaustion)
- Regenerate frontend/keeper ABIs after any contract change: `forge build && node script/export-abis.mjs`
- Integration test of full harvest → swap → restake path (using mocks)
