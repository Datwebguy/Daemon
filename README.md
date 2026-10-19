# Daemon (0xDaemon)

Turn passive Chog NFTs into autonomous, yield-generating asset managers with a living personality on Monad.

**Core thesis**: ERC-6551 token-bound accounts + a pluggable yield-adapter layer + permissionless, incentivized compounding + a social "Hype Your Daemon" personality layer.

Daemon is a multi-user, decentralized platform. Nobody operates it on holders' behalf: no executor, no session keys, no admin that can touch funds. Anyone can trigger compounding and earns a bounty for doing so. The product runs on **Monad Testnet (Chain ID 10143)**.

## Architecture (High Level)

```
Chog NFT (ERC-721)
   │
   ▼
ERC-6551 Registry (canonical, deployed on Monad) ──► DaemonAccount (CREATE2)
                                                        │
                                  ┌─────────────────────┼──────────────────────┐
                                  ▼                     ▼                      ▼
                          Strategy Registry      Hype / Mood / Boost      Dynamic tokenURI
                          (yield adapters)       (+ per-Daemon boost pot)  (mood, boost, yield)
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
     StableVault (ours)  DegenVault (ours)   staking (optional)
        (each implements IYieldSource; the Daemon holds the shares)

compound()  ◄── anyone (owner, friend, keeper bot) ── earns a bounty from the harvest
Events ──► Indexer ──► feed + leaderboard
```

### How automation works (no keys, no operator)
- `compound()` on each Daemon is **public**. Anyone can call it: the owner, a friend, or a keeper bot someone else runs.
- The contract enforces safety on-chain: only registered adapters, a cooldown, a minimum-profit threshold, slippage limits, and funds can only return to the same account.
- The caller earns a **bounty** (gas reimbursement + a share of the harvest, rising the longer a Daemon waits, capped). That is the only incentive needed.
- A `DaemonHub` helper can compound many Daemons in one transaction so the bounty covers gas.
- We publish an open-source reference keeper script. It is one keeper among many, not a requirement.

### Yield is pluggable
Each Daemon allocates to **yield sources** (ERC-4626 vaults with a separate reward stream, see `IYieldSource`). Aave and Morpho are not on Monad testnet, so we deploy our own: a low-rate **StableVault** and a high-rate, variable **DegenVault**. The Daemon account holds its vault shares itself. The owner chooses; the registry restricts which sources exist.

## Monorepo Layout

```
daemon/
├── contracts/          # Foundry
│   ├── src/            # DaemonAccount, StrategyRegistry, adapters, DaemonHub, MockChog
│   ├── test/
│   └── script/
├── frontend/           # Next.js App Router
│   ├── app/
│   ├── components/
│   └── lib/
├── keeper/             # optional open-source reference keeper (Node + viem)
├── indexer/            # Envio HyperIndex project (feed + leaderboard)
├── README.md
├── HACKATHON.md
├── PRODUCT.md
├── PRJ.md
├── AGENT.md
├── PROMPT.md
├── TOOLS.md
├── RESOURCES.md
├── SECURITY.md
└── HANDOVER.md
```

## Quickstart

```bash
# Clone with libraries (forge-std, OpenZeppelin are git submodules)
git clone --recurse-submodules https://github.com/Datwebguy/Daemon.git

# Contracts
cd contracts
forge test
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_KEY   # needs ~8 MON
node script/export-abis.mjs        # regenerate frontend + keeper ABIs after contract changes

# Frontend
cd frontend
cp .env.example .env.local
# Fill NEXT_PUBLIC_RPC_URL, contract addresses, Privy app id
npm install
npm run dev
```

Network: Monad Testnet (Chain ID 10143). Faucet: https://faucet.monad.xyz

## Quick tour

1. Sign in (Privy email/social, or connect a wallet) → Monad Testnet
2. Mint Test Chog (or use existing)
3. Inspect Chog → deterministic ERC-6551 address, traits, balances, mood
4. Pick a yield adapter and deposit
5. Hype a Daemon (yours or anyone's) with a small amount of MON or $CHOG → mood updates, boost starts. $CHOG gives a bigger, longer boost and burns 10%; "Feeling lucky?" adds a Pyth Entropy roll with a chance at a maxed, longer boost
6. Click Compound → harvest → swap → restake runs, the caller earns the bounty, a new message appears
7. Hit "Sweep All to My Wallet" to prove non-custodial exit
8. Share performance card

## The Frontend

- **Landing page (`/`)**: an animated Daemon hero, the six-step story, a moods gallery, a live tip calculator, FAQ and footer.
- **App (`/app`, `/daemon/[id]`, `/explore`, `/feed`)**: a plain-language interface with no technical wording. Your den lists your Chogs with a getting-started checklist; each Daemon page has Harvest, Hype and Vaults tabs, a share card, and a one-tap "take everything out". `?tab=hype` and `?tab=vaults` deep-link to a tab.
- **Real Chog art on testnet.** The testnet "Chog Genesis (Testnet)" contract gives every mint one of the 1,969 real Chog Genesis artworks. `tokenURI` is on-chain JSON: the real image (IPFS), the real traits (Tier, Head, Eyes, Accessory, ...) and the live Daemon state (mood, boost, savings). The mood-aware, on-chain-drawn version lives in `livingURI`. These are not the real NFTs; they are testnet copies that carry the real artwork.
- **Practice mode** (`/practice`): a no-sign-in sandbox Daemon with pretend money. Same rules as the contracts (tip ramps 5% to 10%, a boost is paid only from the hype jar, same mood priorities); time moves when you fast-forward.
- Design notes: Bagel Fat One and Onest type, a white-based palette with pink, butter, sky and lilac washes (light by default, dark available), sticker-style panels, draggable stickers, no mascot and no emoji (the Chogs give the expressions: each mood maps to real Chogs whose eyes, mouth and head fit it, see frontend/lib/chogFaces.ts), a plain text wordmark until a logo is chosen, and Unsplash wallpapers (credited in the footer).

## Core Features

- **Welcome MON**: a brand-new wallet gets a little free MON once (`WelcomeDrip`), so the first visit never starts at a faucet. The limits (one claim per wallet and one per signed-in account, only near-empty wallets, a daily cap) are enforced by the contract; the app's relayer only pays gas
- **$CHOG is the better way to hype**: a $CHOG hype adds +0.10x for 4h (MON: +0.05x for 3h) and 10% of it is burned
- **Lucky hype**: a MON hype plus a Pyth Entropy roll. The hype applies at once; when the number arrives, a critical roll (1 in 5) maxes the boost and extends it. The boost is still paid only from the jar
- **Marketplace metadata**: `tokenURI` is on-chain JSON with the real Chog Genesis image, the real traits (all 1,969 packed on-chain and verified) and the live state of the Daemon. `livingURI` is the fully drawn mood image
- **Needs-you badges** on den cards, **Post on X** on the share card, and a **quick start** page at `/start`

- ERC-6551 token-bound account per Chog (canonical registry)
- Pluggable yield adapters behind a strategy registry
- Permissionless `compound()` with a caller bounty; batch compounding
- **Anyone can hype any Daemon** (cooldowns + boost cap); hype payments fund the boost pot
- Mood from real inputs: yield performance, one trait bias, optional Pyth price/randomness
- Dynamic on-chain `tokenURI` so the Chog shows its state on marketplaces
- Indexed message feed and leaderboard
- 1-click sweep to owner; everything follows the NFT on transfer
- Ownership-cycle guard (an account can never own its own NFT)

## Monad Testnet Facts That Shape the Design

- Gas is charged on the gas **limit**, not gas used. Set tight limits on multicalls.
- `block.timestamp` has 1-second granularity (3–4 blocks share a value). Order history by block number + log index.
- Public `eth_getLogs` is capped at 100–1,000 blocks → use an indexer.
- EIP-7702 delegated accounts keep a 10 MON reserve and cannot CREATE/CREATE2 → use contract accounts.
- Testnet was reset from genesis on 2025-12-16. Re-check deployments after any reset.

See TOOLS.md for tools, PRJ.md for the technical design, RESOURCES.md for links.
