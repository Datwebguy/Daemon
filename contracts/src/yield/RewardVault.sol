// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IYieldSource} from "../interfaces/IYieldSource.sol";

/// @title RewardVault
/// @notice ERC-4626 vault over a base asset that streams a separate reward token to share holders,
/// Synthetix StakingRewards-style (rewards accrue per share, linearly over time).
/// @dev Design notes:
/// - Deposits are never touched by anyone but their owner. The `rewardsDistributor` can only ADD reward
///   tokens via `notifyRewardAmount`; there is no rescue/sweep/pause function.
/// - Budget model: every funded reward token goes into `rewardsRemaining`, which is streamed at `rewardRate`
///   tokens/second until it is used up. Streaming never allocates more than was funded, so the vault is always
///   solvent in the reward token, and when the pool is exhausted rewards simply stop (deposits, withdrawals and
///   claims keep working). While the vault has no shares, nothing is streamed and the budget is preserved.
/// - `periodFinish` is the nominal end of the stream set at the last notify (informational only).
/// - Rewards are checkpointed for both sides of every mint, burn and share transfer (`_update` override).
/// - Inflation-attack resistance: OZ virtual shares/assets with `_decimalsOffset() = 6`.
/// - The reward token must differ from the asset, so streamed rewards never inflate `totalAssets()` and there is
///   no share-price jump to sandwich.
/// - StableVault = a plain deployment of this contract (constant rate). DegenVault = subclass with a per-epoch
///   multiplier on the rate (see DegenVault.sol).
contract RewardVault is ERC4626, ReentrancyGuard, IYieldSource {
    using SafeERC20 for IERC20;

    /// @dev Fixed-point precision for rewards-per-share.
    uint256 internal constant PRECISION = 1e36;
    /// @dev Virtual share offset (10**6 virtual shares per virtual asset unit).
    uint8 internal constant DECIMALS_OFFSET = 6;
    /// @notice Longest stream a single notify may configure.
    uint256 public constant MAX_REWARD_DURATION = 3650 days;

    IERC20 private immutable _rewardToken;
    /// @notice The only address allowed to fund rewards. It cannot touch deposits.
    address public immutable rewardsDistributor;
    string private _riskLabel;

    /// @notice Base reward tokens streamed per second (before any multiplier).
    uint256 public rewardRate;
    /// @notice Nominal end of the current stream (informational; streaming is budget-based).
    uint256 public periodFinish;
    /// @notice Last time the global reward state was checkpointed.
    uint256 public lastUpdateTime;
    /// @notice Checkpointed rewards per share, scaled by 1e36.
    uint256 public rewardPerShareStored;
    /// @notice Lifetime reward tokens funded through `notifyRewardAmount`.
    uint256 public totalRewardsFunded;
    /// @notice Lifetime reward tokens claimed.
    uint256 public totalRewardsClaimed;

    uint256 internal _rewardsRemaining;
    mapping(address => uint256) public userRewardPerSharePaid;
    mapping(address => uint256) internal _rewards;

    event RewardAdded(uint256 amount, uint256 duration, uint256 rewardRate, uint256 periodFinish);
    event RewardPaid(address indexed account, address indexed to, uint256 amount);

    error ZeroAddress();
    error RewardTokenIsAsset();
    error NotRewardsDistributor();
    error ZeroAmount();
    error InvalidDuration();
    error RewardRateTooLow();

    /// @param asset_ base asset (e.g. dUSD)
    /// @param rewardToken_ reward token (e.g. DMNR); must differ from `asset_`
    /// @param rewardsDistributor_ address allowed to fund rewards
    /// @param name_ share token name
    /// @param symbol_ share token symbol
    /// @param riskLabel_ human-readable risk label, e.g. "Stable"
    constructor(
        IERC20 asset_,
        IERC20 rewardToken_,
        address rewardsDistributor_,
        string memory name_,
        string memory symbol_,
        string memory riskLabel_
    ) ERC20(name_, symbol_) ERC4626(asset_) {
        if (address(asset_) == address(0) || address(rewardToken_) == address(0) || rewardsDistributor_ == address(0))
        {
            revert ZeroAddress();
        }
        if (address(rewardToken_) == address(asset_)) revert RewardTokenIsAsset();
        _rewardToken = rewardToken_;
        rewardsDistributor = rewardsDistributor_;
        _riskLabel = riskLabel_;
        lastUpdateTime = block.timestamp;
    }

    // ------------------------------------------------------------------
    // IYieldSource / ERC-4626
    // ------------------------------------------------------------------

    /// @inheritdoc IYieldSource
    function asset() public view override(ERC4626, IYieldSource) returns (address) {
        return super.asset();
    }

    /// @inheritdoc IYieldSource
    function balanceOf(address account) public view override(ERC20, IERC20, IYieldSource) returns (uint256) {
        return super.balanceOf(account);
    }

    /// @inheritdoc IYieldSource
    function convertToAssets(uint256 shares) public view override(ERC4626, IYieldSource) returns (uint256) {
        return super.convertToAssets(shares);
    }

    /// @notice Deposits `assets` of the base asset and mints shares to `receiver`.
    function deposit(uint256 assets, address receiver)
        public
        override(ERC4626, IYieldSource)
        nonReentrant
        returns (uint256)
    {
        return super.deposit(assets, receiver);
    }

    /// @notice Mints exactly `shares` to `receiver`, pulling the required assets.
    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
        return super.mint(shares, receiver);
    }

    /// @notice Burns shares from `owner` and sends exactly `assets` to `receiver`.
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return super.withdraw(assets, receiver, owner);
    }

    /// @notice Burns exactly `shares` from `owner` and sends the assets to `receiver`.
    function redeem(uint256 shares, address receiver, address owner)
        public
        override(ERC4626, IYieldSource)
        nonReentrant
        returns (uint256)
    {
        return super.redeem(shares, receiver, owner);
    }

    /// @inheritdoc IYieldSource
    function rewardToken() external view returns (address) {
        return address(_rewardToken);
    }

    /// @inheritdoc IYieldSource
    function riskLabel() external view returns (string memory) {
        return _riskLabel;
    }

    /// @inheritdoc IYieldSource
    function pendingRewards(address account) public view returns (uint256) {
        (uint256 rps,) = _currentRewardState();
        return _earned(account, rps);
    }

    /// @inheritdoc IYieldSource
    function claimRewards(address to) external nonReentrant returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        _updateReward(msg.sender);
        amount = _rewards[msg.sender];
        emit RewardPaid(msg.sender, to, amount);
        if (amount > 0) {
            _rewards[msg.sender] = 0;
            totalRewardsClaimed += amount;
            _rewardToken.safeTransfer(to, amount);
        }
    }

    // ------------------------------------------------------------------
    // Reward funding
    // ------------------------------------------------------------------

    /// @notice Funds `amount` reward tokens (pulled from the distributor) and (re)starts the stream so that
    /// everything still unstreamed plus `amount` is streamed at a base rate over `duration` seconds.
    /// @dev Only callable by `rewardsDistributor`. Requires prior approval of `amount` reward tokens.
    /// @param amount reward tokens to add
    /// @param duration nominal stream length in seconds
    function notifyRewardAmount(uint256 amount, uint256 duration) external nonReentrant {
        if (msg.sender != rewardsDistributor) revert NotRewardsDistributor();
        if (amount == 0) revert ZeroAmount();
        if (duration == 0 || duration > MAX_REWARD_DURATION) revert InvalidDuration();
        _validateDuration(duration);

        _updateReward(address(0));

        uint256 remaining = _rewardsRemaining + amount;
        uint256 rate = remaining / duration;
        if (rate == 0) revert RewardRateTooLow();

        _rewardsRemaining = remaining;
        totalRewardsFunded += amount;
        rewardRate = rate;
        periodFinish = block.timestamp + duration;
        emit RewardAdded(amount, duration, rate, block.timestamp + duration);

        _rewardToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    /// @notice Funded reward tokens not yet streamed to share holders (live value).
    function rewardsRemaining() public view returns (uint256 remaining) {
        (, remaining) = _currentRewardState();
    }

    /// @notice Current rewards per share, scaled by 1e36 (live value).
    function rewardPerShare() public view returns (uint256 rps) {
        (rps,) = _currentRewardState();
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /// @dev Checkpoints rewards for both sides of every mint, burn and transfer, using the supply before the change.
    function _update(address from, address to, uint256 value) internal virtual override {
        _updateReward(from);
        if (to != from) _updateReward(to);
        super._update(from, to, value);
    }

    function _updateReward(address account) internal {
        if (lastUpdateTime != block.timestamp) {
            (uint256 rps, uint256 remaining) = _currentRewardState();
            rewardPerShareStored = rps;
            _rewardsRemaining = remaining;
            lastUpdateTime = block.timestamp;
        }
        if (account != address(0)) {
            uint256 rps_ = rewardPerShareStored;
            _rewards[account] = _earned(account, rps_);
            userRewardPerSharePaid[account] = rps_;
        }
    }

    function _currentRewardState() internal view returns (uint256 rps, uint256 remaining) {
        rps = rewardPerShareStored;
        remaining = _rewardsRemaining;
        uint256 supply = totalSupply();
        uint256 last = lastUpdateTime;
        if (supply == 0 || remaining == 0 || block.timestamp <= last || rewardRate == 0) {
            return (rps, remaining);
        }
        uint256 streamed = _streamed(last, block.timestamp, rewardRate, remaining);
        rps += Math.mulDiv(streamed, PRECISION, supply);
        remaining -= streamed;
    }

    function _earned(address account, uint256 rps) internal view returns (uint256) {
        return _rewards[account] + Math.mulDiv(balanceOf(account), rps - userRewardPerSharePaid[account], PRECISION);
    }

    /// @dev Reward tokens streamed over [from, to) at base `rate`, never more than `budget`.
    /// Overridden by DegenVault to apply a per-epoch multiplier.
    function _streamed(uint256 from, uint256 to, uint256 rate, uint256 budget)
        internal
        view
        virtual
        returns (uint256)
    {
        (bool ok, uint256 amount) = Math.tryMul(rate, to - from);
        return ok ? Math.min(amount, budget) : budget;
    }

    /// @dev Hook for subclasses to restrict stream durations.
    function _validateDuration(uint256 duration) internal view virtual {}

    function _decimalsOffset() internal pure override returns (uint8) {
        return DECIMALS_OFFSET;
    }
}
