// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IChogTraits, ITraitPolicy} from "../interfaces/IChog.sol";

/// @title TraitPolicy
/// @notice Maps a Chog's Vibe trait to the mood its Daemon leans toward:
/// Calm -> Chill, Cocky -> Smug, Wild -> Chaotic, Flashy -> Flexing, Sleepy -> Tired.
/// @dev Stateless and permissionless. It only biases mood and never affects yield.
/// It never reverts: if `chog` does not answer `traitsOf` correctly (non-existent token, wrong contract,
/// malformed data), it falls back to Chill so a Daemon's mood logic can never be bricked by it.
contract TraitPolicy is ITraitPolicy {
    /// @notice Mood returned when traits cannot be read (IDaemonAccount.Mood.Chill).
    uint8 public constant DEFAULT_MOOD = 0;

    uint256 private constant TRAITS_GAS = 50_000;

    /// @inheritdoc ITraitPolicy
    function moodBias(address chog, uint256 tokenId) external view returns (uint8 biasMood) {
        if (chog.code.length == 0) return DEFAULT_MOOD;
        bytes memory callData = abi.encodeCall(IChogTraits.traitsOf, (tokenId));
        bool ok;
        uint256 size;
        uint256 vibe;
        assembly ("memory-safe") {
            // Traits is 4 static words; vibe is the 4th. Copy only those 128 bytes into scratch memory.
            let ptr := mload(0x40)
            ok := staticcall(TRAITS_GAS, chog, add(callData, 0x20), mload(callData), ptr, 0x80)
            size := returndatasize()
            vibe := mload(add(ptr, 0x60))
        }
        if (!ok || size < 128 || vibe > 4) return DEFAULT_MOOD;
        // Vibe and Mood enums share their order, so the mapping is the identity.
        return uint8(vibe);
    }
}
