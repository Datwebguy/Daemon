// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {DaemonBase} from "./DaemonBase.t.sol";
import {DaemonAccount} from "../../src/account/DaemonAccount.sol";
import {IDaemonAccount} from "../../src/interfaces/IDaemonAccount.sol";
import {IStrategyRegistry} from "../../src/interfaces/IStrategyRegistry.sol";
import {ASource} from "./mocks/AccountMocks.sol";

contract DaemonAccountCompoundTest is DaemonBase {
    function setUp() public override {
        super.setUp();
        vm.txGasPrice(0);
    }

    // ---------------------------------------------------------------- happy path

    function test_compoundBasic() public {
        _warpReady();
        _pend(10e18); // 10 DMNR = 20 dUSD

        vm.expectEmit(true, true, false, true, address(acct));
        emit IDaemonAccount.Compounded(1, keeper, 20e18, 1e18);
        vm.prank(keeper);
        (uint256 profit, uint256 bounty) = acct.compound(keeper);

        assertEq(profit, 20e18);
        assertEq(bounty, 1e18, "5% at start of ramp");
        assertEq(asset.balanceOf(keeper), 1e18);
        assertEq(sourceA.balanceOf(address(acct)), 1_019e18, "rest restaked");
        assertEq(asset.balanceOf(address(acct)), 0, "nothing idle");
        assertEq(reward.balanceOf(address(acct)), 0, "rewards swapped");
        assertEq(acct.lifetimeYield(), 19e18);
        assertEq(acct.lastCompoundAt(), block.timestamp);
        assertEq(acct.lastActivityAt(), block.timestamp);
        assertEq(acct.lastProfit(), 20e18);
        assertGt(bytes(acct.lastMessage()).length, 0);
        assertEq(reward.allowance(address(acct), address(router)), 0, "approval reset");
    }

    function test_bountyRecipientCanDifferFromCaller() public {
        _warpReady();
        _pend(10e18);
        vm.prank(keeper);
        acct.compound(carol);
        assertEq(asset.balanceOf(carol), 1e18);
        assertEq(asset.balanceOf(keeper), 0);
    }

    function test_zeroRecipientPaysCaller() public {
        _warpReady();
        _pend(10e18);
        vm.prank(keeper);
        acct.compound(address(0));
        assertEq(asset.balanceOf(keeper), 1e18);
    }

    function test_assetDenominatedRewardsNeedNoSwap() public {
        ASource stable = new ASource(address(asset), address(asset));
        strategy.approve(address(stable), CAP);
        asset.mint(address(acct), 10e18);
        vm.prank(alice);
        acct.allocate(address(stable), 10e18);
        stable.setPending(address(acct), 4e18);
        _warpReady();
        (uint256 profit, uint256 bounty) = acct.compound(keeper);
        assertEq(profit, 4e18);
        assertEq(bounty, 0.2e18);
    }

    // ---------------------------------------------------------------- reverts

    function test_cooldownReverts() public {
        _pend(10e18);
        uint256 readyAt = acct.nextCompoundAt();
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.CooldownActive.selector, readyAt));
        acct.compound(keeper);

        vm.warp(readyAt);
        acct.compound(keeper);

        _pend(10e18);
        vm.warp(block.timestamp + 1 hours - 1);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.CooldownActive.selector, block.timestamp + 1));
        acct.compound(keeper);
    }

    function test_minProfitRevertNoRewards() public {
        _warpReady();
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.InsufficientProfit.selector, 0, 0));
        acct.compound(keeper);
    }

    function test_minProfitRevertWhenGasExceedsProfit() public {
        _warpReady();
        _pend(1e15); // 0.002 dUSD of profit
        vm.txGasPrice(1000 gwei); // reimbursement hits the 1 dUSD cap
        vm.expectPartialRevert(DaemonAccount.InsufficientProfit.selector);
        acct.compound(keeper);
    }

    function test_minOutRevertWhenRouterPriceBad() public {
        _warpReady();
        _pend(10e18);
        router.setRate(address(reward), address(asset), 1.9e18); // 5% below oracle, slippage allows 1%
        // The failing swap is skipped (rewards stay in the account), so there is no profit and compound reverts.
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.InsufficientProfit.selector, 0, 0));
        acct.compound(keeper);
    }

    function test_badSwapDoesNotBlockLaterCompound() public {
        _warpReady();
        _pend(10e18);
        router.setRate(address(reward), address(asset), 1.9e18);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.InsufficientProfit.selector, 0, 0));
        acct.compound(keeper);
        // Router recovers: the earlier rewards (still held by the account) are swapped on the next compound.
        router.setRate(address(reward), address(asset), 2e18);
        (uint256 profit,) = acct.compound(keeper);
        assertEq(profit, 20e18);
    }

    function test_minOutEnforcedEvenIfRouterIgnoresIt() public {
        _warpReady();
        _pend(10e18);
        router.setRate(address(reward), address(asset), 1.9e18);
        router.setIgnoreMinOut(true);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.SlippageExceeded.selector, 19e18, 19.8e18));
        acct.compound(keeper);
    }

    function test_withinSlippageSucceeds() public {
        _warpReady();
        _pend(10e18);
        router.setRate(address(reward), address(asset), 1.99e18); // 0.5% worse than oracle
        (uint256 profit,) = acct.compound(keeper);
        assertEq(profit, 19.9e18);
    }

    function test_reentrancyViaSourceReverts() public {
        ASource evil = new ASource(address(asset), address(reward));
        strategy.approve(address(evil), CAP);
        asset.mint(address(acct), 1e18);
        vm.prank(alice);
        acct.allocate(address(evil), 1e18);
        evil.setPending(address(acct), 10e18);
        evil.setReenter(address(acct), 1);
        _warpReady();
        uint256 keeperBefore = asset.balanceOf(keeper);
        // The re-entrant claim is blocked by the guard; the harvest skips that source, so nothing is paid out.
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.InsufficientProfit.selector, 0, 0));
        acct.compound(keeper);

        evil.setReenter(address(acct), 2); // re-enter hype
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.InsufficientProfit.selector, 0, 0));
        acct.compound(keeper);
        assertEq(asset.balanceOf(keeper), keeperBefore);
    }

    function test_reentrancyViaRouterReverts() public {
        _warpReady();
        _pend(10e18);
        router.setReenter(address(acct));
        // The re-entrant swap is blocked by the guard and skipped; no profit, so compound reverts.
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.InsufficientProfit.selector, 0, 0));
        acct.compound(keeper);
    }

    // ---------------------------------------------------------------- bounty math

    function test_bountyAtStartMidMax() public {
        _pend(10e18);
        uint256 ready = acct.nextCompoundAt();
        uint256 snap = vm.snapshotState();

        vm.warp(ready);
        (, uint256 b) = acct.compound(keeper);
        assertEq(b, 1e18, "start 5%");

        vm.revertToState(snap);
        vm.warp(ready + 30 minutes);
        (, b) = acct.compound(keeper);
        assertEq(b, 1.5e18, "mid 7.5%");

        vm.revertToState(snap);
        vm.warp(ready + 1 hours);
        (, b) = acct.compound(keeper);
        assertEq(b, 2e18, "max 10%");

        vm.revertToState(snap);
        vm.warp(ready + 30 days);
        (, b) = acct.compound(keeper);
        assertEq(b, 2e18, "capped");
    }

    function testFuzz_bountyRamp(uint32 elapsed, uint96 pending) public {
        pending = uint96(bound(pending, 1e9, 1e27));
        _pend(pending);
        uint256 ready = acct.nextCompoundAt();
        vm.warp(ready + elapsed);
        uint256 profit = uint256(pending) * 2;
        uint256 share = elapsed >= 1 hours ? 1000 : 500 + (500 * uint256(elapsed)) / 1 hours;
        assertEq(acct.currentBountyShareBps(), share);
        assertEq(acct.pendingBounty(), (profit * share) / 10_000);
        (uint256 p, uint256 b) = acct.compound(keeper);
        assertEq(p, profit);
        assertEq(b, (profit * share) / 10_000);
        assertLe(b, profit / 10);
        assertEq(acct.totalAssets(), 1_000e18 + profit - b);
    }

    function test_gasReimbursementCapped() public {
        _warpReady();
        _pend(10e18);
        vm.txGasPrice(100_000 gwei); // ~>1 dUSD of gas
        (, uint256 b) = acct.compound(keeper);
        assertEq(b, 1e18 + 1e18, "cap + 5% of 20");
    }

    function test_gasReimbursementUncapped() public {
        _warpReady();
        _pend(10e18);
        vm.txGasPrice(100 gwei);
        (, uint256 b) = acct.compound(keeper);
        uint256 reimb = b - 1e18;
        assertGt(reimb, 0);
        assertLt(reimb, 1e18);
        // reimb = gas * 100 gwei * 3 dUSD/MON
        uint256 gasPaid = reimb / (100 gwei * 3);
        console2.log("reimbursed gas units", gasPaid);
        assertGt(gasPaid, acct.GAS_OVERHEAD());
        assertLt(gasPaid, 600_000);
    }

    // ---------------------------------------------------------------- funds only return to the account

    function testFuzz_fundsOnlyReturnToAccount(uint96 pending, uint32 elapsed) public {
        pending = uint96(bound(pending, 1e12, 1e24));
        _pend(pending);
        vm.warp(acct.nextCompoundAt() + elapsed);
        uint256 total0 = acct.totalAssets();
        vm.prank(keeper);
        (uint256 profit, uint256 bounty) = acct.compound(keeper);
        assertEq(asset.balanceOf(keeper), bounty, "caller gets only the bounty");
        assertEq(acct.totalAssets(), total0 + profit - bounty, "everything else stays");
        assertEq(asset.balanceOf(address(router)), 0);
        assertEq(asset.balanceOf(address(this)), 0);
        assertEq(reward.balanceOf(address(acct)), 0);
    }

    function test_redepositRespectsCapLeavesIdle() public {
        strategy.approve(address(sourceA), 1_010e18);
        _warpReady();
        _pend(10e18);
        acct.compound(keeper);
        assertEq(sourceA.balanceOf(address(acct)), 1_010e18);
        assertEq(asset.balanceOf(address(acct)), 9e18, "excess stays idle in the account");
        assertEq(acct.totalAssets(), 1_019e18);
    }

    function test_redepositGoesToLargestSource() public {
        ASource small = new ASource(address(asset), address(reward));
        strategy.approve(address(small), CAP);
        asset.mint(address(acct), 10e18);
        vm.prank(alice);
        acct.allocate(address(small), 10e18);
        small.setPending(address(acct), 5e18);
        _pend(5e18);
        _warpReady();
        (uint256 profit, uint256 bounty) = acct.compound(keeper);
        assertEq(profit, 20e18);
        assertEq(small.balanceOf(address(acct)), 10e18);
        assertEq(sourceA.balanceOf(address(acct)), 1_000e18 + profit - bounty);
    }

    // ---------------------------------------------------------------- boost top-up

    function test_boostTopUpLimitedByPot() public {
        _hype(bob, 0.01 ether); // pot worth 0.03 dUSD, 1.05x
        _warpReady();
        _pend(10e18); // profit 20 -> target top-up 1 dUSD
        acct.compound(keeper);
        assertEq(sourceA.balanceOf(address(acct)), 1_000e18 + 19e18 + 0.03e18, "top-up = whole pot");
        (,, uint256 potMon,) = acct.getBoost();
        assertEq(potMon, 0);
        assertEq(address(acct).balance, 0);
        assertEq(acct.lifetimeYield(), 19.03e18);
    }

    function test_boostTopUpFromLargeMonPot() public {
        _hype(bob, 10 ether); // pot worth 30 dUSD
        _warpReady();
        _pend(10e18);
        acct.compound(keeper);
        uint256 spend = 333_333_333_333_333_334; // ceil(10e18 * 1e18 / 30e18)
        (,, uint256 potMon,) = acct.getBoost();
        assertEq(potMon, 10 ether - spend);
        assertEq(address(acct).balance, 10 ether - spend);
        assertApproxEqAbs(sourceA.balanceOf(address(acct)), 1_020e18, 10, "19 + 1 top-up");
    }

    function test_boostTopUpFromChogPot() public {
        chog.mint(bob, 10e18);
        vm.startPrank(bob);
        chog.approve(address(acct), 10e18);
        acct.hypeWithChog(10e18); // worth 5 dUSD
        vm.stopPrank();
        _warpReady();
        _pend(10e18);
        acct.compound(keeper);
        (,,, uint256 potChog) = acct.getBoost();
        assertEq(potChog, 8e18, "spent 2 CHOG = 1 dUSD");
        assertEq(sourceA.balanceOf(address(acct)), 1_020e18);
    }

    function test_boostTopUpMonThenChog() public {
        _hype(bob, 0.01 ether); // 0.03 dUSD
        vm.warp(block.timestamp + 10 minutes);
        chog.mint(carol, 10e18);
        vm.startPrank(carol);
        chog.approve(address(acct), 10e18);
        acct.hypeWithChog(10e18); // 1.10x
        vm.stopPrank();
        _warpReady();
        _pend(10e18); // target 2 dUSD
        acct.compound(keeper);
        (,, uint256 potMon, uint256 potChog) = acct.getBoost();
        assertEq(potMon, 0);
        assertEq(potChog, 10e18 - 3.94e18);
        assertEq(sourceA.balanceOf(address(acct)), 1_000e18 + 19e18 + 2e18);
    }

    function test_noPotNoTopUp() public {
        _hype(bob, 0.01 ether);
        // owner moves the MON out; accounting can never spend more than the account holds
        vm.prank(alice);
        acct.execute(alice, 0.01 ether, "", 0);
        _warpReady();
        _pend(10e18);
        acct.compound(keeper);
        assertEq(sourceA.balanceOf(address(acct)), 1_019e18);
    }

    function test_noBoostNoTopUpEvenWithPot() public {
        _hype(bob, 1 ether);
        vm.warp(block.timestamp + 3 hours); // boost expired, cooldown over
        _pend(10e18);
        acct.compound(keeper);
        assertEq(sourceA.balanceOf(address(acct)), 1_018e18, "20 - 10% bounty (ramp maxed), no top-up");
        (,, uint256 potMon,) = acct.getBoost();
        assertEq(potMon, 1 ether);
    }

    function test_topUpNotCountedInBounty() public {
        _hype(bob, 10 ether);
        _warpReady();
        _pend(10e18);
        (uint256 profit, uint256 bounty) = acct.compound(keeper);
        assertEq(profit, 20e18);
        assertEq(bounty, 1e18);
    }

    // ---------------------------------------------------------------- views

    function test_pendingViews() public {
        _pend(10e18);
        assertEq(acct.pendingProfit(), 20e18);
        assertEq(acct.pendingBounty(), 0, "cooldown");
        _warpReady();
        assertEq(acct.pendingBounty(), 1e18);
        _pend(0);
        assertEq(acct.pendingBounty(), 0, "no profit");
    }

    function test_gas_compound() public {
        _hype(bob, 1 ether);
        _warpReady();
        _pend(10e18);
        vm.txGasPrice(1 gwei);
        uint256 g = gasleft();
        acct.compound(keeper);
        console2.log("compound gas (1 source, boosted, MON top-up)", g - gasleft());

        vm.warp(block.timestamp + 4 hours);
        _pend(10e18);
        g = gasleft();
        acct.compound(keeper);
        console2.log("compound gas (1 source, no boost)", g - gasleft());
    }
}
