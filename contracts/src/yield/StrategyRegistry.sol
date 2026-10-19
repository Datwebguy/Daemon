// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IStrategyRegistry} from "../interfaces/IStrategyRegistry.sol";
import {IYieldSource} from "../interfaces/IYieldSource.sol";

/// @title StrategyRegistry
/// @notice Immutable platform configuration plus the append-only list of approved yield sources.
/// @dev The configuration is set once in the constructor and can never change. The only privileged role is
/// `governor`, who may queue a new source and activate it after `timelockDelay`. Sources can never be removed
/// and their caps can never be changed, so an owner's exit is never blocked. The governor has no power over
/// user funds.
contract StrategyRegistry is IStrategyRegistry {
    struct PendingSource {
        uint256 capPerAccount;
        uint256 eta;
    }

    /// @notice The only address that can queue and activate sources.
    address public immutable governor;
    uint256 private immutable _timelockDelay;

    Config private _config;
    address[] private _sources;
    mapping(address => bool) private _approved;
    mapping(address => uint256) private _caps;
    /// @notice Queued, not yet activated sources.
    mapping(address => PendingSource) public pending;

    error ZeroAddress();
    error InvalidConfig();
    error NotGovernor();
    error ZeroCap();
    error AlreadyApproved();
    error AlreadyQueued();
    error NotQueued();
    error TimelockNotElapsed(uint256 eta);
    error AssetMismatch(address expected, address actual);
    error TooManySources();

    /// @notice Max slippage the config may allow (50%).
    uint16 public constant MAX_SLIPPAGE_BPS = 5_000;
    /// @notice Max share of a $CHOG hype that may be burned (50%).
    uint16 public constant MAX_CHOG_BURN_BPS = 5_000;
    /// @notice Min gas the lucky-hype Entropy callback must be given.
    uint32 public constant MIN_LUCKY_GAS = 60_000;
    /// @notice Max number of sources; keeps DaemonAccount.sweepToOwner's registry pass complete (MAX_SWEEP_SOURCES).
    uint256 public constant MAX_TOTAL_SOURCES = 16;

    event SourceCancelled(address indexed source);

    /// @param config_ platform configuration (immutable)
    /// @param governor_ address allowed to queue/activate sources
    /// @param timelockDelay_ seconds between queueing and activation
    constructor(Config memory config_, address governor_, uint256 timelockDelay_) {
        if (governor_ == address(0) || config_.asset == address(0)) revert ZeroAddress();
        // Config is immutable, so reject values that would permanently disable compounding:
        // a bounty of 100% always reverts InsufficientProfit; slippage >= 50% makes min-out meaningless;
        // a router/oracle without code makes every swap or quote revert.
        if (
            config_.bountyStartBps > config_.bountyMaxBps || config_.bountyMaxBps >= 10_000
                || config_.maxSlippageBps > MAX_SLIPPAGE_BPS || config_.router.code.length == 0
                || config_.oracle.code.length == 0
        ) revert InvalidConfig();
        // $CHOG burn is a share of a hype, never all of it; a lucky-hype setup needs a real Entropy contract and
        // enough callback gas, and its chance is a probability.
        if (
            config_.chogBurnBps > MAX_CHOG_BURN_BPS || config_.luckyChanceBps > 10_000
                || (config_.entropy != address(0)
                    && (config_.entropy.code.length == 0 || config_.luckyGasLimit < MIN_LUCKY_GAS))
        ) revert InvalidConfig();
        _config = config_;
        governor = governor_;
        _timelockDelay = timelockDelay_;
    }

    /// @inheritdoc IStrategyRegistry
    function config() external view returns (Config memory) {
        return _config;
    }

    /// @inheritdoc IStrategyRegistry
    function isApproved(address source) external view returns (bool) {
        return _approved[source];
    }

    /// @inheritdoc IStrategyRegistry
    function capPerAccount(address source) external view returns (uint256) {
        return _caps[source];
    }

    /// @inheritdoc IStrategyRegistry
    function sources() external view returns (address[] memory) {
        return _sources;
    }

    /// @inheritdoc IStrategyRegistry
    function timelockDelay() external view returns (uint256) {
        return _timelockDelay;
    }

    /// @notice Queues `source` with a per-account cap; it can be activated after `timelockDelay`.
    /// @dev Governor only. Reverts if already approved or already queued.
    /// @param source the yield source (IYieldSource)
    /// @param capPerAccount_ max assets one Daemon may hold in `source`
    function queueSource(address source, uint256 capPerAccount_) external {
        if (msg.sender != governor) revert NotGovernor();
        if (source == address(0)) revert ZeroAddress();
        if (capPerAccount_ == 0) revert ZeroCap();
        if (_approved[source]) revert AlreadyApproved();
        if (pending[source].eta != 0) revert AlreadyQueued();
        uint256 eta = block.timestamp + _timelockDelay;
        pending[source] = PendingSource(capPerAccount_, eta);
        emit SourceQueued(source, capPerAccount_, eta);
    }

    /// @notice Activates a queued source once its timelock has elapsed. Permanent: sources cannot be removed.
    /// @dev Governor only. Validates `IYieldSource(source).asset() == config.asset`.
    /// @param source the queued source
    function activateSource(address source) external {
        if (msg.sender != governor) revert NotGovernor();
        PendingSource memory p = pending[source];
        if (p.eta == 0) revert NotQueued();
        if (block.timestamp < p.eta) revert TimelockNotElapsed(p.eta);
        address actual = IYieldSource(source).asset();
        if (actual != _config.asset) revert AssetMismatch(_config.asset, actual);

        if (_sources.length >= MAX_TOTAL_SOURCES) revert TooManySources();

        delete pending[source];
        _approved[source] = true;
        _caps[source] = p.capPerAccount;
        _sources.push(source);
        emit SourceActivated(source, p.capPerAccount);
    }

    /// @notice Cancels a queued (not yet active) source, e.g. a mistake. Active sources can never be removed.
    /// @dev Governor only.
    function cancelQueued(address source) external {
        if (msg.sender != governor) revert NotGovernor();
        if (pending[source].eta == 0) revert NotQueued();
        delete pending[source];
        emit SourceCancelled(source);
    }
}
