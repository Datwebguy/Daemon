// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockWMON} from "../../src/mocks/MockWMON.sol";

contract MocksTest is Test {
    function test_mockERC20() public {
        MockERC20 t = new MockERC20("Mock CHOG", "CHOG", 8);
        assertEq(t.decimals(), 8);
        t.mint(address(0xBEEF), 5e8);
        assertEq(t.balanceOf(address(0xBEEF)), 5e8);
        assertEq(t.totalSupply(), 5e8);
    }

    function testFuzz_wmonWrapUnwrap(uint96 amount) public {
        MockWMON w = new MockWMON();
        address u = makeAddr("u");
        vm.deal(u, amount);
        vm.prank(u);
        w.deposit{value: amount}();
        assertEq(w.balanceOf(u), amount);
        assertEq(address(w).balance, amount);
        vm.prank(u);
        w.withdraw(amount);
        assertEq(w.balanceOf(u), 0);
        assertEq(u.balance, amount);
    }

    function test_wmonReceive() public {
        MockWMON w = new MockWMON();
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(w).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(w.balanceOf(address(this)), 1 ether);
        assertEq(w.decimals(), 18);
        vm.expectRevert();
        w.withdraw(2 ether);
    }
}
