// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {MockChog} from "../../src/chog/MockChog.sol";
import {IChogTraits} from "../../src/interfaces/IChog.sol";
import {IDaemonAccount} from "../../src/interfaces/IDaemonAccount.sol";
import {ERC6551RegistryMock} from "./mocks/ERC6551RegistryMock.sol";
import {MockDaemonAccount, HostileDaemon} from "./mocks/MockDaemonAccount.sol";
import {Base64Decode} from "./mocks/Base64Decode.sol";

contract MockChogTest is Test {
    MockChog internal chog;
    ERC6551RegistryMock internal registry;
    MockDaemonAccount internal impl;

    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    bytes32 internal constant SALT = bytes32(uint256(0xDAE));

    string internal constant JSON_PREFIX = "data:application/json;base64,";
    string internal constant SVG_PREFIX = "data:image/svg+xml;base64,";

    event DaemonLinked(address indexed registry, address indexed implementation, bytes32 salt);

    function setUp() public {
        vm.prank(deployer);
        chog = new MockChog(3, 10);
        registry = new ERC6551RegistryMock();
        impl = new MockDaemonAccount();
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    function _link() internal {
        vm.prank(deployer);
        chog.setDaemon(address(registry), address(impl), SALT);
    }

    function _mint(address who) internal returns (uint256 id) {
        vm.prank(who);
        id = chog.freeMint();
    }

    /// @dev Mints to alice, links, deploys the account through the registry and returns it.
    function _awakeChog() internal returns (uint256 id, MockDaemonAccount acct) {
        id = _mint(alice);
        _link();
        acct = MockDaemonAccount(registry.createAccount(address(impl), SALT, block.chainid, address(chog), id));
    }

    function _slice(string memory s, uint256 start) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length - start);
        for (uint256 i; i < out.length; ++i) {
            out[i] = b[start + i];
        }
        return string(out);
    }

    function _json(uint256 id) internal view returns (string memory json) {
        string memory uri = chog.tokenURI(id);
        assertEq(vm.indexOf(uri, JSON_PREFIX), 0, "json prefix");
        json = string(Base64Decode.decode(_slice(uri, bytes(JSON_PREFIX).length)));
    }

    function _svgFromJson(string memory json) internal pure returns (string memory) {
        string memory image = vm.parseJsonString(json, ".image");
        assertEq(vm.indexOf(image, SVG_PREFIX), 0, "svg prefix");
        return string(Base64Decode.decode(_slice(image, bytes(SVG_PREFIX).length)));
    }

    function _has(string memory hay, string memory needle) internal pure returns (bool) {
        return vm.indexOf(hay, needle) != type(uint256).max;
    }

    function _attr(string memory json, uint256 i) internal pure returns (string memory) {
        return vm.parseJsonString(json, string.concat(".attributes[", vm.toString(i), "].value"));
    }

    function _expectedTraits(uint256 prevrandao, bytes32 prevHash, uint256 id, address minter)
        internal
        pure
        returns (IChogTraits.Traits memory t)
    {
        bytes32 h = keccak256(abi.encodePacked(prevrandao, prevHash, id, minter));
        t = IChogTraits.Traits(uint8(h[0]) % 5, uint8(h[1]) % 5, uint8(h[2]) % 5, uint8(h[3]) % 5);
    }

    // ------------------------------------------------------------------
    // constructor / mint
    // ------------------------------------------------------------------

    function test_constructor() public view {
        assertEq(chog.name(), "Test Chog");
        assertEq(chog.symbol(), "tCHOG");
        assertEq(chog.deployer(), deployer);
        assertEq(chog.maxPerAddress(), 3);
        assertEq(chog.maxSupply(), 10);
        assertEq(chog.totalSupply(), 0);
        assertEq(chog.daemonOf(1), address(0));
    }

    function test_constructor_revertsOnZeroLimits() public {
        vm.expectRevert(MockChog.InvalidConfig.selector);
        new MockChog(0, 10);
        vm.expectRevert(MockChog.InvalidConfig.selector);
        new MockChog(3, 0);
    }

    function test_freeMint_idsAndCounts() public {
        assertEq(_mint(alice), 1);
        assertEq(_mint(bob), 2);
        assertEq(_mint(alice), 3);
        assertEq(chog.ownerOf(1), alice);
        assertEq(chog.ownerOf(2), bob);
        assertEq(chog.balanceOf(alice), 2);
        assertEq(chog.mintedBy(alice), 2);
        assertEq(chog.totalSupply(), 3);
    }

    function test_freeMint_perAddressLimit() public {
        for (uint256 i; i < 3; ++i) {
            _mint(alice);
        }
        vm.prank(alice);
        vm.expectRevert(MockChog.MintLimitReached.selector);
        chog.freeMint();
        // transferring away does not reset the limit
        vm.prank(alice);
        chog.transferFrom(alice, bob, 1);
        vm.prank(alice);
        vm.expectRevert(MockChog.MintLimitReached.selector);
        chog.freeMint();
    }

    /// EIP-7702-upgraded wallets are EOAs with code that may not implement onERC721Received.
    /// A free mint must still work for them (it uses _mint, not _safeMint).
    function test_freeMint_worksForWalletsWithCodeAndNoReceiver() public {
        address upgraded = makeAddr("upgraded7702");
        vm.etch(upgraded, hex"ef0100d8da6bf26964af9d7eed9e03e53415d37aa96045"); // 7702 delegation marker (23 bytes)
        vm.prank(upgraded);
        uint256 id = chog.freeMint();
        assertEq(chog.ownerOf(id), upgraded);

        address noReceiver = makeAddr("contractWithoutReceiver");
        vm.etch(noReceiver, hex"600160005260206000f3"); // returns a non-selector word to every call
        vm.prank(noReceiver);
        uint256 id2 = chog.freeMint();
        assertEq(chog.ownerOf(id2), noReceiver);
    }

    function test_freeMint_maxSupply() public {
        for (uint256 i; i < 10; ++i) {
            _mint(address(uint160(0x1000 + i)));
        }
        assertEq(chog.totalSupply(), 10);
        vm.prank(alice);
        vm.expectRevert(MockChog.MaxSupplyReached.selector);
        chog.freeMint();
    }

    // ------------------------------------------------------------------
    // traits
    // ------------------------------------------------------------------

    function test_traits_deterministic() public {
        vm.roll(100);
        vm.prevrandao(bytes32(uint256(0xC0FFEE)));
        uint256 id = _mint(alice);
        IChogTraits.Traits memory expected = _expectedTraits(0xC0FFEE, blockhash(99), id, alice);
        IChogTraits.Traits memory got = chog.traitsOf(id);
        assertEq(got.background, expected.background);
        assertEq(got.body, expected.body);
        assertEq(got.eyes, expected.eyes);
        assertEq(got.vibe, expected.vibe);
        // stored, not recomputed: changing block context does not change them
        vm.roll(500);
        vm.prevrandao(bytes32(uint256(1)));
        IChogTraits.Traits memory again = chog.traitsOf(id);
        assertEq(keccak256(abi.encode(again)), keccak256(abi.encode(got)));
    }

    function testFuzz_traits_inRange(uint256 rand, address minter) public {
        vm.assume(minter != address(0) && minter.code.length == 0);
        vm.prevrandao(bytes32(rand));
        uint256 id = _mint(minter);
        IChogTraits.Traits memory t = chog.traitsOf(id);
        assertLt(t.background, 5);
        assertLt(t.body, 5);
        assertLt(t.eyes, 5);
        assertLt(t.vibe, 5);
        IChogTraits.Traits memory e = _expectedTraits(rand, blockhash(block.number - 1), id, minter);
        assertEq(keccak256(abi.encode(t)), keccak256(abi.encode(e)));
    }

    function test_traitsOf_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        chog.traitsOf(1);
    }

    // ------------------------------------------------------------------
    // daemon link
    // ------------------------------------------------------------------

    function test_setDaemon_onlyDeployer() public {
        vm.prank(alice);
        vm.expectRevert(MockChog.NotDeployer.selector);
        chog.setDaemon(address(registry), address(impl), SALT);
    }

    function test_setDaemon_onlyOnce() public {
        vm.expectEmit(true, true, false, true, address(chog));
        emit DaemonLinked(address(registry), address(impl), SALT);
        _link();
        assertEq(chog.erc6551Registry(), address(registry));
        assertEq(chog.daemonImplementation(), address(impl));
        assertEq(chog.daemonSalt(), SALT);

        vm.prank(deployer);
        vm.expectRevert(MockChog.DaemonAlreadySet.selector);
        chog.setDaemon(address(registry), address(0xBEEF), bytes32(0));
    }

    function test_setDaemon_validation() public {
        vm.startPrank(deployer);
        vm.expectRevert(MockChog.ZeroAddress.selector);
        chog.setDaemon(address(0), address(impl), SALT);
        vm.expectRevert(MockChog.ZeroAddress.selector);
        chog.setDaemon(address(registry), address(0), SALT);
        vm.expectRevert(MockChog.RegistryNotContract.selector);
        chog.setDaemon(address(0xBEEF), address(impl), SALT);
        vm.stopPrank();
    }

    function testFuzz_daemonOf_matchesRegistryMath(uint256 tokenId) public {
        _link();
        address viaChog = chog.daemonOf(tokenId);
        address viaRegistry = registry.account(address(impl), SALT, block.chainid, address(chog), tokenId);
        assertEq(viaChog, viaRegistry);

        // independent CREATE2 computation of the ERC-6551 proxy bytecode
        bytes memory code = abi.encodePacked(
            hex"3d60ad80600a3d3981f3363d3d373d3d3d363d73",
            address(impl),
            hex"5af43d82803e903d91602b57fd5bf3",
            abi.encode(SALT, block.chainid, address(chog), tokenId)
        );
        assertEq(viaChog, computeCreate2Address(SALT, keccak256(code), address(registry)));
    }

    function test_daemonOf_equalsDeployedAccount() public {
        (uint256 id, MockDaemonAccount acct) = _awakeChog();
        assertEq(chog.daemonOf(id), address(acct));
        assertGt(address(acct).code.length, 0);
        // the deployed proxy really delegates to the implementation
        acct.setMood(IDaemonAccount.Mood.Smug);
        assertEq(uint8(acct.getMood()), uint8(IDaemonAccount.Mood.Smug));
    }

    // ------------------------------------------------------------------
    // ERC-165
    // ------------------------------------------------------------------

    function test_supportsInterface() public view {
        assertTrue(chog.supportsInterface(type(IERC165).interfaceId));
        assertTrue(chog.supportsInterface(type(IERC721).interfaceId));
        assertTrue(chog.supportsInterface(type(IERC721Metadata).interfaceId));
        assertTrue(chog.supportsInterface(type(IChogTraits).interfaceId));
        assertFalse(chog.supportsInterface(0xffffffff));
        assertFalse(chog.supportsInterface(0x49064906)); // ERC-4906 intentionally not claimed
    }

    // ------------------------------------------------------------------
    // tokenURI: dormant
    // ------------------------------------------------------------------

    function test_tokenURI_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 7));
        chog.tokenURI(7);
    }

    function test_tokenURI_dormantBeforeLink() public {
        uint256 id = _mint(alice);
        string memory json = _json(id);
        assertEq(vm.parseJsonString(json, ".name"), "Test Chog #1");
        assertTrue(_has(vm.parseJsonString(json, ".description"), "once Daemons are linked"));
        _checkTraitAttributes(json, id);
        assertEq(_attr(json, 4), "Dormant"); // Status
        assertEq(_attr(json, 5), "Dormant"); // Mood
        assertEq(_attr(json, 6), "1.00x"); // Boost multiplier
        assertEq(vm.parseJsonString(json, ".attributes[7].trait_type"), "Lifetime Yield");
        assertTrue(_has(json, '"display_type":"number","value":0.00}'));

        string memory svg = _svgFromJson(json);
        assertEq(vm.indexOf(svg, "<svg"), 0);
        assertTrue(_has(svg, "</svg>"));
        assertTrue(_has(svg, ">Dormant</text>"));
        assertTrue(_has(svg, "this Daemon is dormant"));
        assertFalse(_has(svg, "url(#aura1)"));
    }

    function test_tokenURI_dormantWhenAccountHasNoCode() public {
        uint256 id = _mint(alice);
        _link();
        address acct = chog.daemonOf(id);
        assertEq(acct.code.length, 0);
        string memory json = _json(id);
        string memory desc = vm.parseJsonString(json, ".description");
        assertTrue(_has(desc, vm.toLowercase(vm.toString(acct))));
        assertTrue(_has(desc, "dormant"));
        assertEq(_attr(json, 5), "Dormant");
    }

    function test_tokenURI_allViewsRevert() public {
        (uint256 id, MockDaemonAccount acct) = _awakeChog();
        acct.setReverts(true, true, true, true);
        string memory json = _json(id);
        assertEq(_attr(json, 4), "Dormant");
        assertEq(_attr(json, 6), "1.00x");
        assertTrue(_has(_svgFromJson(json), ">Dormant</text>"));
    }

    function test_tokenURI_someViewsRevert() public {
        (uint256 id, MockDaemonAccount acct) = _awakeChog();
        acct.setMood(IDaemonAccount.Mood.Chaotic);
        acct.setMessage("hello");
        acct.setReverts(false, true, true, true); // only mood works
        string memory json = _json(id);
        assertEq(_attr(json, 5), "Chaotic");
        assertEq(_attr(json, 6), "1.00x");
        assertTrue(_has(_svgFromJson(json), "gm. nothing to report yet."));
    }

    function test_tokenURI_hostileAccounts() public {
        uint256 id = _mint(alice);
        _link();
        address acct = chog.daemonOf(id);
        for (uint256 mode; mode < 4; ++mode) {
            vm.etch(acct, address(new HostileDaemon(mode)).code);
            string memory json = _json(id); // must not revert
            assertEq(_attr(json, 5), "Dormant");
            assertEq(vm.indexOf(_svgFromJson(json), "<svg"), 0);
        }
        // the payload of mode 3 is cut to MAX_MESSAGE_BYTES in metadata
        string memory desc = vm.parseJsonString(_json(id), ".description");
        assertLt(bytes(desc).length, 400);
    }

    // ------------------------------------------------------------------
    // tokenURI: awake
    // ------------------------------------------------------------------

    function test_tokenURI_awakeFields() public {
        (uint256 id, MockDaemonAccount acct) = _awakeChog();
        acct.setMood(IDaemonAccount.Mood.Smug);
        acct.setLifetimeYield(12.3456 ether);
        acct.setMessage("Stacked another 0.42 dUSD.");
        string memory json = _json(id);
        _checkTraitAttributes(json, id);
        assertEq(_attr(json, 4), "Awake");
        assertEq(_attr(json, 5), "Smug");
        assertEq(_attr(json, 6), "1.00x");
        assertTrue(_has(json, '"display_type":"number","value":12.34}'));
        assertTrue(_has(vm.parseJsonString(json, ".description"), "Last message: Stacked another 0.42 dUSD."));
        string memory svg = _svgFromJson(json);
        assertTrue(_has(svg, ">Smug</text>"));
        assertTrue(_has(svg, "Stacked another 0.42 dUSD."));
        assertTrue(_has(svg, "Lifetime yield 12.34"));
    }

    function test_tokenURI_boostAura() public {
        (uint256 id, MockDaemonAccount acct) = _awakeChog();
        acct.setMood(IDaemonAccount.Mood.Flexing);
        acct.setBoost(11_500, block.timestamp + 3 hours);
        string memory json = _json(id);
        assertEq(_attr(json, 6), "1.15x");
        string memory svg = _svgFromJson(json);
        assertTrue(_has(svg, "url(#aura1)"));
        assertTrue(_has(svg, "BOOST 1.15x"));

        // expired boost: no aura, effective multiplier 1x
        vm.warp(block.timestamp + 3 hours);
        json = _json(id);
        assertEq(_attr(json, 6), "1.00x");
        svg = _svgFromJson(json);
        assertFalse(_has(svg, "url(#aura1)"));
        assertFalse(_has(svg, "BOOST"));
    }

    function test_tokenURI_everyMoodRenders() public {
        (uint256 id, MockDaemonAccount acct) = _awakeChog();
        string[5] memory names = ["Chill", "Smug", "Chaotic", "Flexing", "Tired"];
        // a marker drawn only for that mood
        string[5] memory markers = [
            '<rect x="311" y="80"', // Chill: music note
            '<path d="M218 126', // Smug: raised brow
            "#FDE047", // Chaotic: lightning sparks
            "M0 -16 L4 -4", // Flexing: sparkles
            '<text x="290" y="90"' // Tired: Zzz
        ];
        bytes32[5] memory hashes;
        for (uint8 m; m < 5; ++m) {
            acct.setMood(IDaemonAccount.Mood(m));
            string memory json = _json(id);
            assertEq(_attr(json, 5), names[m]);
            string memory svg = _svgFromJson(json);
            assertTrue(_has(svg, string.concat(">", names[m], "</text>")), names[m]);
            assertTrue(_has(svg, markers[m]), string.concat("marker ", names[m]));
            for (uint8 other; other < 5; ++other) {
                if (other != m) assertFalse(_has(svg, markers[other]), string.concat("foreign marker in ", names[m]));
            }
            assertEq(svg, chog.svgOf(id));
            hashes[m] = keccak256(bytes(svg));
            for (uint8 k; k < m; ++k) {
                assertTrue(hashes[k] != hashes[m]);
            }
        }
    }

    // ------------------------------------------------------------------
    // escaping
    // ------------------------------------------------------------------

    function test_tokenURI_escapesMaliciousMessage() public {
        (uint256 id, MockDaemonAccount acct) = _awakeChog();
        acct.setMood(IDaemonAccount.Mood.Chill);
        string memory evil = "\"><script>alert('x')</script>&\\";
        acct.setMessage(evil);

        string memory json = _json(id); // parsing below fails if the JSON were broken
        assertEq(vm.parseJsonString(json, ".name"), "Test Chog #1");
        string memory desc = vm.parseJsonString(json, ".description");
        assertTrue(_has(desc, string.concat("Last message: ", evil)), "json roundtrip");

        string memory svg = _svgFromJson(json);
        assertFalse(_has(svg, "<script"));
        assertFalse(_has(svg, "alert('x')"));
        assertTrue(
            _has(svg, "&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;\\</text>"), "xml escaped"
        );
    }

    function test_tokenURI_sanitizesControlAndInvalidUtf8() public {
        (uint256 id, MockDaemonAccount acct) = _awakeChog();
        acct.setMessage(string(abi.encodePacked("a\nb\x01c", hex"ff", unicode"🔥")));
        string memory json = _json(id);
        assertTrue(_has(vm.parseJsonString(json, ".description"), unicode"Last message: a b c?🔥"));
        assertTrue(_has(_svgFromJson(json), unicode"a b c?🔥"));
    }

    function test_tokenURI_longMessageTruncated() public {
        (uint256 id, MockDaemonAccount acct) = _awakeChog();
        bytes memory longMsg = new bytes(300);
        for (uint256 i; i < 300; ++i) {
            longMsg[i] = "x";
        }
        acct.setMessage(string(longMsg));
        string memory json = _json(id);
        string memory desc = vm.parseJsonString(json, ".description");
        assertTrue(_has(desc, string.concat(_repeat("x", 160), "...")));
        assertFalse(_has(desc, _repeat("x", 161)));
        string memory svg = _svgFromJson(json);
        assertTrue(_has(svg, string.concat(">", _repeat("x", 44), "...</text>")));
    }

    function _repeat(string memory s, uint256 n) internal pure returns (string memory out) {
        for (uint256 i; i < n; ++i) {
            out = string.concat(out, s);
        }
    }

    function _checkTraitAttributes(string memory json, uint256 id) internal view {
        IChogTraits.Traits memory t = chog.traitsOf(id);
        string[5] memory bgs = ["Lavender", "Mint", "Sunset", "Ocean", "Midnight"];
        string[5] memory bodies = ["Monad Purple", "Bubblegum", "Teal", "Gold", "Shadow"];
        string[5] memory eyes = ["Dot", "Big", "Glow", "Shades", "Button"];
        string[5] memory vibes = ["Calm", "Cocky", "Wild", "Flashy", "Sleepy"];
        assertEq(vm.parseJsonString(json, ".attributes[0].trait_type"), "Background");
        assertEq(_attr(json, 0), bgs[t.background]);
        assertEq(_attr(json, 1), bodies[t.body]);
        assertEq(_attr(json, 2), eyes[t.eyes]);
        assertEq(_attr(json, 3), vibes[t.vibe]);
        assertEq(vm.parseJsonString(json, ".attributes[6].trait_type"), "Boost multiplier");
    }
}
