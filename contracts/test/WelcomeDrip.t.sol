// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WelcomeDrip} from "../src/WelcomeDrip.sol";

contract RejectMon {
    receive() external payable {
        revert("no");
    }
}

contract ReenterDrip {
    WelcomeDrip public drip;

    constructor(WelcomeDrip d) {
        drip = d;
    }

    receive() external payable {
        drip.claimFor(address(0xB0B0)); // tries a second claim during the first
    }
}

contract WelcomeDripTest is Test {
    WelcomeDrip drip;
    address funder = makeAddr("funder");
    address relayer = address(this); // the test contract plays the app's relayer
    address newbie = makeAddr("newbie");

    function setUp() public {
        vm.warp(1_700_000_000);
        drip = new WelcomeDrip(0.3 ether, 3, funder, relayer);
        vm.deal(address(this), 10 ether);
        (bool ok,) = address(drip).call{value: 3 ether}("");
        assertTrue(ok);
    }

    function test_constructorValidates() public {
        vm.expectRevert(WelcomeDrip.ZeroAddress.selector);
        new WelcomeDrip(1, 1, address(0), relayer);
        vm.expectRevert(WelcomeDrip.ZeroAddress.selector);
        new WelcomeDrip(1, 1, funder, address(0));
        vm.expectRevert(WelcomeDrip.InvalidConfig.selector);
        new WelcomeDrip(0, 1, funder, relayer);
        vm.expectRevert(WelcomeDrip.InvalidConfig.selector);
        new WelcomeDrip(1, 0, funder, relayer);
    }

    function test_onlyTheRelayerCanClaim() public {
        // a bot calling the contract directly gets nothing, however many fresh wallets it invents
        address bot = makeAddr("bot");
        vm.prank(bot);
        vm.expectRevert(WelcomeDrip.NotRelayer.selector);
        drip.claimFor(makeAddr("sybil1"));
        vm.prank(funder); // even the funder is not the relayer
        vm.expectRevert(WelcomeDrip.NotRelayer.selector);
        drip.claimFor(makeAddr("sybil2"));
        assertEq(address(drip).balance, 3 ether);
    }

    function test_funderCanReplaceTheRelayer() public {
        address fresh = makeAddr("freshRelayer");
        vm.expectRevert(WelcomeDrip.NotFunder.selector); // the relayer cannot replace itself
        drip.setRelayer(fresh);
        vm.prank(funder);
        vm.expectRevert(WelcomeDrip.ZeroAddress.selector);
        drip.setRelayer(address(0));

        vm.prank(funder);
        drip.setRelayer(fresh);
        vm.expectRevert(WelcomeDrip.NotRelayer.selector); // the old, possibly leaked key stops working
        drip.claimFor(newbie);
        vm.prank(fresh);
        drip.claimFor(newbie);
        assertEq(newbie.balance, 0.3 ether);
    }

    function test_relayerClaimsForEmptyWallet() public {
        assertEq(drip.status(newbie), "");
        vm.expectEmit(true, false, false, true, address(drip));
        emit WelcomeDrip.Dripped(newbie, 0.3 ether);
        uint256 relayerBefore = relayer.balance;
        drip.claimFor(newbie);
        assertEq(newbie.balance, 0.3 ether);
        assertEq(relayer.balance, relayerBefore, "the relayer only pays gas, it never receives MON");
        assertTrue(drip.claimed(newbie));
        assertEq(drip.status(newbie), "already claimed");
    }

    function test_onlyOncePerWallet() public {
        drip.claimFor(newbie);
        vm.deal(newbie, 0); // spends it all, still cannot claim again
        vm.expectRevert(WelcomeDrip.AlreadyClaimed.selector);
        drip.claimFor(newbie);
    }

    function test_walletsWithMonCannotClaim() public {
        vm.deal(newbie, 0.3 ether);
        assertEq(drip.status(newbie), "wallet already has MON");
        vm.expectRevert(abi.encodeWithSelector(WelcomeDrip.NotNew.selector, 0.3 ether));
        drip.claimFor(newbie);
        vm.deal(newbie, 0.29 ether); // nearly empty is fine
        drip.claimFor(newbie);
        assertEq(newbie.balance, 0.59 ether);
    }

    function test_dailyLimitResetsNextDay() public {
        drip.claimFor(makeAddr("a"));
        drip.claimFor(makeAddr("b"));
        drip.claimFor(makeAddr("c"));
        assertEq(drip.status(makeAddr("d")), "daily limit reached");
        vm.expectRevert(WelcomeDrip.DailyLimitReached.selector);
        drip.claimFor(makeAddr("d"));

        vm.warp(block.timestamp + 1 days);
        drip.claimFor(makeAddr("d"));
        assertEq(drip.claimsToday(), 1);
    }

    function test_outOfFunds() public {
        vm.prank(funder);
        drip.withdraw(2.9 ether);
        assertEq(drip.status(newbie), "drip is empty");
        vm.expectRevert(WelcomeDrip.OutOfFunds.selector);
        drip.claimFor(newbie);
    }

    function test_onlyFunderWithdraws() public {
        vm.prank(relayer);
        vm.expectRevert(WelcomeDrip.NotFunder.selector);
        drip.withdraw(1 ether);
        vm.prank(funder);
        drip.withdraw(1 ether);
        assertEq(funder.balance, 1 ether);
    }

    function test_failedTransferRevertsAndKeepsClaim() public {
        RejectMon r = new RejectMon();
        vm.expectRevert(WelcomeDrip.TransferFailed.selector);
        drip.claimFor(address(r));
        assertFalse(drip.claimed(address(r)));
    }

    function test_noReentrancy() public {
        // the relayer itself re-enters while receiving its claim: the guard stops the nested call, so the send fails
        ReenterDrip r = new ReenterDrip(drip);
        vm.prank(funder);
        drip.setRelayer(address(r));
        vm.prank(address(r));
        vm.expectRevert(WelcomeDrip.TransferFailed.selector);
        drip.claimFor(address(r));
        assertEq(address(drip).balance, 3 ether);
        assertFalse(drip.claimed(address(r)));
    }

    function test_zeroAddress() public {
        vm.expectRevert(WelcomeDrip.ZeroAddress.selector);
        drip.claimFor(address(0));
    }
}
