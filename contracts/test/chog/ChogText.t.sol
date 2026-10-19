// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChogText} from "../../src/chog/ChogText.sol";

contract ChogTextTest is Test {
    function test_formatUnits() public pure {
        assertEq(ChogText.formatUnits(0, 18), "0.00");
        assertEq(ChogText.formatUnits(1 ether, 18), "1.00");
        assertEq(ChogText.formatUnits(12.3456 ether, 18), "12.34");
        assertEq(ChogText.formatUnits(0.05 ether, 18), "0.05");
        assertEq(ChogText.formatUnits(1_500_000, 6), "1.50");
    }

    function test_formatBps() public pure {
        assertEq(ChogText.formatBps(10_000), "1.00x");
        assertEq(ChogText.formatBps(11_500), "1.15x");
        assertEq(ChogText.formatBps(12_505), "1.25x");
        assertEq(ChogText.formatBps(20_000), "2.00x");
    }

    function test_escapeXml() public pure {
        assertEq(ChogText.escapeXml("a&b<c>d\"e'f"), "a&amp;b&lt;c&gt;d&quot;e&#39;f");
        assertEq(ChogText.escapeXml(""), "");
    }

    function test_escapeJson() public pure {
        assertEq(ChogText.escapeJson("say \"hi\" \\o/"), "say \\\"hi\\\" \\\\o/");
    }

    function test_sanitize_truncatesOnCharBoundary() public pure {
        // "ab" + 3-byte char (€) : cutting at 4 bytes must not split the euro sign
        assertEq(ChogText.sanitize(bytes(unicode"ab€c"), 4), "ab...");
        assertEq(ChogText.sanitize(bytes(unicode"ab€c"), 5), unicode"ab€...");
        assertEq(ChogText.sanitize(bytes(unicode"ab€c"), 6), unicode"ab€c");
    }

    function test_sanitize_invalidUtf8() public pure {
        assertEq(ChogText.sanitize(hex"41ff42", 10), "A?B");
        assertEq(ChogText.sanitize(hex"41e282", 10), "A??"); // truncated 3-byte sequence
        assertEq(ChogText.sanitize(hex"eda080", 10), "???"); // UTF-16 surrogate
        assertEq(ChogText.sanitize(hex"c0af", 10), "??"); // overlong
        assertEq(ChogText.sanitize(hex"41efbfbe42", 10), "A???B"); // U+FFFE is not a legal XML char
        assertEq(ChogText.sanitize(hex"efbfbf", 10), "???"); // U+FFFF
        assertEq(ChogText.sanitize(hex"efbfbd", 10), unicode"�"); // U+FFFD stays
        assertEq(ChogText.sanitize(hex"f09f94a5", 10), unicode"🔥");
        assertEq(ChogText.sanitize(hex"0a0d097f", 10), "    ");
    }

    function testFuzz_sanitize_neverReverts(bytes memory raw, uint8 maxBytes) public pure {
        string memory out = ChogText.sanitize(raw, maxBytes);
        assertLe(bytes(out).length, uint256(maxBytes) + 3);
        ChogText.escapeJson(ChogText.escapeXml(out));
    }
}
