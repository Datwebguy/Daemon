// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IStrategyRegistry} from "../src/interfaces/IStrategyRegistry.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockWMON} from "../src/mocks/MockWMON.sol";
import {RewardVault} from "../src/yield/RewardVault.sol";
import {DegenVault} from "../src/yield/DegenVault.sol";
import {StrategyRegistry} from "../src/yield/StrategyRegistry.sol";
import {MockRouter} from "../src/yield/MockRouter.sol";
import {MockOracle} from "../src/yield/MockOracle.sol";
import {DaemonAccount} from "../src/account/DaemonAccount.sol";
import {DaemonHub} from "../src/DaemonHub.sol";
import {MockChog} from "../src/chog/MockChog.sol";
import {TraitPolicy} from "../src/chog/TraitPolicy.sol";

/// @notice Shared deployment logic for the Monad testnet script and the integration tests.
/// The caller is responsible for broadcasting (script) or pranking (tests) as `deployer`.
abstract contract DaemonDeploy {
    address internal constant ERC6551_REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    bytes32 internal constant DAEMON_SALT = bytes32(0); // DaemonHub.accountOf assumes salt 0
    uint256 internal constant DEGEN_EPOCH = 2 hours;

    struct Params {
        address deployer;
        uint256 wmonLiquidity; // MON wrapped into the WMON/dUSD pool (deployer must hold it)
        uint256 stableRewards; // DMNR streamed by StableVault
        uint256 degenRewards; // DMNR streamed by DegenVault
        uint256 rewardDuration; // seconds the reward budget is meant to last
        uint256 sourceCap; // max dUSD per Daemon per vault
    }

    struct Deployment {
        MockERC20 dusd;
        MockERC20 dmnr;
        MockERC20 chogToken;
        MockWMON wmon;
        MockOracle oracle;
        MockRouter router;
        TraitPolicy traitPolicy;
        StrategyRegistry registry;
        RewardVault stableVault;
        DegenVault degenVault;
        DaemonAccount implementation;
        MockChog chog;
        DaemonHub hub;
    }

    function _defaultParams(address deployer) internal pure returns (Params memory) {
        return Params({
            deployer: deployer,
            wmonLiquidity: 2 ether,
            // Emissions are fixed per vault and shared by all depositors, so yield per dUSD falls as TVL grows.
            // These sizes (DMNR at $0.5) give believable play-money returns for a few dozen testers.
            stableRewards: 1_000e18,
            degenRewards: 3_000e18,
            rewardDuration: 30 days,
            sourceCap: 1_000_000e18
        });
    }

    /// @dev Testnet tuning. Short cooldowns so the full flow can be shown in minutes.
    function _config(Deployment memory d) internal pure returns (IStrategyRegistry.Config memory c) {
        c.asset = address(d.dusd);
        c.wmon = address(d.wmon);
        c.chog = address(d.chogToken);
        c.router = address(d.router);
        c.oracle = address(d.oracle);
        c.traitPolicy = address(d.traitPolicy);
        c.compoundCooldown = 10 minutes;
        c.bountyStartBps = 500; // 5%
        c.bountyMaxBps = 1000; // 10%
        c.bountyRampSeconds = 1 days;
        c.maxSlippageBps = 300; // 3%: testnet pools are shallow
        c.gasReimbursementCap = 1e18; // 1 dUSD
        c.boostDuration = 3 hours;
        c.boostStepBps = 500; // +0.05x per hype
        c.maxBoostBps = 2500; // up to 1.25x
        c.hypeCooldownPerUser = 1 hours;
        c.hypeCooldownPerDaemon = 5 minutes;
        c.minHypeMon = 0.01 ether;
        c.minHypeChog = 10e18;
        c.neglectAfter = 3 days;
    }

    function _deployDaemon(Params memory p) internal returns (Deployment memory d) {
        // tokens
        d.dusd = new MockERC20("Daemon USD", "dUSD", 18);
        d.dmnr = new MockERC20("Daemon Reward", "DMNR", 18);
        d.chogToken = new MockERC20("Test CHOG Token", "tCHOGT", 18);
        d.wmon = new MockWMON();

        // prices (USD per whole token, 1e18): testnet stand-in for Pyth
        d.oracle = new MockOracle(p.deployer);
        d.oracle.setPrice(address(d.dusd), 1e18);
        d.oracle.setPrice(address(d.dmnr), 0.5e18);
        d.oracle.setPrice(address(d.wmon), 1e18);
        d.oracle.setPrice(address(d.chogToken), 0.01e18);

        // pools at oracle-consistent ratios
        d.router = new MockRouter();
        _seedPool(d, p.deployer, address(d.dmnr), 2_000_000e18, 1_000_000e18);
        _seedPool(d, p.deployer, address(d.chogToken), 10_000_000e18, 100_000e18);
        if (p.wmonLiquidity > 0) {
            d.wmon.deposit{value: p.wmonLiquidity}();
            d.dusd.mint(p.deployer, p.wmonLiquidity);
            d.wmon.approve(address(d.router), p.wmonLiquidity);
            d.dusd.approve(address(d.router), p.wmonLiquidity);
            d.router.addLiquidity(address(d.wmon), address(d.dusd), p.wmonLiquidity, p.wmonLiquidity);
        }

        d.traitPolicy = new TraitPolicy();
        d.registry = new StrategyRegistry(_config(d), p.deployer, 0);

        // yield sources
        d.stableVault = new RewardVault(d.dusd, d.dmnr, p.deployer, "Daemon Stable Vault", "dSTABLE", "Stable");
        d.degenVault = new DegenVault(d.dusd, d.dmnr, p.deployer, "Daemon Degen Vault", "dDEGEN", "Degen", DEGEN_EPOCH); // 30 days / 2h = 360 epochs (max 500)
        d.registry.queueSource(address(d.stableVault), p.sourceCap);
        d.registry.queueSource(address(d.degenVault), p.sourceCap);
        d.registry.activateSource(address(d.stableVault));
        d.registry.activateSource(address(d.degenVault));
        _fundRewards(d.dmnr, d.stableVault, p.deployer, p.stableRewards, p.rewardDuration);
        _fundRewards(d.dmnr, d.degenVault, p.deployer, p.degenRewards, p.rewardDuration);

        // accounts + NFT
        d.implementation = new DaemonAccount(address(d.registry));
        d.chog = new MockChog(3, 10_000);
        d.chog.setDaemon(ERC6551_REGISTRY, address(d.implementation), DAEMON_SALT);
        d.hub = new DaemonHub();
    }

    function _seedPool(Deployment memory d, address deployer, address token, uint256 tokenAmount, uint256 dusdAmount)
        private
    {
        MockERC20(token).mint(deployer, tokenAmount);
        d.dusd.mint(deployer, dusdAmount);
        MockERC20(token).approve(address(d.router), tokenAmount);
        d.dusd.approve(address(d.router), dusdAmount);
        d.router.addLiquidity(token, address(d.dusd), tokenAmount, dusdAmount);
    }

    function _fundRewards(MockERC20 dmnr, RewardVault vault, address deployer, uint256 amount, uint256 duration)
        private
    {
        dmnr.mint(deployer, amount);
        dmnr.approve(address(vault), amount);
        vault.notifyRewardAmount(amount, duration);
    }
}
