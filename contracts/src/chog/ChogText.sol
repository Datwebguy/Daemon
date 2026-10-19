// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title ChogText
/// @notice Text helpers for on-chain metadata: UTF-8 sanitising, XML escaping and number formatting.
/// @dev All functions are internal and pure; they never revert on hostile input.
library ChogText {
    /// @notice Returns a copy of `raw` that is valid UTF-8, has no control characters and is at most
    /// `maxBytes` long (plus a trailing "..." when it had to be cut).
    /// @dev Invalid UTF-8 bytes become '?', control characters (0x00-0x1F, 0x7F) become ' '.
    /// Truncation always happens on a character boundary, so multi-byte characters are never split.
    /// @param raw Untrusted input bytes.
    /// @param maxBytes Maximum number of bytes kept from the input (before the ellipsis).
    function sanitize(bytes memory raw, uint256 maxBytes) internal pure returns (string memory) {
        uint256 len = raw.length;
        bytes memory out = new bytes(len < maxBytes ? len : maxBytes);
        uint256 o;
        uint256 i;
        bool truncated;
        while (i < len) {
            uint256 n = _seqLen(raw, i);
            if (o + (n == 0 ? 1 : n) > maxBytes) {
                truncated = true;
                break;
            }
            if (n == 0) {
                out[o++] = "?";
                ++i;
            } else if (n == 1) {
                bytes1 c = raw[i++];
                out[o++] = (uint8(c) < 0x20 || uint8(c) == 0x7f) ? bytes1(" ") : c;
            } else {
                for (uint256 k; k < n; ++k) {
                    out[o++] = raw[i++];
                }
            }
        }
        assembly ("memory-safe") {
            mstore(out, o)
        }
        return truncated ? string.concat(string(out), "...") : string(out);
    }

    /// @dev Length of the valid UTF-8 sequence starting at `i`, or 0 if the byte there does not start one.
    function _seqLen(bytes memory s, uint256 i) private pure returns (uint256) {
        uint8 b = uint8(s[i]);
        if (b < 0x80) return 1;
        uint256 n;
        uint8 lo = 0x80;
        uint8 hi = 0xbf;
        if (b >= 0xc2 && b <= 0xdf) {
            n = 2;
        } else if (b >= 0xe0 && b <= 0xef) {
            n = 3;
            if (b == 0xe0) lo = 0xa0; // no overlong encodings
            if (b == 0xed) hi = 0x9f; // no UTF-16 surrogates
        } else if (b >= 0xf0 && b <= 0xf4) {
            n = 4;
            if (b == 0xf0) lo = 0x90; // no overlong encodings
            if (b == 0xf4) hi = 0x8f; // max U+10FFFF
        } else {
            return 0;
        }
        if (i + n > s.length) return 0;
        uint8 second = uint8(s[i + 1]);
        if (second < lo || second > hi) return 0;
        for (uint256 k = 2; k < n; ++k) {
            uint8 c = uint8(s[i + k]);
            if (c < 0x80 || c > 0xbf) return 0;
        }
        // U+FFFE / U+FFFF are not legal XML 1.0 characters and break strict SVG parsers.
        if (b == 0xef && second == 0xbf && uint8(s[i + 2]) >= 0xbe) return 0;
        return n;
    }

    /// @notice Escapes the five XML special characters (& < > " ') so text is safe inside SVG.
    function escapeXml(string memory input) internal pure returns (string memory) {
        bytes memory s = bytes(input);
        bytes memory out = new bytes(s.length * 6);
        uint256 o;
        for (uint256 i; i < s.length; ++i) {
            bytes1 c = s[i];
            bytes memory rep;
            if (c == "&") rep = "&amp;";
            else if (c == "<") rep = "&lt;";
            else if (c == ">") rep = "&gt;";
            else if (c == '"') rep = "&quot;";
            else if (c == "'") rep = "&#39;";
            if (rep.length == 0) {
                out[o++] = c;
            } else {
                for (uint256 k; k < rep.length; ++k) {
                    out[o++] = rep[k];
                }
            }
        }
        assembly ("memory-safe") {
            mstore(out, o)
        }
        return string(out);
    }

    /// @notice Escapes a string for use inside a JSON string literal.
    /// @dev Input is expected to be sanitised first (no control characters other than those OZ escapes).
    function escapeJson(string memory input) internal pure returns (string memory) {
        return Strings.escapeJSON(input);
    }

    /// @notice Formats a fixed-point `amount` with `decimals` decimals as "whole.ff" (two places, truncated).
    function formatUnits(uint256 amount, uint8 decimals) internal pure returns (string memory) {
        uint256 unit = 10 ** decimals;
        uint256 whole = amount / unit;
        uint256 cents = decimals >= 2 ? (amount % unit) / (unit / 100) : (amount % unit) * (100 / unit);
        return string.concat(Strings.toString(whole), ".", _twoDigits(cents));
    }

    /// @notice Formats a multiplier in basis points (10000 = 1x) as "1.15x".
    function formatBps(uint256 bps) internal pure returns (string memory) {
        return string.concat(Strings.toString(bps / 10_000), ".", _twoDigits((bps % 10_000) / 100), "x");
    }

    function _twoDigits(uint256 v) private pure returns (string memory) {
        return v < 10 ? string.concat("0", Strings.toString(v)) : Strings.toString(v);
    }
}
