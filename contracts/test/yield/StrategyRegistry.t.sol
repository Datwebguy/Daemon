// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {RewardVault} from "../../src/yield/RewardVault.sol";
import {StrategyRegistry} from "../../src/yield/StrategyRegistry.sol";
import {IStrategyRegistry} from "../../src/interfaces/IStrategyRegistry.sol";

contract StrategyRegistryTest is Test {
    MockERC20 dusd;
    MockERC20 other;
    MockERC20 dmnr;
    RewardVault stable;
    RewardVault wrongAsset;
    StrategyRegistry reg;

    address governor = makeAddr("governor");
    uint256 constant DELAY = 2 days;

    event SourceQueued(address indexed source, uint256 capPerAccount, uint256 eta);
    event SourceActivated(address indexed source, uint256 capPerAccount);

    function _config() internal view returns (IStrategyRegistry.Config memory c) {
        c.asset = address(dusd);
        c.wmon = address(0x1);
        c.chog = address(0x2);
        c.router = address(0x7003);
        c.oracle = address(0x7004);
        c.traitPolicy = address(0x5);
        c.compoundCooldown = 1 hours;
        c.bountyStartBps = 500;
        c.bountyMaxBps = 1000;
        c.bountyRampSeconds = 1 hours;
        c.maxSlippageBps = 100;
        c.gasReimbursementCap = 1e18;
        c.boostDuration = 3 hours;
        c.boostStepBps = 500;
        c.maxBoostBps = 2500;
        c.hypeCooldownPerUser = 1 hours;
        c.hypeCooldownPerDaemon = 5 minutes;
        c.minHypeMon = 0.1 ether;
        c.minHypeChog = 10e18;
        c.neglectAfter = 3 days;
    }

    function setUp() public {
        vm.warp(1_700_000_000);
        dusd = new MockERC20("Daemon USD", "dUSD", 18);
        other = new MockERC20("Other", "OTH", 18);
        dmnr = new MockERC20("Daemon Reward", "DMNR", 18);
        stable = new RewardVault(IERC20(address(dusd)), IERC20(address(dmnr)), address(this), "S", "S", "Stable");
        wrongAsset = new RewardVault(IERC20(address(other)), IERC20(address(dmnr)), address(this), "W", "W", "Stable");
        vm.etch(address(0x7003), hex"00"); // router and oracle must have code
        vm.etch(address(0x7004), hex"00");
        reg = new StrategyRegistry(_config(), governor, DELAY);
    }

    function test_config() public view {
        IStrategyRegistry.Config memory c = reg.config();
        assertEq(c.asset, address(dusd));
        assertEq(c.traitPolicy, address(0x5));
        assertEq(c.bountyMaxBps, 1000);
        assertEq(c.minHypeChog, 10e18);
        assertEq(c.neglectAfter, 3 days);
        assertEq(reg.timelockDelay(), DELAY);
        assertEq(reg.governor(), governor);
        assertEq(reg.sources().length, 0);
    }

    function test_constructor_validates() public {
        IStrategyRegistry.Config memory c = _config();
        vm.expectRevert(StrategyRegistry.ZeroAddress.selector);
        new StrategyRegistry(c, address(0), DELAY);
        c.bountyStartBps = 2000;
        vm.expectRevert(StrategyRegistry.InvalidConfig.selector);
        new StrategyRegistry(c, governor, DELAY);
        c = _config();
        c.asset = address(0);
        vm.expectRevert(StrategyRegistry.ZeroAddress.selector);
        new StrategyRegistry(c, governor, DELAY);
    }

    function test_constructor_rejectsBrickingConfig() public {
        IStrategyRegistry.Config memory c = _config();
        c.bountyMaxBps = 10_000; // bounty would always eat all profit
        vm.expectRevert(StrategyRegistry.InvalidConfig.selector);
        new StrategyRegistry(c, governor, DELAY);

        c = _config();
        c.maxSlippageBps = 5_001;
        vm.expectRevert(StrategyRegistry.InvalidConfig.selector);
        new StrategyRegistry(c, governor, DELAY);

        c = _config();
        c.router = address(0xdead); // no code
        vm.expectRevert(StrategyRegistry.InvalidConfig.selector);
        new StrategyRegistry(c, governor, DELAY);

        c = _config();
        c.oracle = address(0);
        vm.expectRevert(StrategyRegistry.InvalidConfig.selector);
        new StrategyRegistry(c, governor, DELAY);
    }

    function test_constructor_rejectsBadPerks() public {
        IStrategyRegistry.Config memory c = _config();
        c.chogBurnBps = 5_001; // never burn more than half a hype
        vm.expectRevert(StrategyRegistry.InvalidConfig.selector);
        new StrategyRegistry(c, governor, DELAY);

        c = _config();
        c.luckyChanceBps = 10_001;
        vm.expectRevert(StrategyRegistry.InvalidConfig.selector);
        new StrategyRegistry(c, governor, DELAY);

        c = _config();
        c.entropy = address(0xE17); // no code
        c.luckyGasLimit = 100_000;
        vm.expectRevert(StrategyRegistry.InvalidConfig.selector);
        new StrategyRegistry(c, governor, DELAY);

        vm.etch(address(0xE17), hex"00");
        c.luckyGasLimit = 59_999; // too little gas for the callback
        vm.expectRevert(StrategyRegistry.InvalidConfig.selector);
        new StrategyRegistry(c, governor, DELAY);

        c.luckyGasLimit = 60_000;
        c.chogBurnBps = 5_000;
        c.luckyChanceBps = 10_000;
        StrategyRegistry ok = new StrategyRegistry(c, governor, DELAY);
        assertEq(ok.config().entropy, address(0xE17));
    }

    function test_cancelQueued() public {
        vm.prank(governor);
        reg.queueSource(address(stable), 1000e18);
        vm.prank(address(0xbad));
        vm.expectRevert(StrategyRegistry.NotGovernor.selector);
        reg.cancelQueued(address(stable));

        vm.prank(governor);
        reg.cancelQueued(address(stable));
        vm.warp(block.timestamp + DELAY);
        vm.prank(governor);
        vm.expectRevert(StrategyRegistry.NotQueued.selector);
        reg.activateSource(address(stable));

        vm.prank(governor);
        reg.queueSource(address(stable), 1000e18); // can be re-queued after cancel
        vm.prank(governor);
        vm.expectRevert(StrategyRegistry.NotQueued.selector);
        reg.cancelQueued(address(wrongAsset));
    }

    function test_queueAndActivate() public {
        vm.expectEmit(true, false, false, true);
        emit SourceQueued(address(stable), 1000e18, block.timestamp + DELAY);
        vm.prank(governor);
        reg.queueSource(address(stable), 1000e18);
        assertFalse(reg.isApproved(address(stable)));

        vm.warp(block.timestamp + DELAY);
        vm.expectEmit(true, false, false, true);
        emit SourceActivated(address(stable), 1000e18);
        vm.prank(governor);
        reg.activateSource(address(stable));

        assertTrue(reg.isApproved(address(stable)));
        assertEq(reg.capPerAccount(address(stable)), 1000e18);
        assertEq(reg.sources().length, 1);
        assertEq(reg.sources()[0], address(stable));
    }

    function testFuzz_tooEarlyReverts(uint256 wait) public {
        wait = bound(wait, 0, DELAY - 1);
        vm.prank(governor);
        reg.queueSource(address(stable), 1);
        uint256 eta = block.timestamp + DELAY;
        vm.warp(block.timestamp + wait);
        vm.prank(governor);
        vm.expectRevert(abi.encodeWithSelector(StrategyRegistry.TimelockNotElapsed.selector, eta));
        reg.activateSource(address(stable));
    }

    function testFuzz_nonGovernorReverts(address caller) public {
        vm.assume(caller != governor);
        vm.prank(caller);
        vm.expectRevert(StrategyRegistry.NotGovernor.selector);
        reg.queueSource(address(stable), 1);

        vm.prank(governor);
        reg.queueSource(address(stable), 1);
        vm.warp(block.timestamp + DELAY);
        vm.prank(caller);
        vm.expectRevert(StrategyRegistry.NotGovernor.selector);
        reg.activateSource(address(stable));
    }

    function test_wrongAssetReverts() public {
        vm.prank(governor);
        reg.queueSource(address(wrongAsset), 1);
        vm.warp(block.timestamp + DELAY);
        vm.prank(governor);
        vm.expectRevert(abi.encodeWithSelector(StrategyRegistry.AssetMismatch.selector, address(dusd), address(other)));
        reg.activateSource(address(wrongAsset));
    }

    function test_activateUnqueuedReverts() public {
        vm.prank(governor);
        vm.expectRevert(StrategyRegistry.NotQueued.selector);
        reg.activateSource(address(stable));
    }

    function test_queueValidations() public {
        vm.startPrank(governor);
        vm.expectRevert(StrategyRegistry.ZeroAddress.selector);
        reg.queueSource(address(0), 1);
        vm.expectRevert(StrategyRegistry.ZeroCap.selector);
        reg.queueSource(address(stable), 0);
        reg.queueSource(address(stable), 1);
        vm.expectRevert(StrategyRegistry.AlreadyQueued.selector);
        reg.queueSource(address(stable), 2);
        vm.stopPrank();
    }

    function test_cannotRemoveOrRequeue() public {
        vm.prank(governor);
        reg.queueSource(address(stable), 1000e18);
        vm.warp(block.timestamp + DELAY);
        vm.prank(governor);
        reg.activateSource(address(stable));

        // re-queueing (e.g. to change the cap) is rejected; there is no removal function at all
        vm.prank(governor);
        vm.expectRevert(StrategyRegistry.AlreadyApproved.selector);
        reg.queueSource(address(stable), 1);
        // activating again is rejected (not queued)
        vm.prank(governor);
        vm.expectRevert(StrategyRegistry.NotQueued.selector);
        reg.activateSource(address(stable));

        (bool ok,) = address(reg).call(abi.encodeWithSignature("removeSource(address)", address(stable)));
        assertFalse(ok);
        assertTrue(reg.isApproved(address(stable)));
        assertEq(reg.capPerAccount(address(stable)), 1000e18);
        assertEq(reg.sources().length, 1);
    }
}
