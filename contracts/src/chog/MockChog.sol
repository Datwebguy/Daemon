// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IChogTraits} from "../interfaces/IChog.sol";
import {IDaemonAccount} from "../interfaces/IDaemonAccount.sol";
import {IERC6551Registry} from "../interfaces/IERC6551.sol";
import {ChogArt} from "./ChogArt.sol";
import {ChogText} from "./ChogText.sol";

/// @title MockChog ("Test Chog", tCHOG)
/// @notice Free-mint testnet stand-in for Chog NFTs. Each token gets on-chain traits at mint and a fully
/// on-chain, live `tokenURI` that reflects the state of its Daemon (ERC-6551 token-bound account):
/// mood, boost and lifetime yield, plus the Daemon's last message.
/// @dev Traits use a cheap pseudo-random hash (prevrandao/blockhash + tokenId + minter). It is NOT secure
/// randomness and is fine only because this is a free testnet mock.
/// The Daemon link (registry, implementation, salt) can be set exactly once by the deployer and is immutable after.
/// `tokenURI` never reverts because of the Daemon account: every read is a gas-capped staticcall whose return
/// data is bounds-checked by hand.
contract MockChog is ERC721, IChogTraits {
    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    /// @notice The caller already minted `maxPerAddress` tokens.
    error MintLimitReached();
    /// @notice All `maxSupply` tokens have been minted.
    error MaxSupplyReached();
    /// @notice Only the deployer may call this.
    error NotDeployer();
    /// @notice The Daemon link was already set.
    error DaemonAlreadySet();
    /// @notice A required address was zero.
    error ZeroAddress();
    /// @notice The registry passed to `setDaemon` has no code.
    error RegistryNotContract();
    /// @notice Constructor parameters are invalid (zero limits).
    error InvalidConfig();
    /// @notice The implementation passed to `setDaemon` has no code.
    error ImplementationNotContract();
    /// @notice A Chog cannot be sent to a token-bound account of this collection (ownership cycle locks funds).
    error ChogCannotOwnChog();

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    /// @notice Emitted once, when the Daemon link is set.
    event DaemonLinked(address indexed registry, address indexed implementation, bytes32 salt);

    // ------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------

    /// @notice Decimals assumed for `lifetimeYield` when formatting (the testnet base asset).
    uint8 public constant YIELD_DECIMALS = 18;
    /// @notice Max bytes of the Daemon's last message kept for metadata.
    uint256 public constant MAX_MESSAGE_BYTES = 160;
    /// @notice Max bytes of the message shown in the SVG caption.
    uint256 public constant MAX_CAPTION_BYTES = 44;

    uint256 private constant VIEW_GAS = 100_000;
    uint256 private constant MESSAGE_GAS = 300_000;

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    /// @notice Address that deployed this contract; the only one allowed to call `setDaemon`.
    address public immutable deployer;
    /// @notice Max tokens one address can mint.
    uint256 public immutable maxPerAddress;
    /// @notice Max tokens that can ever exist.
    uint256 public immutable maxSupply;

    /// @notice Number of tokens minted so far (ids are 1..totalSupply).
    uint256 public totalSupply;
    /// @notice Number of tokens minted by each address.
    mapping(address => uint256) public mintedBy;

    /// @notice ERC-6551 registry used to derive Daemon accounts (zero until linked).
    address public erc6551Registry;
    /// @notice Daemon account implementation (zero until linked).
    address public daemonImplementation;
    /// @notice ERC-6551 salt for Daemon accounts.
    bytes32 public daemonSalt;

    mapping(uint256 => Traits) private _traits;

    /// @dev Live state read from a Daemon account. Each field is only valid if its `*Ok` flag is set.
    struct DaemonState {
        address account;
        bool moodOk;
        uint8 mood;
        bool boostOk;
        uint256 boostBps;
        uint256 boostExpiresAt;
        bool yieldOk;
        uint256 lifetimeYield;
        string message; // sanitised, empty if unavailable
    }

    /// @param maxPerAddress_ Max tokens one address can mint (e.g. 3).
    /// @param maxSupply_ Max tokens that can ever exist.
    constructor(uint256 maxPerAddress_, uint256 maxSupply_) ERC721("Test Chog", "tCHOG") {
        if (maxPerAddress_ == 0 || maxSupply_ == 0) revert InvalidConfig();
        deployer = msg.sender;
        maxPerAddress = maxPerAddress_;
        maxSupply = maxSupply_;
    }

    // ------------------------------------------------------------------
    // Mint
    // ------------------------------------------------------------------

    /// @notice Mints the next token to the caller for free and assigns its traits.
    /// @return tokenId The id of the new token.
    function freeMint() external returns (uint256 tokenId) {
        if (totalSupply >= maxSupply) revert MaxSupplyReached();
        if (mintedBy[msg.sender] >= maxPerAddress) revert MintLimitReached();
        tokenId = ++totalSupply;
        ++mintedBy[msg.sender];
        _traits[tokenId] = _rollTraits(tokenId, msg.sender);
        // Plain _mint, not _safeMint: wallets upgraded with EIP-7702 (common on Monad) are EOAs with code and
        // often cannot answer onERC721Received, which would make a free mint revert for them. The recipient is
        // always the caller, so there is nothing to protect, and skipping the callback also removes a reentrancy hook.
        _mint(msg.sender, tokenId);
    }

    /// @dev Cheap deterministic trait roll; each trait is a byte of the hash mod 5.
    function _rollTraits(uint256 tokenId, address minter) internal view returns (Traits memory t) {
        bytes32 prev = block.number > 0 ? blockhash(block.number - 1) : bytes32(0);
        bytes32 h = keccak256(abi.encodePacked(block.prevrandao, prev, tokenId, minter));
        t.background = uint8(h[0]) % 5;
        t.body = uint8(h[1]) % 5;
        t.eyes = uint8(h[2]) % 5;
        t.vibe = uint8(h[3]) % 5;
    }

    // ------------------------------------------------------------------
    // Daemon link
    // ------------------------------------------------------------------

    /// @notice Links this collection to its Daemon accounts. Callable once, by the deployer only.
    /// @param registry ERC-6551 registry (canonical on Monad: 0x000000006551c19487814612e58FE06813775758).
    /// @param implementation Daemon account implementation.
    /// @param salt ERC-6551 salt used for every Daemon.
    function setDaemon(address registry, address implementation, bytes32 salt) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (erc6551Registry != address(0)) revert DaemonAlreadySet();
        if (registry == address(0) || implementation == address(0)) revert ZeroAddress();
        if (registry.code.length == 0) revert RegistryNotContract();
        if (implementation.code.length == 0) revert ImplementationNotContract();
        erc6551Registry = registry;
        daemonImplementation = implementation;
        daemonSalt = salt;
        emit DaemonLinked(registry, implementation, salt);
    }

    /// @notice Deterministic Daemon account address of `tokenId` (deployed or not). Zero before `setDaemon`.
    function daemonOf(uint256 tokenId) public view returns (address) {
        address registry = erc6551Registry;
        if (registry == address(0)) return address(0);
        return IERC6551Registry(registry).account(daemonImplementation, daemonSalt, block.chainid, address(this), tokenId);
    }

    // ------------------------------------------------------------------
    // Traits
    // ------------------------------------------------------------------

    /// @inheritdoc IChogTraits
    function traitsOf(uint256 tokenId) external view returns (Traits memory) {
        _requireOwned(tokenId);
        return _traits[tokenId];
    }

    // ------------------------------------------------------------------
    // Metadata
    // ------------------------------------------------------------------

    /// @notice Fully on-chain metadata: base64 JSON with a base64 SVG image built from live Daemon state.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        DaemonState memory s = readDaemonState(tokenId);
        ChogArt.Params memory p = _params(tokenId, s);
        string memory json = string.concat(
            '{"name":"Test Chog #',
            Strings.toString(tokenId),
            '","description":"',
            _description(s, p),
            '","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(ChogArt.render(p))),
            '","attributes":',
            _attributes(p),
            "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @notice Raw SVG for `tokenId` (handy for frontends and debugging).
    function svgOf(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return ChogArt.render(_params(tokenId, readDaemonState(tokenId)));
    }

    /// @notice Reads the live state of `tokenId`'s Daemon. Never reverts; unavailable fields are flagged.
    function readDaemonState(uint256 tokenId) public view returns (DaemonState memory s) {
        address account = daemonOf(tokenId);
        s.account = account;
        if (account == address(0) || account.code.length == 0) return s;

        (bool ok, bytes memory data) = _staticcall(account, IDaemonAccount.getMood.selector, VIEW_GAS, 32);
        if (ok && data.length >= 32) {
            uint256 m = _word(data, 0);
            if (m < 5) {
                s.moodOk = true;
                s.mood = uint8(m);
            }
        }

        (ok, data) = _staticcall(account, IDaemonAccount.getBoost.selector, VIEW_GAS, 128);
        if (ok && data.length >= 128) {
            s.boostOk = true;
            s.boostBps = _word(data, 0);
            s.boostExpiresAt = _word(data, 32);
        }

        (ok, data) = _staticcall(account, IDaemonAccount.lifetimeYield.selector, VIEW_GAS, 32);
        if (ok && data.length >= 32) {
            s.yieldOk = true;
            s.lifetimeYield = _word(data, 0);
        }

        (ok, data) = _staticcall(account, IDaemonAccount.lastMessage.selector, MESSAGE_GAS, 64 + MAX_MESSAGE_BYTES * 4);
        if (ok) s.message = ChogText.sanitize(_decodeString(data), MAX_MESSAGE_BYTES);
    }

    function _params(uint256 tokenId, DaemonState memory s) internal view returns (ChogArt.Params memory p) {
        p.tokenId = tokenId;
        p.traits = _traits[tokenId];
        p.awake = s.moodOk;
        p.mood = s.mood;
        p.boosted = p.awake && s.boostOk && s.boostBps > 10_000 && s.boostExpiresAt > block.timestamp;
        p.boostBps = p.boosted ? s.boostBps : 10_000;
        p.yieldText = ChogText.formatUnits(s.lifetimeYield, YIELD_DECIMALS);
        if (bytes(s.message).length > 0) {
            p.message = ChogText.sanitize(bytes(s.message), MAX_CAPTION_BYTES);
        } else {
            p.message = p.awake ? "gm. nothing to report yet." : "zzz... this Daemon is dormant.";
        }
    }

    function _description(DaemonState memory s, ChogArt.Params memory p) internal pure returns (string memory) {
        string memory base = "A living Test Chog on Monad Testnet. Its image follows its Daemon (ERC-6551 account) ";
        if (s.account == address(0)) return string.concat(base, "once Daemons are linked.");
        base = string.concat(base, Strings.toHexString(s.account), ". ");
        if (!p.awake) return string.concat(base, "The Daemon is dormant.");
        if (bytes(s.message).length == 0) return base;
        return string.concat(base, "Last message: ", ChogText.escapeJson(s.message));
    }

    function _attributes(ChogArt.Params memory p) internal pure returns (string memory) {
        string memory traits = string.concat(
            _attr("[", "Background", ChogArt.backgroundName(p.traits.background)),
            _attr(",", "Body", ChogArt.bodyName(p.traits.body)),
            _attr(",", "Eyes", ChogArt.eyesName(p.traits.eyes)),
            _attr(",", "Vibe", ChogArt.vibeName(p.traits.vibe))
        );
        string memory live = string.concat(
            _attr(",", "Status", p.awake ? "Awake" : "Dormant"),
            _attr(",", "Mood", p.awake ? ChogArt.moodName(p.mood) : "Dormant"),
            _attr(",", "Boost multiplier", ChogText.formatBps(p.boostBps)),
            ',{"trait_type":"Lifetime Yield","display_type":"number","value":',
            p.yieldText,
            "}]"
        );
        return string.concat(traits, live);
    }

    function _attr(string memory sep, string memory traitType, string memory value)
        private
        pure
        returns (string memory)
    {
        return string.concat(sep, '{"trait_type":"', traitType, '","value":"', value, '"}');
    }

    // ------------------------------------------------------------------
    // Defensive call helpers
    // ------------------------------------------------------------------

    /// @dev Staticcall with a gas cap that copies at most `maxCopy` bytes of return data (no returndata bombs).
    function _staticcall(address target, bytes4 selector, uint256 gasCap, uint256 maxCopy)
        private
        view
        returns (bool ok, bytes memory data)
    {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, selector)
            ok := staticcall(gasCap, target, ptr, 4, 0, 0)
            let size := returndatasize()
            if gt(size, maxCopy) { size := maxCopy }
            data := ptr
            mstore(data, size)
            returndatacopy(add(data, 0x20), 0, size)
            mstore(0x40, add(add(data, 0x20), and(add(size, 31), not(31))))
        }
    }

    /// @dev Reads the 32-byte word at `offset` of `data`; caller guarantees bounds.
    function _word(bytes memory data, uint256 offset) private pure returns (uint256 v) {
        assembly ("memory-safe") {
            v := mload(add(add(data, 0x20), offset))
        }
    }

    /// @dev Bounds-checked ABI decode of a single `string` return value. Malformed data yields empty bytes;
    /// a string longer than the copied data is cut to what was copied.
    function _decodeString(bytes memory data) private pure returns (bytes memory out) {
        uint256 len = data.length;
        if (len < 64) return out;
        uint256 offset = _word(data, 0);
        if (offset > len - 32) return out;
        uint256 strLen = _word(data, offset);
        uint256 avail = len - offset - 32;
        if (strLen > avail) strLen = avail;
        out = new bytes(strLen);
        for (uint256 i; i < strLen; ++i) {
            out[i] = data[offset + 32 + i];
        }
    }

    // ------------------------------------------------------------------
    // ERC-165
    // ------------------------------------------------------------------

    /// @notice ERC-165: ERC-721, ERC-721 Metadata, ERC-165 and IChogTraits.
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IChogTraits).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @dev Ownership-cycle guard for every transfer path (including plain `transferFrom`): a Chog may not be sent
    ///      to any ERC-6551 account bound to a Chog of this collection. Otherwise a Daemon could end up owning
    ///      itself (directly or through a chain of Daemons) and its funds would be locked forever.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to.code.length != 0 && _isChogAccount(to)) revert ChogCannotOwnChog();
        return super._update(to, tokenId, auth);
    }

    function _isChogAccount(address account) private view returns (bool) {
        // token() returns (chainId, tokenContract, tokenId); gas-capped, never reverts.
        (bool ok, bytes memory ret) = account.staticcall{gas: 30_000}(abi.encodeWithSignature("token()"));
        if (!ok || ret.length < 96) return false;
        (, address tokenContract,) = abi.decode(ret, (uint256, address, uint256));
        return tokenContract == address(this);
    }
}
