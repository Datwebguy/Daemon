// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {DaemonBase} from "./DaemonBase.t.sol";
import {DaemonAccount} from "../../src/account/DaemonAccount.sol";
import {DaemonHub} from "../../src/DaemonHub.sol";
import {IDaemonAccount} from "../../src/interfaces/IDaemonAccount.sol";
import {IStrategyRegistry} from "../../src/interfaces/IStrategyRegistry.sol";

contract DaemonAccountHypeTest is DaemonBase {
    function setUp() public override {
        super.setUp();
        vm.txGasPrice(0);
    }

    // ---------------------------------------------------------------- hype

    function testFuzz_anyoneCanHype(address hyper, uint96 amount) public {
        vm.assume(hyper != address(0) && hyper.code.length == 0 && uint160(hyper) > 0xff);
        amount = uint96(bound(amount, 0.01 ether, 1_000 ether));
        vm.deal(hyper, amount);

        vm.expectEmit(true, true, false, true, address(acct));
        emit IDaemonAccount.Hyped(1, hyper, address(0), amount);
        vm.expectEmit(true, false, false, true, address(acct));
        emit IDaemonAccount.BoostApplied(1, 10_500, block.timestamp + 3 hours);
        vm.prank(hyper);
        acct.hype{value: amount}();

        (uint256 mult, uint256 exp, uint256 potMon, uint256 potChog) = acct.getBoost();
        assertEq(mult, 10_500);
        assertEq(exp, block.timestamp + 3 hours);
        assertEq(potMon, amount);
        assertEq(potChog, 0);
        assertEq(address(acct).balance, amount);
        assertEq(acct.lastActivityAt(), block.timestamp);
        assertEq(acct.lastHypeBy(hyper), block.timestamp);
    }

    function test_hyperCannotExtract() public {
        _hype(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(DaemonAccount.NotOwner.selector);
        acct.sweepToOwner();
        vm.prank(bob);
        vm.expectRevert(DaemonAccount.NotOwner.selector);
        acct.execute(bob, 1 ether, "", 0);
        assertEq(address(acct).balance, 1 ether);
    }

    function test_hypeBelowMinReverts() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.HypeTooSmall.selector, 0.009 ether, 0.01 ether));
        acct.hype{value: 0.009 ether}();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.HypeTooSmall.selector, 0, 0.01 ether));
        acct.hype();

        chog.mint(bob, 100e18);
        vm.startPrank(bob);
        chog.approve(address(acct), 100e18);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.HypeTooSmall.selector, 9e18, 10e18));
        acct.hypeWithChog(9e18);
        vm.stopPrank();
    }

    function test_hypeWithChogPullsTokens() public {
        chog.mint(bob, 15e18);
        vm.startPrank(bob);
        chog.approve(address(acct), 15e18);
        vm.expectEmit(true, true, false, true, address(acct));
        emit IDaemonAccount.Hyped(1, bob, address(chog), 15e18);
        acct.hypeWithChog(15e18);
        vm.stopPrank();
        assertEq(chog.balanceOf(address(acct)), 15e18);
        (uint256 mult,,, uint256 potChog) = acct.getBoost();
        assertEq(potChog, 15e18);
        assertEq(mult, 10_500);
    }

    function test_hypeWithChogDisabled() public {
        IStrategyRegistry.Config memory c = strategy.config();
        c.chog = address(0);
        strategy.setConfig(c);
        vm.expectRevert(DaemonAccount.ChogDisabled.selector);
        acct.hypeWithChog(10e18);
    }

    function test_perUserCooldown() public {
        _hype(bob, 0.01 ether);
        uint256 t0 = block.timestamp;
        vm.warp(t0 + 10 minutes); // daemon cooldown over
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.HypeUserCooldown.selector, t0 + 4 hours));
        acct.hype{value: 0.01 ether}();

        _hype(carol, 0.01 ether); // a different hyper is fine

        vm.warp(t0 + 4 hours);
        _hype(bob, 0.01 ether);
    }

    function test_perDaemonCooldown() public {
        _hype(bob, 0.01 ether);
        uint256 t0 = block.timestamp;
        vm.deal(carol, 1 ether);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.HypeDaemonCooldown.selector, t0 + 10 minutes));
        acct.hype{value: 0.01 ether}();

        // the cooldown is per Daemon: another Daemon can be hyped right away
        nft.mint(alice, 2);
        DaemonAccount other = _createAccount(2);
        vm.prank(carol);
        other.hype{value: 0.01 ether}();

        vm.warp(t0 + 10 minutes);
        _hype(carol, 0.01 ether);
    }

    function test_multiplierCap() public {
        for (uint256 i; i < 8; ++i) {
            _hype(address(uint160(0xBEEF00 + i)), 0.01 ether);
            vm.warp(block.timestamp + 10 minutes);
        }
        (uint256 mult,,,) = acct.getBoost();
        assertEq(mult, 12_500, "capped at 1x + maxBoostBps");
    }

    function test_boostExpiryAndReset() public {
        _hype(bob, 0.01 ether);
        vm.warp(block.timestamp + 10 minutes);
        _hype(carol, 0.01 ether);
        (uint256 mult, uint256 exp,,) = acct.getBoost();
        assertEq(mult, 11_000);
        assertEq(exp, block.timestamp + 3 hours, "each hype extends");

        vm.warp(exp);
        (mult,,,) = acct.getBoost();
        assertEq(mult, 10_000, "expired");

        _hype(keeper, 0.01 ether);
        (mult,,,) = acct.getBoost();
        assertEq(mult, 10_500, "restarts at 1x + step");
    }

    // ---------------------------------------------------------------- mood

    function _compoundWith(uint256 rewardAmount) internal {
        vm.warp(acct.nextCompoundAt() > block.timestamp ? acct.nextCompoundAt() : block.timestamp);
        _pend(rewardAmount);
        acct.compound(keeper);
    }

    function test_moodFreshIsChillOrBias() public {
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Chill));
        IStrategyRegistry.Config memory c = strategy.config();
        c.traitPolicy = address(policy);
        strategy.setConfig(c);
        policy.setBias(uint8(IDaemonAccount.Mood.Chaotic));
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Chaotic));
        policy.setBias(42); // invalid -> Chill
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Chill));
    }

    function test_moodSmugAfterCompound() public {
        _compoundWith(10e18);
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Smug));
        _compoundWith(10e18); // equal profit is still smug
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Smug));
        _compoundWith(15e18);
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Smug));
    }

    function test_moodChaoticOnVariance() public {
        _compoundWith(10e18);
        _compoundWith(4e18); // dropped by more than half
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Chaotic));
        _compoundWith(9e18); // more than doubled
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Chaotic));
    }

    function test_moodBiasWhenProfitDownSlightly() public {
        IStrategyRegistry.Config memory c = strategy.config();
        c.traitPolicy = address(policy);
        strategy.setConfig(c);
        policy.setBias(uint8(IDaemonAccount.Mood.Flexing));
        _compoundWith(10e18);
        _compoundWith(8e18);
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Flexing), "trait bias");
    }

    function test_moodFlexingWhenBoostedAndUp() public {
        _compoundWith(10e18);
        _hype(bob, 0.01 ether);
        _compoundWith(12e18);
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Flexing));
    }

    function test_moodChaoticAtMaxBoost() public {
        for (uint256 i; i < 5; ++i) {
            _hype(address(uint160(0xBEEF00 + i)), 0.01 ether);
            vm.warp(block.timestamp + 10 minutes);
        }
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Chaotic));
    }

    function test_moodNeglectToTired() public {
        _compoundWith(10e18);
        vm.warp(block.timestamp + 3 days);
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Smug), "exactly at threshold");
        vm.warp(block.timestamp + 1);
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Tired));
        _hype(bob, 0.01 ether); // hype revives
        assertTrue(acct.getMood() != IDaemonAccount.Mood.Tired);
    }

    function test_messagesFromPool() public {
        _hype(bob, 0.01 ether);
        string memory m1 = acct.lastMessage();
        assertGt(bytes(m1).length, 0);
        vm.warp(block.timestamp + 3 hours + 1); // boost over, then compound -> Smug message
        _compoundWith(10e18);
        string memory m2 = acct.lastMessage();
        assertGt(bytes(m2).length, 0);
        assertTrue(keccak256(bytes(m1)) != keccak256(bytes(m2)));
    }

    function test_daemonUpdateEmitted() public {
        vm.warp(acct.nextCompoundAt());
        _pend(10e18);
        vm.recordLogs();
        acct.compound(keeper);
        bytes32 topic = keccak256("DaemonUpdate(uint256,uint8,string,uint256)");
        bool found;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == topic && logs[i].emitter == address(acct)) {
                (uint8 mood, string memory text, uint256 y) = abi.decode(logs[i].data, (uint8, string, uint256));
                assertEq(mood, uint8(IDaemonAccount.Mood.Smug));
                assertEq(text, acct.lastMessage());
                assertEq(y, 19e18);
                found = true;
            }
        }
        assertTrue(found);
    }

    // ---------------------------------------------------------------- hub

    function test_hubBatchWithFailingAccount() public {
        DaemonHub hub = new DaemonHub();
        nft.mint(alice, 2);
        DaemonAccount acct2 = _createAccount(2);
        assertEq(hub.accountOf(CANONICAL_REGISTRY, address(impl), block.chainid, address(nft), 2), address(acct2));

        asset.mint(address(acct2), 100e18);
        vm.prank(alice);
        acct2.allocate(address(sourceA), 100e18);

        vm.warp(acct.nextCompoundAt());
        _pend(10e18);
        sourceA.setPending(address(acct2), 10e18);
        acct2.compound(carol); // acct2 now in cooldown
        sourceA.setPending(address(acct2), 10e18);

        address[] memory list = new address[](3);
        list[0] = address(acct);
        list[1] = address(acct2);
        list[2] = makeAddr("eoa");

        uint256[] memory pend = hub.pendingBounties(list);
        assertEq(pend[0], 1e18);
        assertEq(pend[1], 0);
        assertEq(pend[2], 0);

        vm.prank(keeper);
        DaemonHub.Result[] memory r = hub.compoundMany(list);
        assertTrue(r[0].success);
        assertEq(r[0].profit, 20e18);
        assertEq(r[0].bounty, 1e18);
        assertFalse(r[1].success);
        assertFalse(r[2].success);
        assertEq(asset.balanceOf(keeper), 1e18, "bounty paid straight to the hub caller");
        assertEq(asset.balanceOf(address(hub)), 0);
    }

    function test_hubBatchTooLarge() public {
        DaemonHub hub = new DaemonHub();
        address[] memory list = new address[](51);
        vm.expectRevert(abi.encodeWithSelector(DaemonHub.BatchTooLarge.selector, 51, 50));
        hub.compoundMany(list);
    }
}
