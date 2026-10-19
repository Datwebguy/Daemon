// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DaemonBase} from "./DaemonBase.t.sol";
import {DaemonAccount} from "../../src/account/DaemonAccount.sol";
import {IDaemonAccount} from "../../src/interfaces/IDaemonAccount.sol";
import {IStrategyRegistry} from "../../src/interfaces/IStrategyRegistry.sol";
import {MockEntropyV2} from "./mocks/MockEntropyV2.sol";

/// @dev $CHOG hype perks (bigger/longer boost, burn) and lucky hype through Pyth Entropy.
contract DaemonAccountPerksTest is DaemonBase {
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    MockEntropyV2 internal entropy;

    function setUp() public override {
        super.setUp();
        vm.txGasPrice(0);
        entropy = new MockEntropyV2();
        IStrategyRegistry.Config memory c = strategy.config();
        c.chogBoostStepBps = 1000; // +0.10x (MON is +0.05x)
        c.chogBoostDuration = 4 hours; // MON is 3h
        c.chogBurnBps = 1000; // 10%
        c.entropy = address(entropy);
        c.luckyChanceBps = 2000; // 20%
        c.luckyGasLimit = 100_000;
        strategy.setConfig(c);
    }

    function _hypeChog(address who, uint256 amount) internal {
        chog.mint(who, amount);
        vm.startPrank(who);
        chog.approve(address(acct), amount);
        acct.hypeWithChog(amount);
        vm.stopPrank();
    }

    function _hypeLucky(address who, uint256 hypeAmount) internal returns (uint64 seq) {
        uint256 value = hypeAmount + entropy.fee();
        vm.deal(who, value);
        seq = entropy.nextSequence();
        vm.prank(who);
        acct.hypeLucky{value: value}();
    }

    /// @dev A random number that is critical (< 20% of 10_000) or not.
    function _critical() internal pure returns (bytes32) {
        return bytes32(uint256(10_000 * 7 + 1999)); // % 10_000 = 1999
    }

    function _plain() internal pure returns (bytes32) {
        return bytes32(uint256(10_000 * 7 + 2000)); // % 10_000 = 2000
    }

    // ------------------------------------------------------------- $CHOG perks

    function test_chogHypeBurnsShareAndFundsPot() public {
        chog.mint(bob, 100e18);
        vm.startPrank(bob);
        chog.approve(address(acct), 100e18);
        vm.expectEmit(true, true, false, true, address(acct));
        emit IDaemonAccount.ChogBurned(1, bob, 10e18);
        vm.expectEmit(true, true, false, true, address(acct));
        emit IDaemonAccount.Hyped(1, bob, address(chog), 90e18);
        acct.hypeWithChog(100e18);
        vm.stopPrank();

        assertEq(chog.balanceOf(DEAD), 10e18);
        assertEq(chog.balanceOf(address(acct)), 90e18);
        (,,, uint256 potChog) = acct.getBoost();
        assertEq(potChog, 90e18);
    }

    function test_chogHypeGivesBiggerLongerBoostThanMon() public {
        _hypeChog(bob, 100e18);
        (uint256 mult, uint256 exp,,) = acct.getBoost();
        assertEq(mult, 11_000); // +0.10x
        assertEq(exp, block.timestamp + 4 hours);

        vm.warp(block.timestamp + 1 hours);
        _hype(carol, 1 ether); // MON: +0.05x, 3h from now = same moment as the CHOG expiry
        (mult, exp,,) = acct.getBoost();
        assertEq(mult, 11_500);
        assertEq(exp, block.timestamp + 3 hours);
    }

    function test_monHypeNeverShortensAChogBoost() public {
        _hypeChog(bob, 100e18);
        (, uint256 chogExpiry,,) = acct.getBoost();
        vm.warp(block.timestamp + 20 minutes);
        _hype(carol, 1 ether); // 3h from now is earlier than the 4h CHOG expiry
        (, uint256 exp,,) = acct.getBoost();
        assertEq(exp, chogExpiry);
    }

    function test_chogPerksOffFallBackToMonRules() public {
        IStrategyRegistry.Config memory c = strategy.config();
        c.chogBoostStepBps = 0;
        c.chogBoostDuration = 0;
        c.chogBurnBps = 0;
        strategy.setConfig(c);

        vm.recordLogs();
        _hypeChog(bob, 50e18);
        (uint256 mult, uint256 exp,, uint256 potChog) = acct.getBoost();
        assertEq(mult, 10_500);
        assertEq(exp, block.timestamp + 3 hours);
        assertEq(potChog, 50e18);
        assertEq(chog.balanceOf(DEAD), 0);
    }

    function test_chogMinimumIsCheckedBeforeBurn() public {
        // 10 CHOG is the minimum; 10% burn leaves 9 in the pot, which is fine: the hyper paid the minimum.
        _hypeChog(bob, 10e18);
        (,,, uint256 potChog) = acct.getBoost();
        assertEq(potChog, 9e18);
    }

    function test_sweepReturnsChogPotAfterBurn() public {
        _hypeChog(bob, 100e18);
        vm.prank(alice);
        acct.sweepToOwner();
        assertEq(chog.balanceOf(alice), 90e18);
        assertEq(chog.balanceOf(DEAD), 10e18);
    }

    // -------------------------------------------------------------- lucky hype

    function test_luckyDisabled() public {
        IStrategyRegistry.Config memory c = strategy.config();
        c.entropy = address(0);
        strategy.setConfig(c);
        assertEq(acct.luckyFee(), 0);
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(DaemonAccount.LuckyDisabled.selector);
        acct.hypeLucky{value: 1 ether}();
    }

    function test_luckyFeeIsEntropyFee() public view {
        assertEq(acct.luckyFee(), 0.1 ether);
    }

    function test_luckyHypeAppliesAtOnceAndPaysEntropy() public {
        vm.deal(bob, 0.6 ether);
        vm.expectEmit(true, true, false, true, address(acct));
        emit IDaemonAccount.Hyped(1, bob, address(0), 0.5 ether);
        vm.expectEmit(true, true, false, true, address(acct));
        emit IDaemonAccount.LuckyRollRequested(1, bob, 1);
        vm.prank(bob);
        acct.hypeLucky{value: 0.6 ether}();

        (uint256 mult,, uint256 potMon,) = acct.getBoost();
        assertEq(mult, 10_500);
        assertEq(potMon, 0.5 ether);
        assertEq(address(entropy).balance, 0.1 ether);
        assertEq(address(acct).balance, 0.5 ether);
        assertEq(entropy.gasLimitOf(1), 100_000);
    }

    function test_luckyHypeNeedsMoreThanTheFee() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.HypeTooSmall.selector, 0.1 ether, 0.11 ether));
        acct.hypeLucky{value: 0.1 ether}();

        // above the fee, but the hype part is below the MON minimum
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.HypeTooSmall.selector, 0.005 ether, 0.01 ether));
        acct.hypeLucky{value: 0.105 ether}();
    }

    function test_luckyHypeRespectsCooldowns() public {
        _hypeLucky(bob, 0.5 ether);
        vm.warp(block.timestamp + 11 minutes);
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.HypeUserCooldown.selector, block.timestamp - 11 minutes + 4 hours));
        acct.hypeLucky{value: 0.6 ether}();
    }

    function test_criticalRollMaxesAndExtendsBoost() public {
        uint64 seq = _hypeLucky(bob, 0.5 ether);
        (, uint256 exp0,,) = acct.getBoost();
        vm.warp(block.timestamp + 30 seconds);

        vm.expectEmit(true, false, false, true, address(acct));
        emit IDaemonAccount.BoostApplied(1, 12_500, exp0 + 3 hours);
        vm.expectEmit(true, true, false, true, address(acct));
        emit IDaemonAccount.LuckyRoll(1, bob, seq, true);
        entropy.reveal(seq, _critical());

        (uint256 mult, uint256 exp,,) = acct.getBoost();
        assertEq(mult, 12_500);
        assertEq(exp, exp0 + 3 hours);
    }

    function test_plainRollChangesNothing() public {
        uint64 seq = _hypeLucky(bob, 0.5 ether);
        (uint256 m0, uint256 e0,,) = acct.getBoost();
        vm.expectEmit(true, true, false, true, address(acct));
        emit IDaemonAccount.LuckyRoll(1, bob, seq, false);
        entropy.reveal(seq, _plain());
        (uint256 m1, uint256 e1,,) = acct.getBoost();
        assertEq(m1, m0);
        assertEq(e1, e0);
    }

    function test_criticalRevivesAnExpiredBoost() public {
        uint64 seq = _hypeLucky(bob, 0.5 ether);
        vm.warp(block.timestamp + 5 hours); // the 3h boost is over before the answer lands
        (uint256 m0,,,) = acct.getBoost();
        assertEq(m0, 10_000);
        entropy.reveal(seq, _critical());
        (uint256 mult, uint256 exp,,) = acct.getBoost();
        assertEq(mult, 12_500);
        assertEq(exp, block.timestamp + 3 hours);
    }

    function test_onlyEntropyCanAnswer() public {
        uint64 seq = _hypeLucky(bob, 0.5 ether);
        vm.prank(bob);
        vm.expectRevert(DaemonAccount.NotEntropy.selector);
        acct._entropyCallback(seq, address(entropy), _critical());
    }

    function test_rollIsAnsweredOnceAndUnknownRollsIgnored() public {
        uint64 seq = _hypeLucky(bob, 0.5 ether);
        entropy.reveal(seq, _plain());

        // A replayed or unknown sequence changes nothing and emits nothing.
        vm.recordLogs();
        vm.prank(address(entropy));
        acct._entropyCallback(seq, address(entropy), _critical());
        vm.prank(address(entropy));
        acct._entropyCallback(999, address(entropy), _critical());
        assertEq(vm.getRecordedLogs().length, 0);
        (uint256 mult,,,) = acct.getBoost();
        assertEq(mult, 10_500);
    }

    function test_criticalBoostIsStillPaidOnlyFromThePot() public {
        // Tiny pot, maxed boost: the top-up can never exceed what the pot holds.
        uint64 seq = _hypeLucky(bob, 0.01 ether);
        entropy.reveal(seq, _critical());
        _warpReady();
        _pend(500e18); // 500 DMNR = 1000 dUSD profit -> target top-up 250 dUSD, pot only worth 0.03 dUSD
        (uint256 profit,) = acct.compound(keeper);
        assertEq(profit, 1_000e18);
        (,, uint256 potMon,) = acct.getBoost();
        assertEq(potMon, 0);
        assertLe(acct.lifetimeYield(), profit + 0.03e18);
    }

    function test_callbackFitsTheRequestedGas() public {
        // The mock forwards exactly luckyGasLimit; a callback that needed more would revert here.
        IStrategyRegistry.Config memory c = strategy.config();
        c.luckyGasLimit = 60_000; // the registry's minimum
        strategy.setConfig(c);
        uint64 seq = _hypeLucky(bob, 0.5 ether);
        entropy.reveal(seq, _critical());
        (uint256 mult,,,) = acct.getBoost();
        assertEq(mult, 12_500);
    }
}
