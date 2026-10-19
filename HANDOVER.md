# Handover & Submission – Daemon

## Before You Build (Verifications)

1. `eth_getCode` on the ERC-6551 registry on chain 10143
2. Plan the reward pool for our Stable and Degen vaults: how much, how fast it streams, who tops it up
3. Staking precompile (`0x1000`) / Yield.xyz callable from a contract account
4. Pyth price feeds and Entropy available on 10143
5. Email monad@privy.io for testnet access; add Monad (10143) in the Privy dashboard
6. Decide Tokenbound V3 wrap vs native `DaemonAccount`
7. Confirm Chogathon deadline and mock-Chog rule in Discord

## Deployment Runbook (Monad Testnet)

1. Deploy everything with one command (deployer needs ~8 MON: ~5.2 gas + 2 for the WMON pool):
   `cd contracts && forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_KEY`
   This deploys test tokens, oracle, router + pools, `TraitPolicy`, `StrategyRegistry`, `StableVault`, `DegenVault`, the `DaemonAccount` implementation, `MockChog` (linked to the canonical ERC-6551 registry) and `DaemonHub`, funds both reward pools, and writes `contracts/deployments/monad-testnet.json`. Testnet parameters live in `script/DaemonDeploy.sol`.  
2. Register adapters (timelock set short on testnet)  
3. Record all addresses  
4. Verify contracts on MonadVision / Monadscan  
5. Start the indexer (Envio or Goldsky) for `Compounded`, `DaemonUpdate`, `Hyped`, `BoostApplied`  
6. Optionally run the reference keeper (`keeper/`) so Daemons compound even when no one else does  
7. Update `frontend/.env.local`:

```
NEXT_PUBLIC_CHAIN_ID=10143
NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_REGISTRY=0x000000006551c19487814612e58FE06813775758
NEXT_PUBLIC_DAEMON_ACCOUNT_IMPL=...
NEXT_PUBLIC_STRATEGY_REGISTRY=...
NEXT_PUBLIC_DAEMON_HUB=...
NEXT_PUBLIC_MOCK_CHOG=...
NEXT_PUBLIC_PRIVY_APP_ID=...
NEXT_PUBLIC_INDEXER_URL=...
```

8. `npm run build` and deploy frontend (Vercel or similar)

## Testnet Operations

- Testnet was reset from genesis on 2025-12-16. After any reset, redeploy and re-verify all addresses.
- Keep a funded wallet for the reference keeper; bounties refund its gas.
- Tune bounty parameters (start %, cap, rise rate) from measured gas costs.

## 2-Minute Demo Video Script

1. "Daemon turns your Chog into a yield-earning account that anyone can compound and anyone can hype."  
2. Sign in with email → mint test Chog.  
3. Show inspector: ERC-6551 address, traits, mood, adapters.  
4. Deposit into an adapter.  
5. A second wallet hypes the Daemon → mood changes, boost pot fills.  
6. Anyone clicks Compound → caller earns the bounty, new message appears.  
7. Show the feed / leaderboard and the Chog image on a marketplace reflecting its mood.  
8. Owner sweeps everything back to wallet.  
9. "The NFT is the master key. Transfer it and everything follows. Nobody runs this for you."

## Final Submission Checklist

- [ ] Working demo link  
- [ ] ≤3 min video  
- [ ] Public GitHub repo  
- [ ] Clear "Why Chog matters" answer  
- [ ] Testing instructions for judges  
- [ ] All tests passing  
- [ ] No secrets committed  
