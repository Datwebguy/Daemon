// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DaemonDeploy} from "../../script/DaemonDeploy.sol";
import {ERC6551Registry} from "../../src/vendor/ERC6551Registry.sol";
import {IERC6551Registry} from "../../src/interfaces/IERC6551.sol";
import {IDaemonAccount} from "../../src/interfaces/IDaemonAccount.sol";
import {DaemonAccount} from "../../src/account/DaemonAccount.sol";
import {DaemonHub} from "../../src/DaemonHub.sol";

/// @notice End-to-end flow on the real contracts: mint -> account -> deposit -> hype -> compound -> transfer -> sweep.
contract DaemonFlowTest is Test, DaemonDeploy {
    Deployment internal d;

    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice"); // first owner
    address internal bob = makeAddr("bob"); // friend who hypes
    address internal carol = makeAddr("carol"); // anyone running a keeper
    address internal dave = makeAddr("dave"); // buyer of the Chog

    uint256 internal tokenId;
    DaemonAccount internal account;

    function setUp() public {
        vm.etch(ERC6551_REGISTRY, address(new ERC6551Registry()).code);

        vm.deal(deployer, 10 ether);
        vm.startPrank(deployer);
        d = _deployDaemon(_defaultParams(deployer));
        vm.stopPrank();

        // alice mints a Chog and wakes its Daemon
        vm.prank(alice);
        tokenId = d.chog.freeMint();
        account = DaemonAccount(
            payable(
                IERC6551Registry(ERC6551_REGISTRY).createAccount(
                    address(d.implementation), DAEMON_SALT, block.chainid, address(d.chog), tokenId
                )
            )
        );
        assertEq(address(account), d.chog.daemonOf(tokenId), "daemonOf must match registry");
        assertEq(account.owner(), alice);

        // alice deposits 1,000 dUSD split across both vaults
        d.dusd.mint(alice, 1_000e18);
        vm.startPrank(alice);
        d.dusd.transfer(address(account), 1_000e18);
        account.allocate(address(d.stableVault), 600e18);
        account.allocate(address(d.degenVault), 400e18);
        vm.stopPrank();
    }

    function test_fullFlow() public {
        vm.txGasPrice(50 gwei);
        uint256 deposited = account.totalAssets();
        assertApproxEqAbs(deposited, 1_000e18, 1e12);

        // compounding is blocked during the cooldown
        vm.expectRevert();
        account.compound(carol);

        // a friend hypes with MON
        vm.warp(block.timestamp + 30 minutes);
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        account.hype{value: 0.1 ether}();
        (uint256 mult, uint256 expiresAt, uint256 potMon,) = account.getBoost();
        assertEq(mult, 10_500, "one hype = +0.05x");
        assertGt(expiresAt, block.timestamp);
        assertEq(potMon, 0.1 ether);

        // anyone compounds through the hub and earns the bounty
        uint256 pendingBounty = account.pendingBounty();
        assertGt(pendingBounty, 0, "bounty should be available");
        address[] memory accounts = new address[](1);
        accounts[0] = address(account);
        vm.prank(carol);
        DaemonHub.Result[] memory res = d.hub.compoundMany(accounts);
        assertTrue(res[0].success, "compound should succeed");
        assertGt(d.dusd.balanceOf(carol), 0, "keeper is paid in dUSD");
        assertEq(d.dusd.balanceOf(carol), res[0].bounty);
        assertLt(res[0].bounty, res[0].profit, "bounty is a slice of profit");
        assertGt(account.lifetimeYield(), 0);
        assertGt(account.totalAssets(), deposited, "Daemon grew");
        assertTrue(bytes(account.lastMessage()).length > 0);

        // the NFT image reflects a live Daemon
        assertGt(bytes(d.chog.livingURI(tokenId)).length, 1000);
        assertGt(bytes(d.chog.tokenURI(tokenId)).length, 60); // real Chog Genesis ipfs:// pointer

        // cooldown again right after compounding
        vm.expectRevert();
        account.compound(carol);

        // hype with $CHOG after the per-user cooldown
        vm.warp(block.timestamp + 1 hours + 1);
        d.chogToken.mint(bob, 100e18);
        vm.startPrank(bob);
        d.chogToken.approve(address(account), 100e18);
        account.hypeWithChog(50e18);
        vm.stopPrank();
        (uint256 multAfterChog, , , uint256 potChog) = account.getBoost();
        assertEq(potChog, 45e18, "10% of a CHOG hype is burned, the rest funds the pot");
        assertEq(d.chogToken.balanceOf(account.BURN_ADDRESS()), 5e18);
        assertGe(multAfterChog, 11_000, "a CHOG hype adds +0.10x");

        // the Chog is sold: everything follows the NFT
        vm.prank(alice);
        d.chog.transferFrom(alice, dave, tokenId);
        assertEq(account.owner(), dave);

        vm.prank(alice);
        vm.expectRevert();
        account.sweepToOwner();

        uint256 daveMonBefore = dave.balance;
        vm.prank(dave);
        account.sweepToOwner();
        assertGt(d.dusd.balanceOf(dave), deposited, "new owner receives principal + yield");
        assertEq(account.totalAssets(), 0);
        assertGt(dave.balance + d.wmon.balanceOf(dave), daveMonBefore, "unused MON pot goes to owner");
        assertGt(d.chogToken.balanceOf(dave), 0, "unused CHOG pot goes to owner");
    }

    function test_noOwnerPowersForStrangers() public {
        vm.startPrank(carol);
        vm.expectRevert();
        account.allocate(address(d.stableVault), 1);
        vm.expectRevert();
        account.deallocate(address(d.stableVault), 1);
        vm.expectRevert();
        account.execute(carol, 0, "", 0);
        vm.expectRevert();
        account.sweepToOwner();
        vm.stopPrank();
    }

    function test_neglectedDaemonGetsTired() public {
        vm.warp(block.timestamp + 4 days);
        assertEq(uint8(account.getMood()), uint8(IDaemonAccount.Mood.Tired));
    }

    // ------------------------------------------------------------------ audit regressions

    /// A seller must not be able to keep an allowance on the Daemon's assets after selling the Chog.
    function test_execute_blocksApprovals() public {
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.ForbiddenSelector.selector, bytes4(0x095ea7b3)));
        account.execute(address(d.stableVault), 0, abi.encodeWithSignature("approve(address,uint256)", alice, type(uint256).max), 0);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.ForbiddenSelector.selector, bytes4(0x095ea7b3)));
        account.execute(address(d.dusd), 0, abi.encodeWithSignature("approve(address,uint256)", alice, 1), 0);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.ForbiddenSelector.selector, bytes4(0xa22cb465)));
        account.execute(address(d.chog), 0, abi.encodeWithSignature("setApprovalForAll(address,bool)", alice, true), 0);
        vm.stopPrank();
    }

    /// Sending a Chog into its own (or any Chog's) account would lock funds forever, even via plain transferFrom.
    function test_chog_cannotBeSentToChogAccount() public {
        vm.prank(alice);
        vm.expectRevert(bytes4(keccak256("ChogCannotOwnChog()")));
        d.chog.transferFrom(alice, address(account), tokenId);

        vm.prank(bob);
        uint256 other = d.chog.freeMint();
        address otherAccount = IERC6551Registry(ERC6551_REGISTRY).createAccount(
            address(d.implementation), DAEMON_SALT, block.chainid, address(d.chog), other
        );
        vm.prank(alice);
        vm.expectRevert(bytes4(keccak256("ChogCannotOwnChog()")));
        d.chog.transferFrom(alice, otherAccount, tokenId);
    }

    /// Rewards accrued before a full withdrawal must still reach the owner on sweep.
    function test_sweep_collectsRewardsAfterFullDeallocate() public {
        vm.warp(block.timestamp + 1 days);
        vm.startPrank(alice);
        account.deallocate(address(d.stableVault), d.stableVault.balanceOf(address(account)));
        account.deallocate(address(d.degenVault), d.degenVault.balanceOf(address(account)));
        account.sweepToOwner();
        vm.stopPrank();
        assertGt(d.dmnr.balanceOf(alice), 0, "accrued DMNR rewards reach the owner");
        assertApproxEqAbs(d.dusd.balanceOf(alice), 1_000e18, 1e12, "principal back");
    }

    /// Batched compounds are attributed to the keeper (bounty recipient), not to the hub contract.
    function test_compounded_attributesKeeperThroughHub() public {
        vm.warp(block.timestamp + 30 minutes);
        address[] memory accounts = new address[](1);
        accounts[0] = address(account);
        vm.expectEmit(true, true, false, false, address(account));
        emit IDaemonAccount.Compounded(tokenId, carol, 0, 0);
        vm.prank(carol);
        d.hub.compoundMany(accounts);
    }

    /// Owner transfers via execute must not leave phantom pot accounting behind.
    function test_execute_clampsPots() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        account.hype{value: 0.5 ether}();
        vm.prank(alice);
        account.execute(alice, 0.4 ether, "", 0);
        (,, uint256 potMon,) = account.getBoost();
        assertEq(potMon, 0.1 ether);
    }

    function test_rewardsKeepFlowingForManyCompounds() public {
        for (uint256 i; i < 5; i++) {
            vm.warp(block.timestamp + 11 minutes);
            vm.prank(carol);
            account.compound(carol);
        }
        assertGt(account.lifetimeYield(), 0);
    }
}
