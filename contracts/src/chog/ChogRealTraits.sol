// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The two packed trait-row contracts and the names contract written by script/gen-chog-traits.mjs.
interface IChogTraitRows {
    function FIRST_ID() external pure returns (uint256);
    function LAST_ID() external pure returns (uint256);
    function rows() external pure returns (bytes memory);
}

interface IChogTraitNames {
    function names() external pure returns (bytes memory);
    function offsets() external pure returns (uint16[13] memory);
}

/// @title ChogRealTraits
/// @notice The REAL Chog Genesis traits (1,969 artworks, 13 trait types) readable on-chain, so a testnet Chog's
///         `tokenURI` can show its real traits next to its live Daemon state without any off-chain metadata.
/// @dev Pure reader over three immutable data contracts; it holds no state and has no owner. Names are plain text
///      (the generator rejects quotes, backslashes and control characters), so the JSON needs no escaping.
contract ChogRealTraits {
    uint256 public constant TRAIT_TYPES = 13;
    uint256 public constant SUPPLY = 1969;

    IChogTraitRows public immutable rows0;
    IChogTraitRows public immutable rows1;
    IChogTraitNames public immutable namesData;

    error ArtworkOutOfRange(uint256 artId);
    error BadData();

    constructor(IChogTraitRows rows0_, IChogTraitRows rows1_, IChogTraitNames names_) {
        if (
            rows0_.FIRST_ID() != 1 || rows1_.FIRST_ID() != rows0_.LAST_ID() + 1 || rows1_.LAST_ID() != SUPPLY
                || names_.offsets().length != TRAIT_TYPES
        ) revert BadData();
        rows0 = rows0_;
        rows1 = rows1_;
        namesData = names_;
    }

    /// @notice JSON array items for the artwork's real traits, e.g. `{"trait_type":"Head","value":"MEGA Chog"},...`
    ///         (no brackets, so the caller can append live attributes). Traits the artwork lacks are skipped.
    function traitsJson(uint256 artId) external view returns (string memory out) {
        if (artId == 0 || artId > SUPPLY) revert ArtworkOutOfRange(artId);
        bytes memory row = _row(artId);
        bytes memory names = namesData.names();
        uint16[13] memory offs = namesData.offsets();
        bool first = true;
        for (uint256 t; t < TRAIT_TYPES; ++t) {
            uint256 idx = uint8(row[t]);
            if (idx == 0) continue;
            (string memory typeName, string memory value) = _lookup(names, offs[t], idx);
            out = string.concat(out, first ? "" : ",", '{"trait_type":"', typeName, '","value":"', value, '"}');
            first = false;
        }
    }

    /// @notice Trait value of one type for an artwork (empty if the artwork lacks it).
    function traitOf(uint256 artId, uint256 typeIndex) external view returns (string memory typeName, string memory value) {
        if (artId == 0 || artId > SUPPLY) revert ArtworkOutOfRange(artId);
        if (typeIndex >= TRAIT_TYPES) revert BadData();
        uint256 idx = uint8(_row(artId)[typeIndex]);
        bytes memory names = namesData.names();
        uint16[13] memory offs = namesData.offsets();
        (typeName, value) = _lookup(names, offs[typeIndex], idx == 0 ? 1 : idx);
        if (idx == 0) value = "";
    }

    function _row(uint256 artId) internal view returns (bytes memory row) {
        bool inFirst = artId <= rows0.LAST_ID();
        bytes memory all = inFirst ? rows0.rows() : rows1.rows();
        uint256 first = inFirst ? 1 : rows0.LAST_ID() + 1;
        uint256 at = (artId - first) * TRAIT_TYPES;
        if (all.length < at + TRAIT_TYPES) revert BadData();
        row = new bytes(TRAIT_TYPES);
        for (uint256 i; i < TRAIT_TYPES; ++i) {
            row[i] = all[at + i];
        }
    }

    /// @dev Block layout at `off`: [len][type name][count][len][value]... ; `idx` is 1-based.
    function _lookup(bytes memory names, uint256 off, uint256 idx)
        internal
        pure
        returns (string memory typeName, string memory value)
    {
        uint256 p = off;
        uint256 tl = uint8(names[p++]);
        typeName = _slice(names, p, tl);
        p += tl;
        uint256 count = uint8(names[p++]);
        if (idx > count) revert BadData();
        for (uint256 i = 1; i <= count; ++i) {
            uint256 vl = uint8(names[p++]);
            if (i == idx) return (typeName, _slice(names, p, vl));
            p += vl;
        }
    }

    function _slice(bytes memory b, uint256 start, uint256 len) internal pure returns (string memory s) {
        bytes memory o = new bytes(len);
        for (uint256 i; i < len; ++i) {
            o[i] = b[start + i];
        }
        s = string(o);
    }
}
