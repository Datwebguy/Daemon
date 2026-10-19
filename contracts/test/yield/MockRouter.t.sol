// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockRouter} from "../../src/yield/MockRouter.sol";

contract MockRouterTest is Test {
    MockERC20 dusd;
    MockERC20 dmnr;
    MockRouter router;
    address lp = makeAddr("lp");
    address user = makeAddr("user");
    address recv = makeAddr("recv");

    uint256 constant R_DUSD = 1_000_000e18;
    uint256 constant R_DMNR = 500_000e18;

    function setUp() public {
        dusd = new MockERC20("Daemon USD", "dUSD", 18);
        dmnr = new MockERC20("Daemon Reward", "DMNR", 18);
        router = new MockRouter();
        dusd.mint(lp, R_DUSD);
        dmnr.mint(lp, R_DMNR);
        vm.startPrank(lp);
        dusd.approve(address(router), type(uint256).max);
        dmnr.approve(address(router), type(uint256).max);
        router.addLiquidity(address(dmnr), address(dusd), R_DMNR, R_DUSD);
        vm.stopPrank();
        vm.startPrank(user);
        dusd.approve(address(router), type(uint256).max);
        dmnr.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _expected(uint256 amountIn, uint256 rIn, uint256 rOut) internal pure returns (uint256) {
        uint256 inFee = amountIn * 997;
        return inFee * rOut / (rIn * 1000 + inFee);
    }

    function test_reserves() public view {
        (uint256 a, uint256 b) = router.getReserves(address(dusd), address(dmnr));
        assertEq(a, R_DUSD);
        assertEq(b, R_DMNR);
        (b, a) = router.getReserves(address(dmnr), address(dusd));
        assertEq(a, R_DUSD);
        assertEq(b, R_DMNR);
    }

    function testFuzz_swapMath(uint256 amountIn, bool dir) public {
        amountIn = bound(amountIn, 1e6, 10_000_000e18);
        (MockERC20 tin, MockERC20 tout) = dir ? (dmnr, dusd) : (dusd, dmnr);
        (uint256 rIn, uint256 rOut) = router.getReserves(address(tin), address(tout));
        uint256 expected = _expected(amountIn, rIn, rOut);
        vm.assume(expected > 0);
        tin.mint(user, amountIn);
        assertEq(router.getAmountOut(address(tin), address(tout), amountIn), expected);

        vm.prank(user);
        uint256 out = router.swapExactIn(address(tin), address(tout), amountIn, expected, recv);
        assertEq(out, expected);
        assertEq(tout.balanceOf(recv), expected);
        assertEq(tin.balanceOf(user), 0);

        (uint256 nIn, uint256 nOut) = router.getReserves(address(tin), address(tout));
        assertEq(nIn, rIn + amountIn);
        assertEq(nOut, rOut - expected);
        assertGe(nIn * nOut, rIn * rOut); // k never decreases
        assertEq(tin.balanceOf(address(router)), nIn);
        assertEq(tout.balanceOf(address(router)), nOut);
    }

    function test_swapConcreteValue() public {
        dmnr.mint(user, 1000e18);
        vm.prank(user);
        uint256 out = router.swapExactIn(address(dmnr), address(dusd), 1000e18, 0, user);
        // ~2 dUSD per DMNR minus 0.3% fee and price impact
        assertEq(out, _expected(1000e18, R_DMNR, R_DUSD));
        assertGt(out, 1990e18);
        assertLt(out, 1994e18);
    }

    function testFuzz_minOutReverts(uint256 amountIn, uint256 extra) public {
        amountIn = bound(amountIn, 1e12, 1_000_000e18);
        extra = bound(extra, 1, 1e30);
        dmnr.mint(user, amountIn);
        uint256 expected = router.getAmountOut(address(dmnr), address(dusd), amountIn);
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(MockRouter.InsufficientOutput.selector, expected, expected + extra));
        router.swapExactIn(address(dmnr), address(dusd), amountIn, expected + extra, user);
    }

    function test_noPoolReverts() public {
        MockERC20 x = new MockERC20("X", "X", 18);
        x.mint(user, 1e18);
        vm.startPrank(user);
        x.approve(address(router), 1e18);
        vm.expectRevert(MockRouter.NoLiquidity.selector);
        router.swapExactIn(address(x), address(dusd), 1e18, 0, user);
        vm.stopPrank();
    }

    function test_validations() public {
        vm.startPrank(user);
        vm.expectRevert(MockRouter.IdenticalTokens.selector);
        router.swapExactIn(address(dusd), address(dusd), 1, 0, user);
        vm.expectRevert(MockRouter.ZeroAmount.selector);
        router.swapExactIn(address(dmnr), address(dusd), 0, 0, user);
        vm.expectRevert(MockRouter.ZeroAddress.selector);
        router.swapExactIn(address(dmnr), address(dusd), 1, 0, address(0));
        vm.expectRevert(MockRouter.ZeroAmount.selector);
        router.addLiquidity(address(dmnr), address(dusd), 0, 1);
        vm.stopPrank();
    }

    function test_addLiquidityAccumulates() public {
        dusd.mint(lp, 10e18);
        dmnr.mint(lp, 5e18);
        vm.prank(lp);
        router.addLiquidity(address(dusd), address(dmnr), 10e18, 5e18);
        (uint256 a, uint256 b) = router.getReserves(address(dusd), address(dmnr));
        assertEq(a, R_DUSD + 10e18);
        assertEq(b, R_DMNR + 5e18);
    }
}
