// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice On-chain traits of a (mock) Chog.
interface IChogTraits {
    struct Traits {
        uint8 background; // 0-4
        uint8 body; // 0-4
        uint8 eyes; // 0-4
        uint8 vibe; // 0 = Calm, 1 = Cocky, 2 = Wild, 3 = Flashy, 4 = Sleepy
    }

    function traitsOf(uint256 tokenId) external view returns (Traits memory);
}

/// @notice Maps traits to a personality bias. Mood only; it never changes how much yield exists.
interface ITraitPolicy {
    /// @return biasMood the mood (as IDaemonAccount.Mood uint8) this Chog leans toward when nothing else dominates
    function moodBias(address chog, uint256 tokenId) external view returns (uint8 biasMood);
}
