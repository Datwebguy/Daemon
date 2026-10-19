# Daemon Contracts

Foundry project for Daemon on Monad Testnet (10143). See the root README and PRJ.md for the design.

```bash
forge build
forge test                       # unit + integration tests
forge script script/Deploy.s.sol --rpc-url monad_testnet                       # dry run
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_KEY
node script/export-abis.mjs      # regenerate frontend + keeper ABIs
```

| Folder | Contents |
|---|---|
| `src/interfaces/` | Shared interfaces (IDaemonAccount, IYieldSource, IStrategyRegistry, IDaemonRouter, IChog, IERC6551) |
| `src/account/` | `DaemonAccount`: the ERC-6551 account (compound, hype, sweep, mood) |
| `src/DaemonHub.sol` | Stateless batch compounding |
| `src/yield/` | `RewardVault` (Stable), `DegenVault`, `StrategyRegistry`, `MockRouter`, `MockOracle` |
| `src/chog/` | `MockChog` (mint, traits, on-chain living image), `ChogArt`, `ChogText`, `TraitPolicy` |
| `src/mocks/` | Test tokens (`MockERC20`, `MockWMON`) |
| `src/vendor/` | Port of the canonical ERC-6551 registry (tests only; the real one is at `0x000000006551c19487814612e58FE06813775758`) |
| `script/` | `DaemonDeploy.sol` (shared deploy logic + testnet parameters), `Deploy.s.sol`, `export-abis.mjs` |
