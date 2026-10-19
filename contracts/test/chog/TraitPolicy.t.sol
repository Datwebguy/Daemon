// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TraitPolicy} from "../../src/chog/TraitPolicy.sol";
import {MockChog} from "../../src/chog/MockChog.sol";
import {IChogTraits, ITraitPolicy} from "../../src/interfaces/IChog.sol";
import {IDaemonAccount} from "../../src/interfaces/IDaemonAccount.sol";
import {TraitsStub, HostileDaemon} from "./mocks/MockDaemonAccount.sol";

contract TraitPolicyTest is Test {
    TraitPolicy internal policy;
    TraitsStub internal stub;

    function setUp() public {
        policy = new TraitPolicy();
        stub = new TraitsStub();
    }

    function test_mapping_vibeToMood() public {
        uint8[5] memory expected = [
            uint8(IDaemonAccount.Mood.Chill), // Calm
            uint8(IDaemonAccount.Mood.Smug), // Cocky
            uint8(IDaemonAccount.Mood.Chaotic), // Wild
            uint8(IDaemonAccount.Mood.Flexing), // Flashy
            uint8(IDaemonAccount.Mood.Tired) // Sleepy
        ];
        for (uint256 v; v < 5; ++v) {
            stub.setVibe(v);
            assertEq(policy.moodBias(address(stub), 1), expected[v]);
        }
    }

    function test_withMockChog() public {
        MockChog chog = new MockChog(20, 100);
        for (uint256 i; i < 20; ++i) {
            vm.prevrandao(bytes32(i * 7919));
            uint256 id = chog.freeMint();
            assertEq(policy.moodBias(address(chog), id), chog.traitsOf(id).vibe);
        }
        // nonexistent token -> traitsOf reverts -> default
        assertEq(policy.moodBias(address(chog), 999), policy.DEFAULT_MOOD());
    }

    function test_fallbacks() public {
        // EOA
        assertEq(policy.moodBias(makeAddr("eoa"), 1), 0);
        // out-of-range vibe
        stub.setVibe(7);
        assertEq(policy.moodBias(address(stub), 1), 0);
        // reverting / malformed / gas-burning contracts
        for (uint256 mode; mode < 4; ++mode) {
            assertEq(policy.moodBias(address(new HostileDaemon(mode)), 1), 0);
        }
        // contract without traitsOf
        assertEq(policy.moodBias(address(policy), 1), 0);
    }

    function test_interface() public view {
        ITraitPolicy p = policy;
        assertEq(p.moodBias(address(0), 0), 0);
    }

    // needed for MockChog._safeMint to this test contract
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
