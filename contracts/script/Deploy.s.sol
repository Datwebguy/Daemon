// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DaemonDeploy} from "./DaemonDeploy.sol";

/// @notice Deploys the full Daemon stack to Monad Testnet (10143).
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_KEY
/// Optional env: WMON_LIQUIDITY (wei, default 2 MON), STABLE_REWARDS, DEGEN_REWARDS, REWARD_DURATION,
///               DRIP_AMOUNT (default 0.5 MON), DRIP_DAILY_LIMIT (default 50), DRIP_FUNDING (default 5 MON),
///               DRIP_RELAYER (address allowed to trigger gifts; default the deployer), RELAYER_GAS (default 0.2 MON).
/// Writes addresses to deployments/monad-testnet.json.
contract Deploy is Script, DaemonDeploy {
    function run() external {
        require(ERC6551_REGISTRY.code.length > 0, "ERC-6551 registry missing on this chain");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        Params memory p = _defaultParams(deployer);
        p.wmonLiquidity = vm.envOr("WMON_LIQUIDITY", p.wmonLiquidity);
        p.stableRewards = vm.envOr("STABLE_REWARDS", p.stableRewards);
        p.degenRewards = vm.envOr("DEGEN_REWARDS", p.degenRewards);
        p.rewardDuration = vm.envOr("REWARD_DURATION", p.rewardDuration);
        p.dripAmount = vm.envOr("DRIP_AMOUNT", p.dripAmount);
        p.dripDailyLimit = vm.envOr("DRIP_DAILY_LIMIT", p.dripDailyLimit);
        p.dripFunding = vm.envOr("DRIP_FUNDING", p.dripFunding);
        p.dripRelayer = vm.envOr("DRIP_RELAYER", p.dripRelayer); // address of the app's relayer wallet
        p.relayerGas = vm.envOr("RELAYER_GAS", p.relayerGas);
        // DegenVault allows at most 500 epochs (2h each) per reward period.
        require(p.rewardDuration > 0 && p.rewardDuration / DEGEN_EPOCH <= 500, "REWARD_DURATION must be <= 1000 hours");
        Deployment memory d = _deployDaemon(p);
        vm.stopBroadcast();

        _write(d, deployer);
    }

    function _write(Deployment memory d, address deployer) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "deployer", deployer);
        vm.serializeAddress(k, "erc6551Registry", ERC6551_REGISTRY);
        vm.serializeBytes32(k, "daemonSalt", DAEMON_SALT);
        vm.serializeAddress(k, "dusd", address(d.dusd));
        vm.serializeAddress(k, "dmnr", address(d.dmnr));
        vm.serializeAddress(k, "chogToken", address(d.chogToken));
        vm.serializeAddress(k, "wmon", address(d.wmon));
        vm.serializeAddress(k, "oracle", address(d.oracle));
        vm.serializeAddress(k, "router", address(d.router));
        vm.serializeAddress(k, "traitPolicy", address(d.traitPolicy));
        vm.serializeAddress(k, "strategyRegistry", address(d.registry));
        vm.serializeAddress(k, "stableVault", address(d.stableVault));
        vm.serializeAddress(k, "degenVault", address(d.degenVault));
        vm.serializeAddress(k, "daemonAccountImpl", address(d.implementation));
        vm.serializeAddress(k, "mockChog", address(d.chog));
        vm.serializeAddress(k, "welcomeDrip", address(d.drip));
        vm.serializeAddress(k, "chogRealTraits", address(d.realTraits));
        string memory json = vm.serializeAddress(k, "daemonHub", address(d.hub));
        vm.writeJson(json, string.concat("./deployments/", block.chainid == 10143 ? "monad-testnet" : vm.toString(block.chainid), ".json"));
        console2.log("Daemon deployed. MockChog:", address(d.chog));
    }
}
