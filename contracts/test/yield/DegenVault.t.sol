// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {RewardVault} from "../../src/yield/RewardVault.sol";
import {DegenVault} from "../../src/yield/DegenVault.sol";

contract DegenVaultTest is Test {
    MockERC20 dusd;
    MockERC20 dmnr;
    DegenVault vault;

    address distributor = makeAddr("distributor");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant EPOCH = 3600;

    function setUp() public {
        vm.roll(100);
        vm.warp(1_699_999_200); // aligned to an epoch start (1_699_999_200 % 3600 == 0)
        dusd = new MockERC20("Daemon USD", "dUSD", 18);
        dmnr = new MockERC20("Daemon Reward", "DMNR", 18);
        vault = new DegenVault(
            IERC20(address(dusd)), IERC20(address(dmnr)), distributor, "Degen Vault", "dVLT", "Degen", EPOCH
        );
        dusd.mint(alice, 1_000_000e18);
        dusd.mint(bob, 1_000_000e18);
        vm.prank(alice);
        dusd.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        dusd.approve(address(vault), type(uint256).max);
        vm.prank(distributor);
        dmnr.approve(address(vault), type(uint256).max);
    }

    function _fund(uint256 amount, uint256 duration) internal {
        dmnr.mint(distributor, amount);
        vm.prank(distributor);
        vault.notifyRewardAmount(amount, duration);
    }

    function test_metadata() public view {
        assertEq(vault.riskLabel(), "Degen");
        assertEq(vault.epochLength(), EPOCH);
        assertEq(block.timestamp % EPOCH, 0);
    }

    function test_constructor_rejectsShortEpoch() public {
        vm.expectRevert(DegenVault.InvalidEpochLength.selector);
        new DegenVault(IERC20(address(dusd)), IERC20(address(dmnr)), distributor, "x", "x", "x", 59);
    }

    function testFuzz_multiplierBounds(uint256 epoch) public view {
        uint256 m = vault.multiplierBpsAt(epoch);
        assertGe(m, 5_000);
        assertLe(m, 20_000);
    }

    function test_multiplierActuallyVaries() public view {
        uint256 lo = type(uint256).max;
        uint256 hi;
        for (uint256 e; e < 64; e++) {
            uint256 m = vault.multiplierBpsAt(e);
            if (m < lo) lo = m;
            if (m > hi) hi = m;
        }
        assertLt(lo, 10_000);
        assertGt(hi, 10_000);
    }

    function test_epochAccrualMatchesMultiplier() public {
        vm.prank(alice);
        vault.deposit(100e18, alice);
        _fund(240e18, 100 * EPOCH); // base rate = 240e18 / 360000
        uint256 rate = vault.rewardRate();
        uint256 m = vault.currentMultiplierBps();
        assertEq(vault.effectiveRewardRate(), rate * m / 10_000);
        vm.warp(block.timestamp + EPOCH);
        uint256 expected = rate * EPOCH * m / 10_000;
        assertApproxEqAbs(vault.pendingRewards(alice), expected, 1e6);

        // across two epochs
        uint256 m2 = vault.multiplierBpsAt(vault.currentEpoch());
        vm.warp(block.timestamp + EPOCH / 2);
        expected += rate * (EPOCH / 2) * m2 / 10_000;
        assertApproxEqAbs(vault.pendingRewards(alice), expected, 1e6);
    }

    function test_durationTooManyEpochsReverts() public {
        dmnr.mint(distributor, 1e24);
        vm.prank(distributor);
        vm.expectRevert(RewardVault.InvalidDuration.selector);
        vault.notifyRewardAmount(1e24, 501 * EPOCH);
    }

    function test_exhaustionStopsAndNeverOverpays() public {
        vm.prank(alice);
        vault.deposit(100e18, alice);
        _fund(1000e18, 10 * EPOCH);
        vm.warp(block.timestamp + 100 * EPOCH); // way past any possible exhaustion (<= ~4x duration)
        uint256 pending = vault.pendingRewards(alice);
        assertLe(pending, 1000e18);
        assertApproxEqAbs(pending, 1000e18, 1e6);
        assertEq(vault.rewardsRemaining(), 0);
        assertEq(vault.effectiveRewardRate(), 0);
        vm.warp(block.timestamp + 10 * EPOCH);
        assertEq(vault.pendingRewards(alice), pending);
        // everything still works
        vm.prank(bob);
        vault.deposit(5e18, bob);
        vm.prank(alice);
        assertEq(vault.claimRewards(alice), pending);
        uint256 shares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(shares, alice, alice);
        assertEq(dusd.balanceOf(alice), 1_000_000e18);
    }

    /// @dev Bounds: over any window, streamed rewards are between 0.5x and 2x of the base stream (until exhausted).
    function testFuzz_varianceBounds(uint256 elapsed, uint256 offset) public {
        offset = bound(offset, 0, EPOCH - 1);
        elapsed = bound(elapsed, 1, 50 * EPOCH);
        vm.warp(block.timestamp + offset);
        vm.prank(alice);
        vault.deposit(100e18, alice);
        _fund(1_000_000e18, 100 * EPOCH); // enough budget that 2x for 50 epochs never exhausts
        uint256 base = vault.rewardRate() * elapsed;
        vm.warp(block.timestamp + elapsed);
        uint256 got = vault.pendingRewards(alice);
        assertGe(got + 1e6, base / 2);
        assertLe(got, base * 2);
    }

    function testFuzz_neverPaysMoreThanFunded(uint256 seed, uint256 amount, uint256 epochs) public {
        amount = bound(amount, 1e18, 1e27);
        epochs = bound(epochs, 1, 500);
        _fund(amount, epochs * EPOCH);
        address[2] memory users = [alice, bob];
        for (uint256 i; i < 20; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            address u = users[r % 2];
            vm.warp(block.timestamp + (r >> 8) % (epochs * EPOCH / 4 + 1));
            vm.startPrank(u);
            uint256 action = (r >> 32) % 3;
            if (action == 0) {
                vault.deposit(((r >> 40) % 1000e18) + 1, u);
            } else if (action == 1) {
                uint256 bal = vault.balanceOf(u);
                if (bal > 0) vault.redeem(bal / 2 + 1, u, u);
            } else {
                vault.claimRewards(u);
            }
            vm.stopPrank();
        }
        uint256 owed = vault.pendingRewards(alice) + vault.pendingRewards(bob);
        assertLe(owed + vault.rewardsRemaining(), dmnr.balanceOf(address(vault)));
        assertLe(vault.totalRewardsClaimed() + owed, amount);
    }

    function test_longGapAccrualGasBounded() public {
        vm.prank(alice);
        vault.deposit(100e18, alice);
        _fund(1000e18, 500 * EPOCH);
        vm.warp(block.timestamp + 2000 * EPOCH);
        uint256 g = gasleft();
        vm.prank(alice);
        vault.claimRewards(alice);
        assertLt(g - gasleft(), 5_000_000);
    }
}
