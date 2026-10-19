// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only standard base64 decoder (RFC 4648 alphabet, '=' padding).
library Base64Decode {
    error BadLength();
    error BadChar(bytes1 c);

    function decode(string memory input) internal pure returns (bytes memory out) {
        bytes memory d = bytes(input);
        if (d.length % 4 != 0) revert BadLength();
        if (d.length == 0) return out;
        uint256 pad;
        if (d[d.length - 1] == "=") pad++;
        if (d[d.length - 2] == "=") pad++;
        out = new bytes((d.length / 4) * 3 - pad);
        uint256 o;
        for (uint256 i; i < d.length; i += 4) {
            uint256 n = (_v(d[i]) << 18) | (_v(d[i + 1]) << 12) | (_v(d[i + 2]) << 6) | _v(d[i + 3]);
            if (o < out.length) out[o++] = bytes1(uint8(n >> 16));
            if (o < out.length) out[o++] = bytes1(uint8(n >> 8));
            if (o < out.length) out[o++] = bytes1(uint8(n));
        }
    }

    function _v(bytes1 c) private pure returns (uint256) {
        uint8 x = uint8(c);
        if (x >= 0x41 && x <= 0x5a) return x - 0x41;
        if (x >= 0x61 && x <= 0x7a) return x - 0x61 + 26;
        if (x >= 0x30 && x <= 0x39) return x - 0x30 + 52;
        if (c == "+") return 62;
        if (c == "/") return 63;
        if (c == "=") return 0;
        revert BadChar(c);
    }
}
