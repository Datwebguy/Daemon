// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IDaemonAccount} from "../interfaces/IDaemonAccount.sol";
import {IERC6551Account, IERC6551Executable} from "../interfaces/IERC6551.sol";
import {IStrategyRegistry} from "../interfaces/IStrategyRegistry.sol";
import {IYieldSource} from "../interfaces/IYieldSource.sol";
import {IDaemonRouter, IPriceOracle, IWMON} from "../interfaces/IDaemonRouter.sol";
import {ITraitPolicy} from "../interfaces/IChog.sol";
import {IEntropyV2, IEntropyConsumerV2} from "../interfaces/IEntropyV2.sol";

/// @title DaemonAccount
/// @notice ERC-6551 token-bound account for one Chog. Earns yield in approved sources, is compounded by anyone
///         for a bounty, and has a mood that anyone can hype.
/// @dev Deployed once as the implementation; the canonical ERC-6551 registry clones it (ERC-1167 + footer).
///      The strategy registry is an immutable, so it lives in the implementation code and is shared by every clone.
///      Clones never run a constructor: all storage starts at zero and the code treats zero as "never happened".
///
///      Trust model: the current NFT holder is the only privileged party (execute / allocate / deallocate / sweep).
///      `compound`, `hype` and `hypeWithChog` are public; they can only add value to this account, except for the
///      bounty `compound` pays to its caller. There is no session key, executor or admin over funds.
contract DaemonAccount is
    IDaemonAccount,
    IERC6551Account,
    IERC6551Executable,
    IERC1271,
    IERC721Receiver,
    IERC1155Receiver,
    IEntropyConsumerV2,
    ReentrancyGuardTransient
{
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------------------------------------------------
    // Constants / immutables
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Maximum number of yield sources one Daemon can hold at a time (bounds every loop).
    uint256 public constant MAX_SOURCES = 8;
    /// @notice Max registered (untracked) sources sweepToOwner additionally exits.
    uint256 public constant MAX_SWEEP_SOURCES = 16;
    /// @notice Gas added to the measured gas of `compound` to cover the work done after measurement
    ///         (bounty transfer, redeposit, bookkeeping, events) and calldata/dispatch overhead.
    uint256 public constant GAS_OVERHEAD = 120_000;
    /// @notice Gas assumed by the `pendingBounty` view for one compound (base + per held source).
    uint256 public constant PENDING_GAS_BASE = 200_000;
    /// @notice Per-source gas assumed by the `pendingBounty` view.
    uint256 public constant PENDING_GAS_PER_SOURCE = 120_000;

    uint256 internal constant BPS = 10_000;
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;
    /// @notice Where burned $CHOG goes (plain transfer: works for any ERC-20, including ones without burn()).
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Platform configuration + approved sources. Immutable: lives in implementation code.
    IStrategyRegistry public immutable STRATEGY_REGISTRY;

    // ------------------------------------------------------------------------------------------------------------
    // Storage (per clone)
    // ------------------------------------------------------------------------------------------------------------

    uint256 internal _state;
    address[] internal _sources;

    /// @inheritdoc IDaemonAccount
    uint256 public lastCompoundAt;
    /// @inheritdoc IDaemonAccount
    uint256 public lastActivityAt;
    /// @inheritdoc IDaemonAccount
    uint256 public lifetimeYield;
    /// @notice Gross harvested profit of the latest compound (asset units).
    uint256 public lastProfit;
    /// @notice Gross harvested profit of the compound before the latest one.
    uint256 public prevProfit;
    /// @notice Timestamp of the last hype of this Daemon by anyone.
    uint256 public lastHypeAt;
    /// @notice Timestamp of the last hype of this Daemon by `hyper`.
    mapping(address hyper => uint256) public lastHypeBy;

    /// @dev Reference time for cooldown/bounty ramp: last compound, or first allocation before any compound.
    uint256 internal _anchor;
    uint256 internal _boostMultiplierBps;
    uint256 internal _boostExpiresAt;
    uint256 internal _potMon;
    uint256 internal _potChog;
    uint256 internal _updates;
    string internal _lastMessage;
    /// @dev Pending lucky rolls: Entropy sequence number -> hyper.
    mapping(uint64 sequence => address hyper) internal _luckyRolls;

    // ------------------------------------------------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------------------------------------------------

    error ZeroAddress();
    error NotOwner();
    error InvalidOperation();
    error ForbiddenSelector(bytes4 selector);
    error ZeroAmount();
    error SourceNotApproved(address source);
    error AssetMismatch(address source);
    error CapExceeded(uint256 requested, uint256 cap);
    error TooManySources();
    error CooldownActive(uint256 readyAt);
    error InsufficientProfit(uint256 profit, uint256 bounty);
    error SlippageExceeded(uint256 received, uint256 minOut);
    error HypeTooSmall(uint256 amount, uint256 min);
    error HypeUserCooldown(uint256 readyAt);
    error HypeDaemonCooldown(uint256 readyAt);
    error ChogDisabled();
    error OwnershipCycle();
    error LuckyDisabled();
    error NotEntropy();

    // ------------------------------------------------------------------------------------------------------------
    // Construction / receive
    // ------------------------------------------------------------------------------------------------------------

    /// @param strategyRegistry IStrategyRegistry holding the platform config and approved sources
    constructor(address strategyRegistry) {
        if (strategyRegistry == address(0)) revert ZeroAddress();
        STRATEGY_REGISTRY = IStrategyRegistry(strategyRegistry);
    }

    /// @notice Accepts plain MON (not counted in the boost pot; use `hype()` for that).
    receive() external payable {}

    modifier onlyOwner() {
        if (msg.sender != owner()) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Identity (ERC-6551)
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Current holder of the bound NFT, or address(0) on a foreign chain / burned token.
    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) return address(0);
        try IERC721(tokenContract).ownerOf(tokenId) returns (address o) {
            return o;
        } catch {
            return address(0);
        }
    }

    /// @notice Reads (chainId, tokenContract, tokenId) from the ERC-1167 footer appended by the registry.
    function token()
        public
        view
        override(IDaemonAccount, IERC6551Account)
        returns (uint256 chainId, address tokenContract, uint256 tokenId)
    {
        bytes memory footer = new bytes(0x60);
        assembly {
            // footer layout: [0x2d] salt, [0x4d] chainId, [0x6d] tokenContract, [0x8d] tokenId
            extcodecopy(address(), add(footer, 0x20), 0x4d, 0x60)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    /// @notice ERC-6551 state nonce. Increments on every owner action (execute, allocate, deallocate, sweep).
    function state() external view returns (uint256) {
        return _state;
    }

    /// @notice ERC-6551 signer check: only the current owner is a valid signer.
    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        if (signer != address(0) && signer == owner()) return IERC6551Account.isValidSigner.selector;
        return bytes4(0);
    }

    /// @notice ERC-1271: valid iff `signature` is a valid signature of `hash` by the current owner (EOA or 1271).
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        address o = owner();
        if (o != address(0) && SignatureChecker.isValidSignatureNow(o, hash, signature)) return ERC1271_MAGIC;
        return bytes4(0xffffffff);
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(IERC6551Account).interfaceId
            || interfaceId == type(IERC6551Executable).interfaceId || interfaceId == type(IERC1271).interfaceId
            || interfaceId == type(IERC721Receiver).interfaceId || interfaceId == type(IERC1155Receiver).interfaceId
            || interfaceId == type(IDaemonAccount).interfaceId;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Token receivers
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Accepts ERC-721s, except this account's own Chog (an ownership cycle would lock it forever).
    function onERC721Received(address, address, uint256 receivedTokenId, bytes calldata)
        external
        view
        returns (bytes4)
    {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (msg.sender == tokenContract && receivedTokenId == tokenId && chainId == block.chainid) {
            revert OwnershipCycle();
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Accepts ERC-1155 transfers.
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    /// @notice Accepts ERC-1155 batch transfers.
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Owner only
    // ------------------------------------------------------------------------------------------------------------

    /// @notice ERC-6551 execute. Owner only, CALL only (operation 0).
    /// @dev Approval-style calls are forbidden: an allowance granted by a previous owner would survive an NFT sale
    ///      and let the seller drain the buyer's Daemon. Without approvals, no authority can outlive ownership.
    ///      Pots are clamped to real balances afterwards so owner transfers never leave phantom pot accounting.
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        nonReentrant
        onlyOwner
        returns (bytes memory result)
    {
        if (operation != 0) revert InvalidOperation();
        if (data.length >= 4) {
            bytes4 sel = bytes4(data[:4]);
            if (
                sel == 0x095ea7b3 // approve(address,uint256) — ERC-20 and ERC-721
                    || sel == 0x39509351 // increaseAllowance(address,uint256)
                    || sel == 0xa22cb465 // setApprovalForAll(address,bool) — ERC-721 and ERC-1155
                    || sel == 0xd505accf // permit(address,address,uint256,uint256,uint8,bytes32,bytes32)
                    || sel == 0x87517c45 // Permit2 approve(address,address,uint160,uint48)
            ) revert ForbiddenSelector(sel);
        }
        ++_state;
        bool success;
        (success, result) = to.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 0x20), mload(result))
            }
        }
        _clampPots();
    }

    /// @inheritdoc IDaemonAccount
    function allocate(address source, uint256 assets) external nonReentrant onlyOwner {
        if (assets == 0) revert ZeroAmount();
        if (!STRATEGY_REGISTRY.isApproved(source)) revert SourceNotApproved(source);
        address asset = STRATEGY_REGISTRY.config().asset;
        IYieldSource s = IYieldSource(source);
        if (s.asset() != asset) revert AssetMismatch(source);

        uint256 cap = STRATEGY_REGISTRY.capPerAccount(source);
        uint256 requested = s.convertToAssets(s.balanceOf(address(this))) + assets;
        if (requested > cap) revert CapExceeded(requested, cap);

        _track(source);
        IERC20(asset).forceApprove(source, assets);
        uint256 shares = s.deposit(assets, address(this));
        IERC20(asset).forceApprove(source, 0);

        if (_anchor == 0) _anchor = block.timestamp;
        lastActivityAt = block.timestamp; // a fresh deposit counts as activity, so neglect decay can start
        ++_state;
        emit Allocated(_tokenId(), source, assets, shares);
    }

    /// @inheritdoc IDaemonAccount
    /// @dev Works for any held source (approval is not re-checked) so exits are never blocked.
    function deallocate(address source, uint256 shares) external nonReentrant onlyOwner {
        if (shares == 0) revert ZeroAmount();
        uint256 assets = IYieldSource(source).redeem(shares, address(this), address(this));
        if (IYieldSource(source).balanceOf(address(this)) == 0) {
            // Claim before untracking so accrued rewards never stay stranded in the vault.
            _tryCall(source, abi.encodeCall(IYieldSource.claimRewards, (address(this))));
            _untrack(source);
        }
        ++_state;
        emit Deallocated(_tokenId(), source, shares, assets);
    }

    /// @inheritdoc IDaemonAccount
    /// @dev Every external interaction is wrapped in try/catch, so one broken source or token never blocks the exit.
    ///      Order per source: claim rewards, redeem all shares. Then the base asset, every reward token, WMON,
    ///      $CHOG and native MON are sent to the owner. Pots are zeroed.
    function sweepToOwner() external nonReentrant onlyOwner {
        address to = msg.sender;
        IStrategyRegistry.Config memory c = STRATEGY_REGISTRY.config();

        uint256 n = _sources.length;
        address[] memory rewardTokens = new address[](n);
        for (uint256 i = n; i > 0;) {
            unchecked {
                --i;
            }
            address s = _sources[i];
            // Low-level calls: neither a revert nor malformed return data from a source can block the exit.
            rewardTokens[i] = address(uint160(_staticUint(s, abi.encodeCall(IYieldSource.rewardToken, ()))));
            _tryCall(s, abi.encodeCall(IYieldSource.claimRewards, (address(this))));
            uint256 sh = _staticUint(s, abi.encodeCall(IYieldSource.balanceOf, (address(this))));
            if (sh != 0) {
                _tryCall(s, abi.encodeCall(IYieldSource.redeem, (sh, address(this), address(this))));
                sh = _staticUint(s, abi.encodeCall(IYieldSource.balanceOf, (address(this))));
            }
            if (sh == 0) _removeAt(i);
        }

        for (uint256 i; i < n; ++i) {
            if (rewardTokens[i] != address(0)) _trySendAll(rewardTokens[i], to);
        }

        // Also exit every registered source this account no longer tracks (rewards left after a full deallocate,
        // donated shares). Bounded by MAX_SWEEP_SOURCES so the exit cost stays predictable.
        address[] memory reg = _registrySources();
        uint256 m = reg.length < MAX_SWEEP_SOURCES ? reg.length : MAX_SWEEP_SOURCES;
        for (uint256 i; i < m; ++i) {
            address s = reg[i];
            if (_isTracked(s)) continue;
            _tryCall(s, abi.encodeCall(IYieldSource.claimRewards, (address(this))));
            uint256 sh = _staticUint(s, abi.encodeCall(IYieldSource.balanceOf, (address(this))));
            if (sh != 0) _tryCall(s, abi.encodeCall(IYieldSource.redeem, (sh, address(this), address(this))));
            _trySendAll(address(uint160(_staticUint(s, abi.encodeCall(IYieldSource.rewardToken, ())))), to);
        }
        _trySendAll(c.asset, to);
        _trySendAll(c.wmon, to);
        _trySendAll(c.chog, to);

        _potMon = 0;
        _potChog = 0;
        uint256 bal = address(this).balance;
        if (bal != 0) {
            // Failure is tolerated: MON stays in the account and the owner can still move it via execute.
            (bool ok,) = to.call{value: bal}("");
            ok;
        }
        ++_state;
        emit Swept(_tokenId(), to);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Public: compound
    // ------------------------------------------------------------------------------------------------------------

    /// @inheritdoc IDaemonAccount
    /// @dev Steps: cooldown check -> claim rewards of every held source -> swap reward tokens to the base asset with
    ///      an oracle-derived min-out -> boost top-up funded only from the pot -> bounty = gas reimbursement +
    ///      profit * shareBps -> require profit > bounty -> pay bounty -> redeposit the rest into the held source
    ///      with the largest balance (respecting its cap; any excess stays idle in this account).
    ///      `profit` is the gross harvested yield (excluding the boost top-up). If `bountyRecipient` is zero the
    ///      bounty goes to msg.sender.
    function compound(address bountyRecipient) external nonReentrant returns (uint256 profit, uint256 bounty) {
        uint256 gasStart = gasleft();
        IStrategyRegistry.Config memory c = STRATEGY_REGISTRY.config();
        uint256 readyAt = _anchor + c.compoundCooldown;
        if (block.timestamp < readyAt) revert CooldownActive(readyAt);

        IERC20 asset = IERC20(c.asset);
        uint256 before = asset.balanceOf(address(this));
        _harvest(c);
        profit = asset.balanceOf(address(this)) - before;
        uint256 topUp = _boostTopUp(c, profit);

        bounty = _gasReimbursement(c, gasStart) + (profit * _shareBps(c, readyAt)) / BPS;
        if (profit <= bounty) revert InsufficientProfit(profit, bounty);
        asset.safeTransfer(bountyRecipient == address(0) ? msg.sender : bountyRecipient, bounty);

        uint256 net = profit + topUp - bounty;
        _redeposit(c, net);

        lifetimeYield += net;
        prevProfit = lastProfit;
        lastProfit = profit;
        lastCompoundAt = block.timestamp;
        lastActivityAt = block.timestamp;
        _anchor = block.timestamp;

        // `caller` is the bounty recipient (the keeper), so batched compounds via DaemonHub are attributed correctly.
        emit Compounded(_tokenId(), bountyRecipient == address(0) ? msg.sender : bountyRecipient, profit, bounty);
        _update(c, net);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Public: hype
    // ------------------------------------------------------------------------------------------------------------

    /// @inheritdoc IDaemonAccount
    function hype() external payable nonReentrant {
        _hypeMon(STRATEGY_REGISTRY.config(), msg.value);
    }

    /// @inheritdoc IDaemonAccount
    /// @dev The Entropy fee is read at call time; anything above it is the hype. The hype applies immediately and
    ///      never depends on the roll: if Entropy never answers, the hyper simply gets a normal hype.
    function hypeLucky() external payable nonReentrant {
        IStrategyRegistry.Config memory c = STRATEGY_REGISTRY.config();
        if (c.entropy == address(0)) revert LuckyDisabled();
        uint256 fee = IEntropyV2(c.entropy).getFeeV2(c.luckyGasLimit);
        if (msg.value <= fee) revert HypeTooSmall(msg.value, fee + c.minHypeMon);
        _hypeMon(c, msg.value - fee);
        uint64 sequence = IEntropyV2(c.entropy).requestV2{value: fee}(c.luckyGasLimit);
        _luckyRolls[sequence] = msg.sender;
        emit LuckyRollRequested(_tokenId(), msg.sender, sequence);
    }

    /// @inheritdoc IDaemonAccount
    function luckyFee() external view returns (uint256) {
        IStrategyRegistry.Config memory c = STRATEGY_REGISTRY.config();
        if (c.entropy == address(0)) return 0;
        return IEntropyV2(c.entropy).getFeeV2(c.luckyGasLimit);
    }

    /// @notice Pyth Entropy callback. Only the configured Entropy contract may call it, and only for a roll this
    ///         Daemon requested. A critical roll sets the boost to the maximum multiplier and adds one boost
    ///         duration (reviving an expired boost). The boost is still paid only from the pot, so a critical roll
    ///         can never create value that hypers did not pay in.
    /// @dev Kept small (no message update) so it fits the requested callback gas limit.
    function _entropyCallback(uint64 sequence, address, bytes32 randomNumber) external nonReentrant {
        IStrategyRegistry.Config memory c = STRATEGY_REGISTRY.config();
        if (c.entropy == address(0) || msg.sender != c.entropy) revert NotEntropy();
        address hyper = _luckyRolls[sequence];
        if (hyper == address(0)) return; // unknown or already answered
        delete _luckyRolls[sequence];

        bool critical = uint256(randomNumber) % BPS < c.luckyChanceBps;
        uint256 tokenId = _tokenId();
        if (critical) {
            uint256 from = _boostExpiresAt > block.timestamp ? _boostExpiresAt : block.timestamp;
            _boostMultiplierBps = BPS + c.maxBoostBps;
            _boostExpiresAt = from + c.boostDuration;
            emit BoostApplied(tokenId, _boostMultiplierBps, _boostExpiresAt);
        }
        emit LuckyRoll(tokenId, hyper, sequence, critical);
    }

    /// @inheritdoc IDaemonAccount
    function hypeWithChog(uint256 amount) external nonReentrant {
        IStrategyRegistry.Config memory c = STRATEGY_REGISTRY.config();
        if (c.chog == address(0)) revert ChogDisabled();
        if (amount == 0 || amount < c.minHypeChog) revert HypeTooSmall(amount, c.minHypeChog);
        _checkHypeCooldowns(c);
        IERC20 chog = IERC20(c.chog);
        uint256 b0 = chog.balanceOf(address(this));
        chog.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = chog.balanceOf(address(this)) - b0;
        if (received < c.minHypeChog) revert HypeTooSmall(received, c.minHypeChog); // fee-on-transfer guard
        uint256 burned = (received * c.chogBurnBps) / BPS;
        if (burned != 0) {
            chog.safeTransfer(BURN_ADDRESS, burned);
            emit ChogBurned(_tokenId(), msg.sender, burned);
        }
        _potChog += received - burned;
        _hype(c, c.chog, received - burned);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------------------------------------------------

    /// @inheritdoc IDaemonAccount
    function getMood() external view returns (Mood) {
        return _mood(STRATEGY_REGISTRY.config());
    }

    /// @inheritdoc IDaemonAccount
    function lastMessage() external view returns (string memory) {
        return _lastMessage;
    }

    /// @inheritdoc IDaemonAccount
    /// @dev multiplierBps is 10000 when no boost is active.
    function getBoost()
        external
        view
        returns (uint256 multiplierBps, uint256 expiresAt, uint256 potMon, uint256 potChog)
    {
        multiplierBps = _boostActive() ? _boostMultiplierBps : BPS;
        return (multiplierBps, _boostExpiresAt, _potMon, _potChog);
    }

    /// @inheritdoc IDaemonAccount
    function pendingProfit() public view returns (uint256 value) {
        IStrategyRegistry.Config memory c = STRATEGY_REGISTRY.config();
        return _pendingProfit(c);
    }

    /// @inheritdoc IDaemonAccount
    /// @dev Estimate: uses oracle value of pending rewards and an assumed gas usage
    ///      (PENDING_GAS_BASE + PENDING_GAS_PER_SOURCE * sources) priced at tx.gasprice (or basefee in eth_call).
    function pendingBounty() external view returns (uint256) {
        IStrategyRegistry.Config memory c = STRATEGY_REGISTRY.config();
        uint256 readyAt = _anchor + c.compoundCooldown;
        if (block.timestamp < readyAt) return 0;
        uint256 profit = _pendingProfit(c);
        if (profit == 0) return 0;
        uint256 price = tx.gasprice != 0 ? tx.gasprice : block.basefee;
        uint256 gasEstimate = PENDING_GAS_BASE + PENDING_GAS_PER_SOURCE * _sources.length;
        uint256 bounty = _monToAsset(c, gasEstimate * price) + (profit * _shareBps(c, readyAt)) / BPS;
        return profit > bounty ? bounty : 0;
    }

    /// @inheritdoc IDaemonAccount
    function totalAssets() external view returns (uint256 total) {
        total = IERC20(STRATEGY_REGISTRY.config().asset).balanceOf(address(this));
        uint256 n = _sources.length;
        for (uint256 i; i < n; ++i) {
            IYieldSource s = IYieldSource(_sources[i]);
            total += s.convertToAssets(s.balanceOf(address(this)));
        }
    }

    /// @notice Sources this Daemon currently holds shares in (at most MAX_SOURCES).
    function heldSources() external view returns (address[] memory) {
        return _sources;
    }

    /// @notice Current caller share of profit in bps (0 while in cooldown).
    function currentBountyShareBps() external view returns (uint256) {
        IStrategyRegistry.Config memory c = STRATEGY_REGISTRY.config();
        uint256 readyAt = _anchor + c.compoundCooldown;
        if (block.timestamp < readyAt) return 0;
        return _shareBps(c, readyAt);
    }

    /// @notice Earliest timestamp at which `compound` may be called.
    function nextCompoundAt() external view returns (uint256) {
        return _anchor + STRATEGY_REGISTRY.config().compoundCooldown;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Internal: compound helpers
    // ------------------------------------------------------------------------------------------------------------

    /// @dev Claims rewards of every held source and swaps non-asset rewards into the base asset.
    ///      One broken source (claim reverts, no liquidity, missing price) is skipped instead of blocking compounding;
    ///      its reward tokens stay in the account and are retried next time (or swept to the owner).
    function _harvest(IStrategyRegistry.Config memory c) internal {
        uint256 n = _sources.length;
        for (uint256 i; i < n; ++i) {
            IYieldSource s = IYieldSource(_sources[i]);
            address rt;
            try s.rewardToken() returns (address r) {
                rt = r;
            } catch {
                continue;
            }
            if (rt == c.asset) {
                try s.claimRewards(address(this)) {} catch {} // measured by the caller via the asset balance delta
                continue;
            }
            try s.claimRewards(address(this)) {} catch {}
            uint256 held = IERC20(rt).balanceOf(address(this)); // includes rewards left from earlier failed swaps
            if (held != 0) _trySwapToAsset(c, rt, held);
        }
    }

    /// @dev Clamps pot accounting to real balances (after owner transfers via execute).
    function _clampPots() internal {
        if (_potMon > address(this).balance) _potMon = address(this).balance;
        address chog = STRATEGY_REGISTRY.config().chog;
        if (chog != address(0)) {
            uint256 bal = IERC20(chog).balanceOf(address(this));
            if (_potChog > bal) _potChog = bal;
        }
    }

    function _registrySources() internal view returns (address[] memory list) {
        try STRATEGY_REGISTRY.sources() returns (address[] memory l) {
            list = l;
        } catch {}
    }

    function _isTracked(address source) internal view returns (bool) {
        uint256 n = _sources.length;
        for (uint256 i; i < n; ++i) {
            if (_sources[i] == source) return true;
        }
        return false;
    }

    /// @dev Swaps `amountIn` of `tokenIn` to the base asset through the whitelisted router.
    ///      minOut = oracle quote * (10000 - maxSlippageBps) / 10000, never caller-supplied, and re-checked on the
    ///      actual balance change. Dust whose min-out rounds to zero is left unswapped.
    function _swapToAsset(IStrategyRegistry.Config memory c, address tokenIn, uint256 amountIn)
        internal
        returns (uint256 out)
    {
        uint256 minOut = (IPriceOracle(c.oracle).quote(tokenIn, c.asset, amountIn) * (BPS - c.maxSlippageBps)) / BPS;
        if (minOut == 0) return 0;
        IERC20 asset = IERC20(c.asset);
        uint256 b0 = asset.balanceOf(address(this));
        IERC20(tokenIn).forceApprove(c.router, amountIn);
        IDaemonRouter(c.router).swapExactIn(tokenIn, c.asset, amountIn, minOut, address(this));
        IERC20(tokenIn).forceApprove(c.router, 0);
        out = asset.balanceOf(address(this)) - b0;
        if (out < minOut) revert SlippageExceeded(out, minOut);
    }

    /// @dev While a boost is active, adds profit * (multiplier - 1x) funded only from the pot:
    ///      first the MON pot (wrapped to WMON, swapped), then the $CHOG pot. Each spend is sized by the oracle so
    ///      that the oracle value matches the remaining target, and never exceeds what the pot holds.
    function _boostTopUp(IStrategyRegistry.Config memory c, uint256 profit) internal returns (uint256 toppedUp) {
        if (profit == 0 || !_boostActive()) return 0;
        uint256 target = (profit * (_boostMultiplierBps - BPS)) / BPS;
        if (target == 0) return 0;

        uint256 potMon = Math.min(_potMon, address(this).balance);
        if (potMon != 0 && c.wmon != address(0)) {
            uint256 spend = _spendFor(c, c.wmon, potMon, target);
            if (spend != 0) {
                IWMON(c.wmon).deposit{value: spend}();
                (bool ok, uint256 out) = _trySwapToAsset(c, c.wmon, spend);
                if (ok) {
                    _potMon -= spend;
                    toppedUp += out;
                } else {
                    IWMON(c.wmon).withdraw(spend); // pot stays intact
                }
            }
        }
        if (toppedUp < target && c.chog != address(0)) {
            uint256 potChog = Math.min(_potChog, IERC20(c.chog).balanceOf(address(this)));
            if (potChog != 0) {
                uint256 spend = _spendFor(c, c.chog, potChog, target - toppedUp);
                if (spend != 0) {
                    (bool ok, uint256 out) = _trySwapToAsset(c, c.chog, spend);
                    if (ok) {
                        _potChog -= spend;
                        toppedUp += out;
                    }
                }
            }
        }
    }

    /// @dev Like `_swapToAsset`, but a router revert (e.g. a shallow pool exceeding slippage) skips the top-up
    ///      instead of reverting the whole compound, so a hype can never block compounding.
    ///      A router that returns less than minOut without reverting still reverts (whitelisted router misbehaving).
    function _trySwapToAsset(IStrategyRegistry.Config memory c, address tokenIn, uint256 amountIn)
        internal
        returns (bool ok, uint256 out)
    {
        uint256 minOut = (IPriceOracle(c.oracle).quote(tokenIn, c.asset, amountIn) * (BPS - c.maxSlippageBps)) / BPS;
        if (minOut == 0) return (false, 0);
        IERC20 asset = IERC20(c.asset);
        uint256 b0 = asset.balanceOf(address(this));
        IERC20(tokenIn).forceApprove(c.router, amountIn);
        try IDaemonRouter(c.router).swapExactIn(tokenIn, c.asset, amountIn, minOut, address(this)) {
            ok = true;
        } catch {}
        IERC20(tokenIn).forceApprove(c.router, 0);
        if (!ok) return (false, 0);
        out = asset.balanceOf(address(this)) - b0;
        if (out < minOut) revert SlippageExceeded(out, minOut);
    }

    /// @dev Amount of `token` (<= `available`) whose oracle value is `target` asset units (rounded up).
    function _spendFor(IStrategyRegistry.Config memory c, address token_, uint256 available, uint256 target)
        internal
        view
        returns (uint256)
    {
        uint256 value = IPriceOracle(c.oracle).quote(token_, c.asset, available);
        if (value == 0) return 0;
        if (value <= target) return available;
        return Math.min(Math.mulDiv(available, target, value, Math.Rounding.Ceil), available);
    }

    /// @dev Gas used so far (+ GAS_OVERHEAD) * tx.gasprice, valued MON -> asset by the oracle, capped.
    function _gasReimbursement(IStrategyRegistry.Config memory c, uint256 gasStart) internal view returns (uint256) {
        uint256 gasUsed = gasStart - gasleft() + GAS_OVERHEAD;
        return Math.min(_monToAsset(c, gasUsed * tx.gasprice), c.gasReimbursementCap);
    }

    function _monToAsset(IStrategyRegistry.Config memory c, uint256 monAmount) internal view returns (uint256) {
        if (monAmount == 0) return 0;
        return Math.min(IPriceOracle(c.oracle).quote(c.wmon, c.asset, monAmount), c.gasReimbursementCap);
    }

    /// @dev Caller share: bountyStartBps at `readyAt`, rising linearly to bountyMaxBps over bountyRampSeconds.
    function _shareBps(IStrategyRegistry.Config memory c, uint256 readyAt) internal view returns (uint256) {
        uint256 start = c.bountyStartBps;
        uint256 max = c.bountyMaxBps;
        if (max <= start) return max;
        uint256 elapsed = block.timestamp - readyAt;
        if (c.bountyRampSeconds == 0 || elapsed >= c.bountyRampSeconds) return max;
        return start + ((max - start) * elapsed) / c.bountyRampSeconds;
    }

    /// @dev Redeposits `amount` into the held source with the largest current balance, limited by its cap.
    ///      Whatever cannot be deposited stays idle in this account (it is still the owner's).
    function _redeposit(IStrategyRegistry.Config memory c, uint256 amount) internal {
        uint256 n = _sources.length;
        if (amount == 0 || n == 0) return;
        address best;
        uint256 bestAssets;
        for (uint256 i; i < n; ++i) {
            IYieldSource s = IYieldSource(_sources[i]);
            uint256 a = s.convertToAssets(s.balanceOf(address(this)));
            if (best == address(0) || a > bestAssets) {
                best = address(s);
                bestAssets = a;
            }
        }
        uint256 cap = STRATEGY_REGISTRY.capPerAccount(best);
        if (bestAssets >= cap) return;
        uint256 deposit = Math.min(amount, cap - bestAssets);
        IERC20(c.asset).forceApprove(best, deposit);
        IYieldSource(best).deposit(deposit, address(this));
        IERC20(c.asset).forceApprove(best, 0);
    }

    function _pendingProfit(IStrategyRegistry.Config memory c) internal view returns (uint256 value) {
        uint256 n = _sources.length;
        for (uint256 i; i < n; ++i) {
            IYieldSource s = IYieldSource(_sources[i]);
            uint256 pending = s.pendingRewards(address(this));
            if (pending == 0) continue;
            address rt = s.rewardToken();
            value += rt == c.asset ? pending : IPriceOracle(c.oracle).quote(rt, c.asset, pending);
        }
    }

    // ------------------------------------------------------------------------------------------------------------
    // Internal: hype / boost
    // ------------------------------------------------------------------------------------------------------------

    function _hypeMon(IStrategyRegistry.Config memory c, uint256 amount) internal {
        if (amount == 0 || amount < c.minHypeMon) revert HypeTooSmall(amount, c.minHypeMon);
        _checkHypeCooldowns(c);
        _potMon += amount;
        _hype(c, address(0), amount);
    }

    function _checkHypeCooldowns(IStrategyRegistry.Config memory c) internal view {
        uint256 last = lastHypeBy[msg.sender];
        if (last != 0 && block.timestamp < last + c.hypeCooldownPerUser) {
            revert HypeUserCooldown(last + c.hypeCooldownPerUser);
        }
        last = lastHypeAt;
        if (last != 0 && block.timestamp < last + c.hypeCooldownPerDaemon) {
            revert HypeDaemonCooldown(last + c.hypeCooldownPerDaemon);
        }
    }

    /// @dev Multiplier += step (capped at 1x + maxBoostBps); an expired boost restarts at 1x + step.
    ///      A $CHOG hype uses the $CHOG step and duration when they are set (bigger, longer boost).
    ///      The expiry becomes now + duration, but never moves earlier than an expiry already in place.
    function _hype(IStrategyRegistry.Config memory c, address payToken, uint256 amount) internal {
        lastHypeBy[msg.sender] = block.timestamp;
        lastHypeAt = block.timestamp;
        lastActivityAt = block.timestamp;

        bool withChog = payToken != address(0) && payToken == c.chog;
        uint256 step = withChog && c.chogBoostStepBps != 0 ? c.chogBoostStepBps : c.boostStepBps;
        uint256 duration = withChog && c.chogBoostDuration != 0 ? c.chogBoostDuration : c.boostDuration;
        bool active = _boostActive();
        uint256 base = active ? _boostMultiplierBps : BPS;
        uint256 mult = Math.min(base + step, BPS + c.maxBoostBps);
        uint256 expiresAt = block.timestamp + duration;
        if (active && _boostExpiresAt > expiresAt) expiresAt = _boostExpiresAt;
        _boostMultiplierBps = mult;
        _boostExpiresAt = expiresAt;

        uint256 tokenId = _tokenId();
        emit Hyped(tokenId, msg.sender, payToken, amount);
        emit BoostApplied(tokenId, mult, expiresAt);
        _update(c, 0);
    }

    function _boostActive() internal view returns (bool) {
        return _boostExpiresAt > block.timestamp && _boostMultiplierBps > BPS;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Internal: mood / messages
    // ------------------------------------------------------------------------------------------------------------

    /// @dev Priority: Tired (neglect) > Flexing (boosted & profit up) > Chaotic (boost at max, or profit swung by
    ///      more than 2x either way) > Smug (latest profit >= previous) > trait bias (Chill without a policy).
    function _mood(IStrategyRegistry.Config memory c) internal view returns (Mood) {
        uint256 activity = lastActivityAt;
        if (activity != 0 && block.timestamp - activity > c.neglectAfter) return Mood.Tired;
        bool boosted = _boostActive();
        uint256 last = lastProfit;
        uint256 prev = prevProfit;
        bool compounded = lastCompoundAt != 0;
        if (boosted && compounded && last > prev) return Mood.Flexing;
        if (boosted && _boostMultiplierBps >= BPS + c.maxBoostBps) return Mood.Chaotic;
        if (prev != 0 && (last * 2 < prev || last > prev * 2)) return Mood.Chaotic;
        if (compounded && last >= prev) return Mood.Smug;
        return _bias(c);
    }

    function _bias(IStrategyRegistry.Config memory c) internal view returns (Mood) {
        if (c.traitPolicy == address(0)) return Mood.Chill;
        (, address tokenContract, uint256 tokenId) = token();
        try ITraitPolicy(c.traitPolicy).moodBias(tokenContract, tokenId) returns (uint8 b) {
            if (b <= uint8(type(Mood).max)) return Mood(b);
        } catch {}
        return Mood.Chill;
    }

    /// @dev Recomputes mood, picks a message, stores it and emits DaemonUpdate.
    function _update(IStrategyRegistry.Config memory c, uint256 yieldAmount) internal {
        Mood m = _mood(c);
        uint256 tokenId = _tokenId();
        uint256 seed;
        unchecked {
            seed = ++_updates + tokenId;
        }
        string memory text = _message(m, _boostActive(), seed % 3);
        _lastMessage = text;
        emit DaemonUpdate(tokenId, uint8(m), text, yieldAmount);
    }

    /// @dev Hardcoded pool: 3 lines per mood, plus 3 boosted lines used whenever a boost is active (except Tired).
    function _message(Mood m, bool boosted, uint256 i) internal pure returns (string memory) {
        if (boosted && m != Mood.Tired) {
            return ["Hype received. Pot is fueling the grind.", "Boosted. Every harvest hits harder now.", "The crowd believes. Multiplier engaged."][i];
        }
        if (m == Mood.Smug) {
            return ["Another harvest. As expected.", "Compounding while you sleep. You're welcome.", "Numbers only go one way with me."][i];
        }
        if (m == Mood.Chaotic) {
            return ["Yield is swinging. I love it.", "Volatility is my cardio.", "Strap in. This Daemon has no brakes."][i];
        }
        if (m == Mood.Flexing) {
            return ["Bigger harvest than last time. Look at me.", "Boosted and up only. Flexing hard.", "Check the chart. Then check me."][i];
        }
        if (m == Mood.Tired) {
            return ["Nobody compounds me anymore...", "So sleepy. Someone hype me?", "Gathering dust. Wake me with a compound."][i];
        }
        return ["Just vibing and earning.", "Steady yield, steady mind.", "Chill day. The vault does the work."][i];
    }

    // ------------------------------------------------------------------------------------------------------------
    // Internal: source tracking / misc
    // ------------------------------------------------------------------------------------------------------------

    function _track(address source) internal {
        uint256 n = _sources.length;
        for (uint256 i; i < n; ++i) {
            if (_sources[i] == source) return;
        }
        if (n >= MAX_SOURCES) revert TooManySources();
        _sources.push(source);
    }

    function _untrack(address source) internal {
        uint256 n = _sources.length;
        for (uint256 i; i < n; ++i) {
            if (_sources[i] == source) {
                _removeAt(i);
                return;
            }
        }
    }

    function _removeAt(uint256 i) internal {
        uint256 last = _sources.length - 1;
        if (i != last) _sources[i] = _sources[last];
        _sources.pop();
    }

    function _trySendAll(address token_, address to) internal {
        if (token_ == address(0)) return;
        uint256 bal = _staticUint(token_, abi.encodeCall(IERC20.balanceOf, (address(this))));
        if (bal != 0) IERC20(token_).trySafeTransfer(to, bal);
    }

    /// @dev Non-reverting call; return data is never copied (no returndata bombs).
    function _tryCall(address target, bytes memory data) internal {
        assembly {
            pop(call(gas(), target, 0, add(data, 0x20), mload(data), 0, 0))
        }
    }

    /// @dev Non-reverting staticcall returning the first word of the result (0 on failure or short data).
    function _staticUint(address target, bytes memory data) internal view returns (uint256 v) {
        (bool ok, bytes memory ret) = target.staticcall(data);
        if (ok && ret.length >= 32) v = abi.decode(ret, (uint256));
    }

    function _tokenId() internal view returns (uint256 tokenId) {
        (,, tokenId) = token();
    }
}
