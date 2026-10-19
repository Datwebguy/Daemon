// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A yield source a Daemon can allocate to. ERC-4626 shaped, plus a separate reward stream.
/// The Daemon account holds the shares itself; sources never custody on behalf of a third party.
/// Rewards are streamed over time (Synthetix-style), so there is no share-price jump to sandwich.
interface IYieldSource {
    // --- ERC-4626 subset ---
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function balanceOf(address account) external view returns (uint256 shares);
    function convertToAssets(uint256 shares) external view returns (uint256 assets);

    // --- rewards ---
    /// @notice Token rewards are paid in (different from `asset`, so compounding needs a swap).
    function rewardToken() external view returns (address);
    /// @notice Unclaimed rewards of `account`.
    function pendingRewards(address account) external view returns (uint256);
    /// @notice Claims msg.sender's rewards and sends them to `to`. Returns the amount claimed.
    function claimRewards(address to) external returns (uint256);

    /// @notice Human-readable risk label, e.g. "Stable" or "Degen". Drives mood flavour in the UI.
    function riskLabel() external view returns (string memory);
}
