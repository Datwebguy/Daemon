// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Base64Decode} from "./mocks/Base64Decode.sol";
import {ChogRealTraits, IChogTraitRows, IChogTraitNames} from "../../src/chog/ChogRealTraits.sol";
import {ChogTraitRows0} from "../../src/chog/data/ChogTraitRows0.sol";
import {ChogTraitRows1} from "../../src/chog/data/ChogTraitRows1.sol";
import {ChogTraitNames} from "../../src/chog/data/ChogTraitNames.sol";

/// @dev Spot checks against the real Chog Genesis metadata (fetched from IPFS on 2026-10-19). The full 1,969-token
///      comparison is run against a deployed copy by script/verify-chog-traits.mjs.
contract ChogRealTraitsTest is Test {
    ChogRealTraits r;

    function setUp() public {
        r = new ChogRealTraits(
            IChogTraitRows(address(new ChogTraitRows0())),
            IChogTraitRows(address(new ChogTraitRows1())),
            IChogTraitNames(address(new ChogTraitNames()))
        );
    }

    function test_chog1() public view {
        assertEq(
            r.traitsJson(1),
            '{"trait_type":"Background","value":"Light Magenta"},{"trait_type":"Aura","value":"Fiery Aura"},'
            '{"trait_type":"Base","value":"Origin"},{"trait_type":"Skin","value":"Black"},'
            '{"trait_type":"Side","value":"Right"},{"trait_type":"Body","value":"White Pure Shirt"},'
            '{"trait_type":"Mouth","value":"Bubblegum"},{"trait_type":"Eyes","value":"Gradient visor"},'
            '{"trait_type":"Head","value":"Peace hat"},{"trait_type":"Form","value":"Chog"},'
            '{"trait_type":"Tier","value":"Common"},{"trait_type":"Naked","value":"No"}'
        );
    }

    function test_chog1492_secondHalfBoundaryNeighbours() public view {
        assertEq(
            r.traitsJson(1492),
            '{"trait_type":"Background","value":"Rosie"},{"trait_type":"Aura","value":"Wind"},'
            '{"trait_type":"Base","value":"Origin"},{"trait_type":"Skin","value":"Origin"},'
            '{"trait_type":"Side","value":"Left"},{"trait_type":"Mouth","value":"Rainbow Puke"},'
            '{"trait_type":"Eyes","value":"Angry"},{"trait_type":"Head","value":"MEGA Chog"},'
            '{"trait_type":"Form","value":"Chog"},{"trait_type":"Tier","value":"Uncommon"},'
            '{"trait_type":"Naked","value":"No"}'
        );
    }

    function test_skipsTraitsAnArtworkLacks() public view {
        // Chog #1 has no Accessory; the output must not contain an empty or invented one.
        assertEq(bytes(r.traitsJson(1)).length > 0, true);
        (string memory t, string memory v) = r.traitOf(1, 12);
        assertEq(t, "Accessory");
        assertEq(v, "");
        (t, v) = r.traitOf(1492, 8);
        assertEq(t, "Head");
        assertEq(v, "MEGA Chog");
    }

    function test_everyArtworkRendersValidLookingJson() public view {
        // first, last, the split boundary and a spread in between
        uint256[8] memory ids = [uint256(1), 2, 985, 986, 987, 1000, 1968, 1969];
        for (uint256 i; i < ids.length; ++i) {
            bytes memory j = bytes(r.traitsJson(ids[i]));
            assertGt(j.length, 100);
            assertEq(j[0], bytes1("{"));
            assertEq(j[j.length - 1], bytes1("}"));
        }
    }

    function test_outOfRange() public {
        vm.expectRevert(abi.encodeWithSelector(ChogRealTraits.ArtworkOutOfRange.selector, 0));
        r.traitsJson(0);
        vm.expectRevert(abi.encodeWithSelector(ChogRealTraits.ArtworkOutOfRange.selector, 1970));
        r.traitsJson(1970);
        vm.expectRevert(ChogRealTraits.BadData.selector);
        r.traitOf(1, 13);
    }

    function test_constructorRejectsMismatchedData() public {
        ChogTraitRows1 b = new ChogTraitRows1();
        ChogTraitNames n = new ChogTraitNames();
        vm.expectRevert(ChogRealTraits.BadData.selector);
        new ChogRealTraits(IChogTraitRows(address(b)), IChogTraitRows(address(b)), IChogTraitNames(address(n)));
    }
}
