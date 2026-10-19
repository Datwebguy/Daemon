# Tools – Daemon

Tools for building Daemon on **Monad Testnet (Chain ID 10143)**. Researched 2026-10-18.

**Status key**
- **Verified**: checked against the provider's own docs.
- **Docs claim**: only Monad's docs say so. Confirm before relying on it.
- **Unverified**: reported but no source found.

Full research: `reports/Monad ecosystem tools for Daemon.md`

## Must Use

| Layer | Tool | Status / Notes |
|---|---|---|
| Contracts | Foundry (v1.8.0+), OpenZeppelin, forge-std | `network = "monad"` in foundry.toml |
| Chain code | viem 2.40+ and wagmi 2.x with `monadTestnet` (10143) | Verified. Includes Multicall3. |
| ERC-6551 | Canonical registry `0x000000006551c19487814612e58FE06813775758`, Tokenbound V3, `@tokenbound/sdk` | Docs claim deployed on testnet. Run `eth_getCode`. |
| Login | Privy | Verified in Monad docs; testnet subsidized (email monad@privy.io). Add Monad 10143 in dashboard. |
| Network | Public RPC `https://testnet-rpc.monad.xyz`, faucet.monad.xyz | Verified |
| Explorers | MonadVision (Sourcify), Monadscan | Verified. Use to verify contracts. |
| Wallets | MetaMask, Rabby | Docs claim |

## Yield Sources (Adapters)

| Source | Status |
|---|---|
| ERC-6551 registry | **Verified on-chain**: canonical registry has code on 10143 (bytecode pulled and matched in tests) |
| StableVault / DegenVault (ours) | Our own ERC-4626 vaults on testnet with rewards streamed from a funded pool. Built with OpenZeppelin ERC4626. |
| `IYieldSource` (ours) | Interface every source implements; real protocols can be added later behind a wrapper |
| Envio HyperSync | **Verified**: supports 10143 (`https://10143.hypersync.xyz`); needs a free `ENVIO_API_TOKEN`. Envio CLI does not run on native Windows (use WSL, Docker, or Linux CI). |
| MockRouter / MockOracle (ours) | Swap and price for the oracle-based min-out; Pyth if live on 10143 |
| Aave V3, Morpho | Not on testnet. Mainnet only (out of scope). |
| Monad staking precompile `0x1000` | Documented. Check callable from a contract account. |
| Yield.xyz | Changelog says native staking launched on Monad testnet. Check from a contract account. |
| Vaults.fyi (data + MCP), Veda, Pods, Blend | Later / data only |

## High Value

| Layer | Tool | Why / Caveat |
|---|---|---|
| Oracles | Pyth price feeds | The contract exists on 10143 (`0x2880aB155794e7179c9eE2e38200202908C17B43`), but Hermes (the update service) now requires an API key, so testnet keeps `MockOracle`. |
| Randomness | Pyth Entropy V2 | **Used and verified**: `0x825c0390f379C631f3Cf11A82a37D20BddF93c07` on Monad testnet (Pyth contract_manager store; code and fee checked on-chain). Powers lucky hype. |
| Indexer | Envio or Goldsky | Feed, leaderboard. Public `eth_getLogs` is capped at 100–1,000 blocks. |
| Dynamic NFT | On-chain SVG `tokenURI` | Chog shows mood, boost and last yield on marketplaces |

## Optional

| Tool | Use |
|---|---|
| Pimlico bundler + paymaster | Sponsored gas for user transactions (`monad-testnet`). Not needed for the core flow. |
| Para, Turnkey, thirdweb | Alternative login (Para and Turnkey free on testnet) |
| Alchemy Account Kit | Fallback login / bundler |
| thirdweb Insight | NFT API for balances and holdings |
| OpenSea | Marketplace that lists Monad |
| Tenderly | Debugging and simulation |

## Build-Side Helpers

- **Frontend**: Next.js, Tailwind, `html-to-image` or canvas for the share card
- **Hosting**: Vercel or Railway
- **Reference keeper** (optional, open source): small Node + viem script calling `DaemonHub.compoundMany`; anyone can run their own
- **Chog tooling**: chog.xyz lists Swap, PFP Maker, Snapshoter and Messenger; no SDK or API found

## Real Chog Art

- Real collection: Chog Genesis on Monad mainnet, `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763`, 1,969 tokens. Metadata folder `ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/<1..1969>.json`; art lives under a separate folder referenced inside each JSON.
- Gateways that work for plain content with open CORS: `https://ipfs.filebase.io/ipfs/` (fast) and `https://gateway.pinata.cloud/ipfs/` (slower). `ipfs.io` and `dweb.link` no longer serve plain content.

## Not Used (by design)

- **Session keys / delegations** (ZeroDev Kernel, Openfort, ERC-7579/7710/7715 modules): Daemon has no operator and no delegated authority.
- **Executor / automation networks** (FastLane Task Manager, Gelato, Chainlink Automation): compounding is permissionless with a bounty.
- Card issuing, payment orchestrators, privacy tooling, custody.

## Lessons From Other Platforms

| Platform | Lesson |
|---|---|
| Beefy | Pay the harvest caller from the performance fee |
| Convex | Permissionless harvest with a caller reward; stream rewards over time to deter flash-loan games |
| Yearn | Profit unlock window; keep swaps safe from MEV |
| Arrakis | A manager role is a trust assumption; Daemon has none |
| Aavegotchi | Cooldown engagement loop and neglect decay; bots will automate it |
| ERC-6551 projects | Inventory follows the NFT; guard against ownership cycles |

## Known Risks

- Monad charges the gas **limit**, not gas used. Set tight limits.
- `TIMESTAMP` has one-second granularity. Order events by block number and log index.
- EIP-7702 delegated accounts must keep a 10 MON reserve. Use contract accounts.
- Testnet resets can remove deployments (last reset 2025-12-16).

## First Verifications (Do Before Building)

1. `eth_getCode` on the ERC-6551 registry on 10143
2. Reward-pool size and top-up plan for the Stable and Degen vaults
3. Staking precompile / Yield.xyz from a contract account
4. Pyth availability on 10143
5. Privy access email sent; Monad added in dashboard
6. Tokenbound V3 wrap vs native account decision
