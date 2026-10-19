// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DaemonBase} from "./DaemonBase.t.sol";
import {DaemonAccount} from "../../src/account/DaemonAccount.sol";
import {IDaemonAccount} from "../../src/interfaces/IDaemonAccount.sol";
import {IERC6551Account, IERC6551Executable} from "../../src/interfaces/IERC6551.sol";
import {ASource, AToken} from "./mocks/AccountMocks.sol";

contract DaemonAccountIdentityTest is DaemonBase {
    /// @dev Runtime code of the canonical registry as deployed on Monad Testnet (eth_getCode, 2026-10-18).
    bytes internal constant CANONICAL_CODE =
        hex"608060405234801561001057600080fd5b50600436106100365760003560e01c8063246a00211461003b5780638a54c52f1461006a575b600080fd5b61004e6100493660046101b7565b61007d565b6040516001600160a01b03909116815260200160405180910390f35b61004e6100783660046101b7565b6100e1565b600060806024608c376e5af43d82803e903d91602b57fd5bf3606c5285605d52733d60ad80600a3d3981f3363d3d373d3d3d363d7360495260ff60005360b76055206035523060601b60015284601552605560002060601b60601c60005260206000f35b600060806024608c376e5af43d82803e903d91602b57fd5bf3606c5285605d52733d60ad80600a3d3981f3363d3d373d3d3d363d7360495260ff60005360b76055206035523060601b600152846015526055600020803b61018b578560b760556000f580610157576320188a596000526004601cfd5b80606c52508284887f79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf887226060606ca46020606cf35b8060601b60601c60005260206000f35b80356001600160a01b03811681146101b257600080fd5b919050565b600080600080600060a086880312156101cf57600080fd5b6101d88661019b565b945060208601359350604086013592506101f46060870161019b565b94979396509194608001359291505056fea2646970667358221220ea2fe53af507453c64dd7c1db05549fa47a298dfb825d6d11e1689856135f16764736f6c63430008110033";

    // ---------------------------------------------------------------- registry

    function _expected(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        internal
        pure
        returns (address)
    {
        bytes memory code = abi.encodePacked(
            hex"3d60ad80600a3d3981f3363d3d373d3d3d363d73",
            implementation,
            hex"5af43d82803e903d91602b57fd5bf3",
            abi.encode(salt, chainId, tokenContract, tokenId)
        );
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CANONICAL_REGISTRY, salt, keccak256(code)))))
        );
    }

    function testFuzz_registryAddressDerivation(bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        public
        view
    {
        address predicted = reg6551.account(address(impl), salt, chainId, tokenContract, tokenId);
        assertEq(predicted, _expected(address(impl), salt, chainId, tokenContract, tokenId));
    }

    function test_portMatchesCanonicalBytecodeBehaviour() public {
        address viaPort = reg6551.account(address(impl), bytes32(uint256(7)), 10143, address(nft), 42);
        vm.etch(CANONICAL_REGISTRY, CANONICAL_CODE);
        address viaCanonical = reg6551.account(address(impl), bytes32(uint256(7)), 10143, address(nft), 42);
        assertEq(viaPort, viaCanonical);
        // the canonical code also deploys the same clone
        nft.mint(bob, 9);
        address created = reg6551.createAccount(address(impl), bytes32(0), block.chainid, address(nft), 9);
        assertEq(DaemonAccount(payable(created)).owner(), bob);
    }

    function test_createAccountIdempotent() public {
        address a1 = reg6551.createAccount(address(impl), bytes32(0), block.chainid, address(nft), 1);
        address a2 = reg6551.createAccount(address(impl), bytes32(0), block.chainid, address(nft), 1);
        assertEq(a1, address(acct));
        assertEq(a2, a1);
        assertEq(reg6551.account(address(impl), bytes32(0), block.chainid, address(nft), 1), a1);
    }

    function test_cloneLayoutAndToken() public view {
        assertEq(address(acct).code.length, 0xad);
        (uint256 chainId, address tokenContract, uint256 tokenId) = acct.token();
        assertEq(chainId, block.chainid);
        assertEq(tokenContract, address(nft));
        assertEq(tokenId, 1);
        assertEq(address(acct.STRATEGY_REGISTRY()), address(strategy));
    }

    function test_constructorRejectsZero() public {
        vm.expectRevert(DaemonAccount.ZeroAddress.selector);
        new DaemonAccount(address(0));
    }

    // ---------------------------------------------------------------- ownership

    function test_ownerFollowsTransfer() public {
        assertEq(acct.owner(), alice);
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        assertEq(acct.owner(), bob);

        vm.prank(alice);
        vm.expectRevert(DaemonAccount.NotOwner.selector);
        acct.execute(alice, 0, "", 0);

        vm.prank(bob);
        acct.execute(bob, 0, "", 0);
    }

    function test_foreignChainHasNoOwner() public {
        address foreign = reg6551.createAccount(address(impl), bytes32(0), 1, address(nft), 1);
        assertEq(DaemonAccount(payable(foreign)).owner(), address(0));
        vm.prank(alice);
        vm.expectRevert(DaemonAccount.NotOwner.selector);
        DaemonAccount(payable(foreign)).execute(alice, 0, "", 0);
    }

    function test_burnedOrMissingTokenHasNoOwner() public {
        DaemonAccount a = _createAccount(77); // never minted
        assertEq(a.owner(), address(0));
    }

    function testFuzz_nonOwnerCannotUseOwnerFunctions(address caller) public {
        vm.assume(caller != alice);
        vm.startPrank(caller);
        vm.expectRevert(DaemonAccount.NotOwner.selector);
        acct.execute(caller, 0, "", 0);
        vm.expectRevert(DaemonAccount.NotOwner.selector);
        acct.allocate(address(sourceA), 1);
        vm.expectRevert(DaemonAccount.NotOwner.selector);
        acct.deallocate(address(sourceA), 1);
        vm.expectRevert(DaemonAccount.NotOwner.selector);
        acct.sweepToOwner();
        vm.stopPrank();
    }

    function test_executeCallsAndBumpsState() public {
        vm.deal(address(acct), 1 ether);
        uint256 s0 = acct.state();
        vm.prank(alice);
        acct.execute(bob, 0.4 ether, "", 0);
        assertEq(bob.balance, 0.4 ether);
        assertEq(acct.state(), s0 + 1);

        // bubbles reverts
        vm.prank(alice);
        vm.expectRevert();
        acct.execute(address(sourceA), 0, abi.encodeCall(ASource.redeem, (1, alice, alice)), 0);
    }

    function test_executeRejectsNonCallOperations(uint8 op) public {
        vm.assume(op != 0);
        vm.prank(alice);
        vm.expectRevert(DaemonAccount.InvalidOperation.selector);
        acct.execute(bob, 0, "", op);
    }

    function test_ownershipCycleGuard() public {
        vm.prank(alice);
        vm.expectRevert(DaemonAccount.OwnershipCycle.selector);
        nft.safeTransferFrom(alice, address(acct), 1);
        assertEq(nft.ownerOf(1), alice);

        // other NFTs are fine
        nft.mint(alice, 2);
        vm.prank(alice);
        nft.safeTransferFrom(alice, address(acct), 2);
        assertEq(nft.ownerOf(2), address(acct));
    }

    // ---------------------------------------------------------------- signatures / interfaces

    function test_isValidSignature() public {
        bytes32 hash = keccak256("daemon");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, hash);
        assertEq(acct.isValidSignature(hash, abi.encodePacked(r, s, v)), bytes4(0x1626ba7e));

        (v, r, s) = vm.sign(0xB0B, hash);
        assertEq(acct.isValidSignature(hash, abi.encodePacked(r, s, v)), bytes4(0xffffffff));

        // after transfer the old owner's signature is no longer valid
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        (v, r, s) = vm.sign(alicePk, hash);
        assertEq(acct.isValidSignature(hash, abi.encodePacked(r, s, v)), bytes4(0xffffffff));
    }

    function test_isValidSigner() public view {
        assertEq(acct.isValidSigner(alice, ""), IERC6551Account.isValidSigner.selector);
        assertEq(acct.isValidSigner(bob, ""), bytes4(0));
    }

    function test_supportsInterface() public view {
        assertTrue(acct.supportsInterface(0x01ffc9a7)); // ERC165
        assertTrue(acct.supportsInterface(0x6faff5f1)); // IERC6551Account
        assertTrue(acct.supportsInterface(0x51945447)); // IERC6551Executable
        assertTrue(acct.supportsInterface(0x1626ba7e)); // IERC1271
        assertTrue(acct.supportsInterface(0x150b7a02)); // IERC721Receiver
        assertTrue(acct.supportsInterface(0x4e2312e0)); // IERC1155Receiver
        assertTrue(acct.supportsInterface(type(IDaemonAccount).interfaceId));
        assertEq(type(IERC6551Account).interfaceId, bytes4(0x6faff5f1));
        assertEq(type(IERC6551Executable).interfaceId, bytes4(0x51945447));
        assertFalse(acct.supportsInterface(0xffffffff));
    }

    function test_receivesMon() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        (bool ok,) = address(acct).call{value: 1 ether}("");
        assertTrue(ok);
        (,, uint256 potMon,) = acct.getBoost();
        assertEq(potMon, 0, "plain transfers are not pot");
    }

    // ---------------------------------------------------------------- allocation

    function test_allocateTracksAndDeposits() public view {
        assertEq(sourceA.balanceOf(address(acct)), 1_000e18);
        assertEq(acct.totalAssets(), 1_000e18);
        address[] memory held = acct.heldSources();
        assertEq(held.length, 1);
        assertEq(held[0], address(sourceA));
    }

    function test_capEnforced() public {
        asset.mint(address(acct), CAP);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.CapExceeded.selector, CAP + 1_000e18, CAP));
        acct.allocate(address(sourceA), CAP);
        vm.prank(alice);
        acct.allocate(address(sourceA), CAP - 1_000e18); // exactly to cap is fine
        assertEq(sourceA.balanceOf(address(acct)), CAP);
    }

    function test_unapprovedSourceReverts() public {
        ASource rogue = new ASource(address(asset), address(reward));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.SourceNotApproved.selector, address(rogue)));
        acct.allocate(address(rogue), 1);
    }

    function test_assetMismatchReverts() public {
        ASource wrong = new ASource(address(reward), address(reward));
        strategy.approve(address(wrong), CAP);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DaemonAccount.AssetMismatch.selector, address(wrong)));
        acct.allocate(address(wrong), 1);
    }

    function test_maxSourcesBounded() public {
        asset.mint(address(acct), 100e18);
        for (uint256 i = 1; i < 8; ++i) {
            ASource s = new ASource(address(asset), address(reward));
            strategy.approve(address(s), CAP);
            vm.prank(alice);
            acct.allocate(address(s), 1e18);
        }
        ASource ninth = new ASource(address(asset), address(reward));
        strategy.approve(address(ninth), CAP);
        vm.prank(alice);
        vm.expectRevert(DaemonAccount.TooManySources.selector);
        acct.allocate(address(ninth), 1e18);
    }

    function test_deallocateUntracksWhenEmpty() public {
        vm.prank(alice);
        acct.deallocate(address(sourceA), 400e18);
        assertEq(acct.heldSources().length, 1);
        assertEq(asset.balanceOf(address(acct)), 400e18);
        vm.prank(alice);
        acct.deallocate(address(sourceA), 600e18);
        assertEq(acct.heldSources().length, 0);
        assertEq(acct.totalAssets(), 1_000e18);
    }

    function test_zeroAmountsRevert() public {
        vm.startPrank(alice);
        vm.expectRevert(DaemonAccount.ZeroAmount.selector);
        acct.allocate(address(sourceA), 0);
        vm.expectRevert(DaemonAccount.ZeroAmount.selector);
        acct.deallocate(address(sourceA), 0);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- sweep

    function test_sweepExitsEverythingEvenIfOneClaimReverts() public {
        ASource sourceB = new ASource(address(asset), address(reward));
        strategy.approve(address(sourceB), CAP);
        asset.mint(address(acct), 500e18);
        vm.prank(alice);
        acct.allocate(address(sourceB), 500e18);

        _pend(5e18);
        sourceA.setClaimReverts(true);
        sourceB.setPending(address(acct), 7e18);

        _hype(bob, 1 ether);
        vm.deal(carol, 100e18);
        chog.mint(carol, 20e18);
        vm.warp(block.timestamp + 1 hours);
        vm.startPrank(carol);
        chog.approve(address(acct), 20e18);
        acct.hypeWithChog(20e18);
        vm.stopPrank();
        wmon.mint(address(acct), 2e18);
        asset.mint(address(acct), 3e18); // idle

        uint256 s0 = acct.state();
        vm.prank(alice);
        acct.sweepToOwner();

        assertEq(asset.balanceOf(alice), 1_503e18, "all principal + idle");
        assertEq(reward.balanceOf(alice), 7e18, "rewards of the working source");
        assertEq(chog.balanceOf(alice), 20e18, "chog pot");
        assertEq(wmon.balanceOf(alice), 2e18, "wmon");
        assertEq(alice.balance, 1 ether, "mon pot");
        assertEq(acct.totalAssets(), 0);
        assertEq(acct.heldSources().length, 0);
        (,, uint256 potMon, uint256 potChog) = acct.getBoost();
        assertEq(potMon + potChog, 0);
        assertEq(acct.state(), s0 + 1);
    }

    function test_sweepKeepsSourceWhenRedeemBroken() public {
        sourceA.setRedeemReverts(true);
        asset.mint(address(acct), 1e18);
        vm.prank(alice);
        acct.sweepToOwner(); // does not revert
        assertEq(asset.balanceOf(alice), 1e18);
        assertEq(acct.heldSources().length, 1, "still tracked for a later exit");
    }
}
