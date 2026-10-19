# Resources – Daemon / Chogathon

## Official Hackathon
- Main site: https://chogathon.chog.xyz/
- Apply: https://chogathon.chog.xyz/apply
- Dev Community (Discord): https://discord.gg/chog

### Key Rules (from the site)
- NFT must be essential — if you remove the Chog NFT, the experience should break or meaningfully change (pass/fail gate).
- Judging weights: Novelty 30%, Fun 20%, Retention 20%, Clarity 15%, Execution 15%, $CHOG integration = bonus.
- Deliverables include a working demo, ≤3 min video, repo, and clear explanation of why the Chog NFT matters.
- Prize pool: $15K (can be reduced to $10K). Top 50 projects win. 14 days to build, 7 days of judging.
- Status unclear as of 2026-10-18: dates were blank on the site. Check Discord.

## Monad Testnet (our target)
- Chain ID: 10143
- Currency: MON
- Status: active; reset from genesis 2025-12-16; node v0.16.x
- RPC: https://testnet-rpc.monad.xyz (or https://rpc.ankr.com/monad_testnet)
- Faucet: https://faucet.monad.xyz
- Testnet Hub: https://testnet.monad.xyz
- Docs: https://docs.monad.xyz
- Protocol addresses repo: https://github.com/monad-crypto/protocols
- Explorers: MonadVision (Sourcify verification), https://testnet.monadscan.com, https://testnet.monadexplorer.com
- `eth_getLogs` is capped at 100–1,000 blocks on public RPCs. Use an indexer.
- About 19 commercial RPC providers are listed in the docs.

## Chog Contracts & Links
- $CHOG token: `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777`
- Chog Genesis NFT (main collection): `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` (no independent source found; verify on the explorer)
- Chog website: https://chog.xyz/ (tools: Swap, PFP Maker, Snapshoter, Messenger)
- X: @ChogNFT
- Build / consumer layer: https://build.chog.xyz/ (no SDK or API; "apps built on Chog" coming soon)

## Canonical Contracts (docs claim; verify with `eth_getCode`)
- ERC-6551 registry: `0x000000006551c19487814612e58FE06813775758` (Tokenbound V3 stack; cross-chain execution not enabled)
- EntryPoint v0.6 `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`
- EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
- EntryPoint v0.8 `0x4337084d9e255fF0702461CF8895cE9E3b5Ff108`
- EntryPoint v0.9 `0x433709009B8330FDa32311DF1C2AFA402eD8D009`
- ERC-6492 UniversalSigValidator `0xdAcD51A54883eb67D95FAEb2BBfdC4a9a6BD2a3B`
- Also documented: Multicall3, Permit2, Safe, SimpleAccount, CreateX

## Yield Protocols
- Aave and Morpho are not on Monad testnet (mainnet only), so Daemon deploys its own ERC-4626 yield vaults on testnet.
- Reference only: Aave on Monad mainnet https://governance.aave.com/t/arfc-deploy-aave-protocol-v3-7-on-monad/24943 · Morpho addresses https://docs.morpho.org/get-started/resources/addresses/
- OpenZeppelin ERC4626: https://docs.openzeppelin.com/contracts/5.x/erc4626
- Monad Earn/Yield providers: https://docs.monad.xyz/tooling-and-infra/earn-yield (Yield.xyz, Vaults.fyi, Veda, Pods, Blend)
- Monad staking precompile: `0x1000`

## Tools & Providers
See TOOLS.md. Key docs:
- Privy: https://docs.privy.io (Monad testnet subsidized; monad@privy.io)
- Monad embedded wallets: https://docs.monad.xyz/tooling-and-infra/wallet-infra/embedded-wallets
- Pimlico (optional): https://docs.pimlico.io/guides/supported-chains (`monad-testnet`)
- Tokenbound: `@tokenbound/sdk` (viem ≥ 2.40, pass the `monad` chain object)

## Oracles & Randomness
- Listed on Monad: Chainlink, Chronicle, Pyth, RedStone, Stork, Supra
- Randomness: Pyth Entropy, Supra dVRF (Gelato VRF testnet only); Chainlink VRF does not list Monad

## Reference Platforms (design lessons)
- Beefy strategy contract: https://docs.beefy.finance/developer-documentation/strategy-contract
- Yearn vault factory: https://docs.yearn.fi/developers/v2/vault-factory
- Convex incentivized harvesting: https://docs.originprotocol.com/guides/incentivized-harvesting-guide
- Arrakis vault core: https://github.com/ArrakisFinance/vault-v1-core
- Aavegotchi kinship/petting: https://www.coingecko.com/learn/how-to-play-aavegotchi-beginners-guide
- Tokenbound FAQ: https://docs.tokenbound.org/faq

## Libraries
- Foundry (v1.8.0+), OpenZeppelin Contracts
- Viem + Wagmi
- ERC-6551 reference implementations (Tokenbound, Future Primitive)

## Extra Notes
- You do not need to already hold a Chog NFT to participate (reported as confirmed by the team). Use a mock/test Chog on testnet. Re-confirm in Discord.
- There's a vibe partnership for extra WL spots if you also launch on their testnet.
- For deeper technical details or last-minute updates, the Discord is the best place.
- Full research: `reports/Monad ecosystem tools for Daemon.md`
