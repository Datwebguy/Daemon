// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {RewardVault} from "../../src/yield/RewardVault.sol";
import {IYieldSource} from "../../src/interfaces/IYieldSource.sol";

contract RewardVaultTest is Test {
    MockERC20 dusd;
    MockERC20 dmnr;
    RewardVault vault;

    address distributor = makeAddr("distributor");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        vm.warp(1_700_000_000);
        dusd = new MockERC20("Daemon USD", "dUSD", 18);
        dmnr = new MockERC20("Daemon Reward", "DMNR", 18);
        vault = new RewardVault(IERC20(address(dusd)), IERC20(address(dmnr)), distributor, "Stable Vault", "sVLT", "Stable");
        for (uint256 i; i < 3; i++) {
            address u = i == 0 ? alice : i == 1 ? bob : carol;
            dusd.mint(u, 1_000_000e18);
            vm.prank(u);
            dusd.approve(address(vault), type(uint256).max);
        }
        vm.prank(distributor);
        dmnr.approve(address(vault), type(uint256).max);
    }

    function _fund(uint256 amount, uint256 duration) internal {
        dmnr.mint(distributor, amount);
        vm.prank(distributor);
        vault.notifyRewardAmount(amount, duration);
    }

    function _deposit(address u, uint256 assets) internal returns (uint256 shares) {
        vm.prank(u);
        shares = vault.deposit(assets, u);
    }

    // ---------------------------------------------------------------- basics

    function test_metadata() public view {
        assertEq(vault.asset(), address(dusd));
        assertEq(vault.rewardToken(), address(dmnr));
        assertEq(vault.riskLabel(), "Stable");
        assertEq(vault.rewardsDistributor(), distributor);
        assertEq(vault.decimals(), 24); // 18 + offset 6
    }

    function test_constructor_rejectsRewardEqualsAsset() public {
        vm.expectRevert(RewardVault.RewardTokenIsAsset.selector);
        new RewardVault(IERC20(address(dusd)), IERC20(address(dusd)), distributor, "x", "x", "x");
    }

    function test_constructor_rejectsZero() public {
        vm.expectRevert(RewardVault.ZeroAddress.selector);
        new RewardVault(IERC20(address(dusd)), IERC20(address(dmnr)), address(0), "x", "x", "x");
    }

    function testFuzz_depositRedeem(uint256 assets) public {
        assets = bound(assets, 1, 1_000_000e18);
        uint256 shares = _deposit(alice, assets);
        assertEq(vault.balanceOf(alice), shares);
        assertEq(vault.convertToAssets(shares), assets);
        vm.prank(alice);
        uint256 out = vault.redeem(shares, alice, alice);
        assertEq(out, assets);
        assertEq(dusd.balanceOf(alice), 1_000_000e18);
        assertEq(vault.totalSupply(), 0);
    }

    function test_mintAndWithdraw() public {
        vm.startPrank(alice);
        uint256 assets = vault.mint(5e24, alice);
        assertEq(assets, 5e18);
        vault.withdraw(2e18, bob, alice);
        vm.stopPrank();
        assertEq(dusd.balanceOf(bob), 1_000_002e18);
        assertEq(vault.balanceOf(alice), 3e24);
    }

    function test_redeemOnBehalf_requiresAllowance() public {
        uint256 shares = _deposit(alice, 10e18);
        vm.prank(bob);
        vm.expectRevert();
        vault.redeem(shares, bob, alice);
    }

    // ---------------------------------------------------------------- rewards

    function test_onlyDistributorCanNotify() public {
        dmnr.mint(alice, 100e18);
        vm.startPrank(alice);
        dmnr.approve(address(vault), 100e18);
        vm.expectRevert(RewardVault.NotRewardsDistributor.selector);
        vault.notifyRewardAmount(100e18, 100);
        vm.stopPrank();
    }

    function test_notify_validations() public {
        vm.startPrank(distributor);
        vm.expectRevert(RewardVault.ZeroAmount.selector);
        vault.notifyRewardAmount(0, 100);
        vm.expectRevert(RewardVault.InvalidDuration.selector);
        vault.notifyRewardAmount(1e18, 0);
        vm.expectRevert(RewardVault.InvalidDuration.selector);
        vault.notifyRewardAmount(1e18, 3651 days);
        vm.expectRevert(RewardVault.RewardRateTooLow.selector);
        vault.notifyRewardAmount(99, 100);
        vm.stopPrank();
    }

    function test_rewardAccrualOverTime() public {
        _deposit(alice, 100e18);
        _fund(1000e18, 1000); // 1e18 / s
        assertEq(vault.rewardRate(), 1e18);
        vm.warp(block.timestamp + 100);
        assertApproxEqAbs(vault.pendingRewards(alice), 100e18, 1e6);
        vm.warp(block.timestamp + 400);
        assertApproxEqAbs(vault.pendingRewards(alice), 500e18, 1e6);
        assertApproxEqAbs(vault.rewardsRemaining(), 500e18, 1e6);
    }

    function test_multipleDepositorsProRata() public {
        _deposit(alice, 100e18);
        _deposit(bob, 300e18);
        _fund(1000e18, 1000);
        vm.warp(block.timestamp + 400); // 400 streamed: alice 100, bob 300
        _deposit(carol, 400e18); // now alice 1/8, bob 3/8, carol 4/8
        vm.warp(block.timestamp + 400); // 400 streamed
        assertApproxEqAbs(vault.pendingRewards(alice), 100e18 + 50e18, 1e9);
        assertApproxEqAbs(vault.pendingRewards(bob), 300e18 + 150e18, 1e9);
        assertApproxEqAbs(vault.pendingRewards(carol), 200e18, 1e9);
    }

    function test_claim() public {
        _deposit(alice, 100e18);
        _fund(1000e18, 1000);
        vm.warp(block.timestamp + 250);
        vm.prank(alice);
        uint256 claimed = vault.claimRewards(carol);
        assertApproxEqAbs(claimed, 250e18, 1e6);
        assertEq(dmnr.balanceOf(carol), claimed);
        assertEq(vault.pendingRewards(alice), 0);
        assertEq(vault.totalRewardsClaimed(), claimed);
        // second claim in the same block pays nothing and does not revert
        vm.prank(alice);
        assertEq(vault.claimRewards(alice), 0);
        // bob (no shares) claims nothing
        vm.prank(bob);
        assertEq(vault.claimRewards(bob), 0);
    }

    function test_claim_rejectsZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(RewardVault.ZeroAddress.selector);
        vault.claimRewards(address(0));
    }

    function test_shareTransferCheckpointing() public {
        uint256 shares = _deposit(alice, 100e18);
        _fund(1000e18, 1000);
        vm.warp(block.timestamp + 100);
        vm.prank(alice);
        vault.transfer(bob, shares / 2);
        // alice keeps what she earned before the transfer; bob earns nothing retroactively
        assertApproxEqAbs(vault.pendingRewards(alice), 100e18, 1e6);
        assertEq(vault.pendingRewards(bob), 0);
        vm.warp(block.timestamp + 100);
        assertApproxEqAbs(vault.pendingRewards(alice), 150e18, 1e6);
        assertApproxEqAbs(vault.pendingRewards(bob), 50e18, 1e6);
    }

    function test_transferFromCheckpointing() public {
        uint256 shares = _deposit(alice, 100e18);
        _fund(1000e18, 1000);
        vm.prank(alice);
        vault.approve(carol, shares);
        vm.warp(block.timestamp + 100);
        vm.prank(carol);
        vault.transferFrom(alice, bob, shares);
        vm.warp(block.timestamp + 100);
        assertApproxEqAbs(vault.pendingRewards(alice), 100e18, 1e6);
        assertApproxEqAbs(vault.pendingRewards(bob), 100e18, 1e6);
    }

    function test_redeemKeepsEarnedRewards() public {
        uint256 shares = _deposit(alice, 100e18);
        _fund(1000e18, 1000);
        vm.warp(block.timestamp + 100);
        vm.prank(alice);
        vault.redeem(shares, alice, alice);
        vm.warp(block.timestamp + 100);
        assertApproxEqAbs(vault.pendingRewards(alice), 100e18, 1e6);
        // nothing streamed while supply was zero
        assertApproxEqAbs(vault.rewardsRemaining(), 900e18, 1e6);
    }

    function test_zeroSupplyPreservesBudget() public {
        _fund(1000e18, 1000);
        vm.warp(block.timestamp + 5000); // nobody deposited
        assertEq(vault.rewardsRemaining(), 1000e18);
        _deposit(alice, 1e18);
        vm.warp(block.timestamp + 1000);
        assertApproxEqAbs(vault.pendingRewards(alice), 1000e18, 1e6);
    }

    function test_notifyTopUpRollsOverRemaining() public {
        _deposit(alice, 100e18);
        _fund(1000e18, 1000);
        vm.warp(block.timestamp + 500);
        _fund(500e18, 1000); // remaining 500 + 500 over 1000s
        assertEq(vault.rewardRate(), 1e18);
        assertEq(vault.periodFinish(), block.timestamp + 1000);
        assertEq(vault.totalRewardsFunded(), 1500e18);
        vm.warp(block.timestamp + 1000);
        assertApproxEqAbs(vault.pendingRewards(alice), 1500e18, 1e6);
    }

    function test_rewardPoolExhaustion() public {
        _deposit(alice, 100e18);
        _fund(100e18, 100);
        vm.warp(block.timestamp + 100);
        uint256 atEnd = vault.pendingRewards(alice);
        assertApproxEqAbs(atEnd, 100e18, 1e6);
        assertEq(vault.rewardsRemaining(), 0);
        vm.warp(block.timestamp + 10_000);
        assertEq(vault.pendingRewards(alice), atEnd); // stops paying

        // deposit / withdraw / transfer / claim all keep working
        uint256 bobShares = _deposit(bob, 50e18);
        vm.warp(block.timestamp + 100);
        assertEq(vault.pendingRewards(bob), 0);
        vm.prank(bob);
        vault.redeem(bobShares, bob, bob);
        vm.prank(alice);
        uint256 claimed = vault.claimRewards(alice);
        assertEq(claimed, atEnd);
        vm.prank(alice);
        vault.withdraw(100e18, alice, alice);
        assertEq(dusd.balanceOf(alice), 1_000_000e18);
        assertLe(vault.totalRewardsClaimed(), vault.totalRewardsFunded());
    }

    // ---------------------------------------------------------------- inflation attack

    function test_inflationAttackResistance() public {
        address attacker = makeAddr("attacker");
        dusd.mint(attacker, 1_000_001e18);
        vm.startPrank(attacker);
        dusd.approve(address(vault), type(uint256).max);
        uint256 aShares = vault.deposit(1, attacker);
        dusd.transfer(address(vault), 1_000_000e18); // donation
        vm.stopPrank();

        uint256 victimShares = _deposit(alice, 1000e18);
        assertGt(victimShares, 0);
        vm.prank(alice);
        uint256 back = vault.redeem(victimShares, alice, alice);
        // victim loses at most a tiny fraction (well under 1%)
        assertGe(back, 1000e18 * 99 / 100);

        vm.prank(attacker);
        uint256 aBack = vault.redeem(aShares, attacker, attacker);
        assertLt(aBack, 1_000_000e18); // attacker loses on the donation
    }

    function testFuzz_inflationAttack(uint256 donation, uint256 victim) public {
        donation = bound(donation, 1, 1_000_000e18);
        victim = bound(victim, 1e18, 1_000_000e18);
        address attacker = makeAddr("attacker");
        dusd.mint(attacker, donation + 1);
        vm.startPrank(attacker);
        dusd.approve(address(vault), type(uint256).max);
        uint256 aShares = vault.deposit(1, attacker);
        dusd.transfer(address(vault), donation);
        vm.stopPrank();

        uint256 vShares = _deposit(alice, victim);
        assertGt(vShares, 0);
        uint256 vAssets = vault.previewRedeem(vShares);
        // the victim's rounding loss is at most ~donation / 10**offset, i.e. the attacker burns >= 1e6x
        // what the victim loses
        assertLe(victim - vAssets, donation / 1e6 + 2);
        if (donation <= victim * 1000) assertGe(vAssets, victim - victim / 1000);
        // attacker never profits
        assertLe(vault.previewRedeem(aShares), donation + 1);
    }

    // ---------------------------------------------------------------- solvency fuzz

    function testFuzz_neverPaysMoreThanFunded(uint256 seed) public {
        _fund(1000e18, 777);
        address[3] memory users = [alice, bob, carol];
        for (uint256 i; i < 30; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            address u = users[r % 3];
            vm.warp(block.timestamp + (r >> 8) % 200);
            uint256 action = (r >> 16) % 4;
            vm.startPrank(u);
            if (action == 0) {
                vault.deposit(((r >> 32) % 1000e18) + 1, u);
            } else if (action == 1) {
                uint256 bal = vault.balanceOf(u);
                if (bal > 0) vault.redeem(bal / 2 + 1, u, u);
            } else if (action == 2) {
                uint256 bal = vault.balanceOf(u);
                if (bal > 0) vault.transfer(users[(r >> 40) % 3], bal / 3);
            } else {
                vault.claimRewards(u);
            }
            vm.stopPrank();
        }
        uint256 owed = vault.pendingRewards(alice) + vault.pendingRewards(bob) + vault.pendingRewards(carol);
        assertLe(owed + vault.rewardsRemaining(), dmnr.balanceOf(address(vault)));
        assertLe(vault.totalRewardsClaimed() + owed, vault.totalRewardsFunded());
    }

    function test_implementsIYieldSource() public view {
        IYieldSource s = IYieldSource(address(vault));
        assertEq(s.asset(), address(dusd));
        assertEq(s.rewardToken(), address(dmnr));
    }
}
