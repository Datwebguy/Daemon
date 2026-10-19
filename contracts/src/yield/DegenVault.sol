// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {RewardVault} from "./RewardVault.sol";

/// @title DegenVault
/// @notice A RewardVault whose effective reward rate swings per epoch between 0.5x and 2x of the base rate.
/// @dev Choice: StableVault is a plain RewardVault deployment (constant rate, label "Stable"); DegenVault is this
/// subclass (variable rate, label "Degen").
/// - Each epoch (`epochLength` seconds, aligned to unix time) gets a multiplier in [5000, 20000] bps derived
///   deterministically from `keccak256(seed, epoch)`. `seed` is fixed at deploy from the previous blockhash.
///   It is NOT secure randomness and does not need to be: it only shapes how fast the funded budget streams,
///   and every share holder gets the same per-second, per-share rate at any time.
/// - Streaming is budget-capped (see RewardVault): high epochs drain the pool faster, low epochs make it last
///   longer, but the vault can never pay out more than was funded.
/// - To keep accrual gas bounded, a notify may span at most `MAX_EPOCHS_PER_PERIOD` epochs. Because the minimum
///   multiplier is 0.5x, a funded budget is used up within roughly 4x the nominal duration, so the accrual loop
///   is bounded by about 4 * MAX_EPOCHS_PER_PERIOD iterations.
contract DegenVault is RewardVault {
    /// @notice Lowest multiplier (0.5x) in basis points.
    uint256 public constant MIN_MULTIPLIER_BPS = 5_000;
    /// @notice Highest multiplier (2x) in basis points.
    uint256 public constant MAX_MULTIPLIER_BPS = 20_000;
    /// @notice Max epochs a single notify's nominal duration may span.
    uint256 public constant MAX_EPOCHS_PER_PERIOD = 500;
    /// @notice Minimum epoch length in seconds.
    uint256 public constant MIN_EPOCH_LENGTH = 60;

    /// @notice Epoch length in seconds.
    uint256 public immutable epochLength;
    /// @notice Seed for the per-epoch multiplier, fixed at deploy.
    bytes32 public immutable seed;

    error InvalidEpochLength();

    /// @param asset_ base asset (e.g. dUSD)
    /// @param rewardToken_ reward token (e.g. DMNR); must differ from `asset_`
    /// @param rewardsDistributor_ address allowed to fund rewards
    /// @param name_ share token name
    /// @param symbol_ share token symbol
    /// @param riskLabel_ human-readable risk label, e.g. "Degen"
    /// @param epochLength_ seconds per multiplier epoch (>= 60), e.g. 3600
    constructor(
        IERC20 asset_,
        IERC20 rewardToken_,
        address rewardsDistributor_,
        string memory name_,
        string memory symbol_,
        string memory riskLabel_,
        uint256 epochLength_
    ) RewardVault(asset_, rewardToken_, rewardsDistributor_, name_, symbol_, riskLabel_) {
        if (epochLength_ < MIN_EPOCH_LENGTH) revert InvalidEpochLength();
        epochLength = epochLength_;
        seed = keccak256(abi.encode(blockhash(block.number - 1), address(this), block.chainid));
    }

    /// @notice Multiplier (bps, 10000 = 1x) applied to the base rate during `epoch`.
    /// @param epoch epoch index (`timestamp / epochLength`)
    function multiplierBpsAt(uint256 epoch) public view returns (uint256) {
        return MIN_MULTIPLIER_BPS
            + uint256(keccak256(abi.encode(seed, epoch))) % (MAX_MULTIPLIER_BPS - MIN_MULTIPLIER_BPS + 1);
    }

    /// @notice Current epoch index.
    function currentEpoch() public view returns (uint256) {
        return block.timestamp / epochLength;
    }

    /// @notice Multiplier (bps) applied right now.
    function currentMultiplierBps() external view returns (uint256) {
        return multiplierBpsAt(currentEpoch());
    }

    /// @notice Effective reward tokens per second right now (base rate x current multiplier), 0 if exhausted.
    function effectiveRewardRate() external view returns (uint256) {
        if (rewardsRemaining() == 0) return 0;
        return Math.mulDiv(rewardRate, multiplierBpsAt(currentEpoch()), 10_000);
    }

    function _streamed(uint256 from, uint256 to, uint256 rate, uint256 budget)
        internal
        view
        override
        returns (uint256 total)
    {
        uint256 len = epochLength;
        uint256 t = from;
        while (t < to) {
            uint256 epoch = t / len;
            uint256 end = (epoch + 1) * len;
            if (end > to) end = to;
            (bool ok, uint256 base) = Math.tryMul(rate, end - t);
            if (!ok) return budget;
            uint256 amount = Math.mulDiv(base, multiplierBpsAt(epoch), 10_000);
            if (amount >= budget - total) return budget;
            total += amount;
            t = end;
        }
    }

    function _validateDuration(uint256 duration) internal view override {
        if (duration / epochLength > MAX_EPOCHS_PER_PERIOD) revert InvalidDuration();
    }
}
