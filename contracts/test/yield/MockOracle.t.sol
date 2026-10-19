// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockOracle} from "../../src/yield/MockOracle.sol";

contract MockOracleTest is Test {
    MockOracle oracle;
    MockERC20 dusd; // 18 dec, $1
    MockERC20 usdc; // 6 dec, $1
    MockERC20 wmon; // 18 dec, $3.5
    MockERC20 chog; // 8 dec, $0.02
    address updater = makeAddr("updater");

    function setUp() public {
        oracle = new MockOracle(updater);
        dusd = new MockERC20("Daemon USD", "dUSD", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        wmon = new MockERC20("WMON", "WMON", 18);
        chog = new MockERC20("CHOG", "CHOG", 8);
        vm.startPrank(updater);
        oracle.setPrice(address(dusd), 1e18);
        oracle.setPrice(address(usdc), 1e18);
        oracle.setPrice(address(wmon), 3.5e18);
        oracle.setPrice(address(chog), 0.02e18);
        vm.stopPrank();
    }

    function test_onlyUpdater() public {
        vm.expectRevert(MockOracle.NotUpdater.selector);
        oracle.setPrice(address(dusd), 2e18);
    }

    function test_priceOf() public view {
        (uint256 p, uint256 t) = oracle.priceOf(address(wmon));
        assertEq(p, 3.5e18);
        assertEq(t, block.timestamp);
    }

    function test_quoteMixedDecimals() public view {
        assertEq(oracle.quote(address(usdc), address(dusd), 1e6), 1e18);
        assertEq(oracle.quote(address(dusd), address(usdc), 1e18), 1e6);
        assertEq(oracle.quote(address(wmon), address(dusd), 2e18), 7e18);
        assertEq(oracle.quote(address(wmon), address(usdc), 1e18), 3.5e6);
        assertEq(oracle.quote(address(chog), address(dusd), 100e8), 2e18); // 100 CHOG = $2
        assertEq(oracle.quote(address(dusd), address(chog), 1e18), 50e8);
        assertEq(oracle.quote(address(chog), address(usdc), 1e8), 0.02e6);
        assertEq(oracle.quote(address(dusd), address(dusd), 123), 123);
    }

    function test_unsetPriceReverts() public {
        MockERC20 x = new MockERC20("X", "X", 18);
        vm.expectRevert(abi.encodeWithSelector(MockOracle.PriceNotSet.selector, address(x)));
        oracle.quote(address(x), address(dusd), 1e18);
        vm.expectRevert(abi.encodeWithSelector(MockOracle.PriceNotSet.selector, address(x)));
        oracle.quote(address(dusd), address(x), 1e18);
    }

    function testFuzz_roundTripNeverGains(uint256 amount, uint256 price) public {
        amount = bound(amount, 0, 1e30);
        price = bound(price, 1e12, 1e24);
        vm.prank(updater);
        oracle.setPrice(address(wmon), price);
        uint256 inUsdc = oracle.quote(address(wmon), address(usdc), amount);
        uint256 back = oracle.quote(address(usdc), address(wmon), inUsdc);
        assertLe(back, amount);
        // value conservation within one unit of the coarser token
        assertEq(inUsdc, amount * price / 1e30);
    }

    function test_constructorRejectsZero() public {
        vm.expectRevert(MockOracle.ZeroAddress.selector);
        new MockOracle(address(0));
    }
}
