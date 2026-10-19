// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The Daemon: an ERC-6551 token-bound account for one Chog.
/// Owner = current holder of the Chog. No session keys, no executor, no admin.
/// `compound` and `hype` are public; everything that moves funds out is owner-only.
interface IDaemonAccount {
    enum Mood {
        Chill,
        Smug,
        Chaotic,
        Flexing,
        Tired
    }

    event Allocated(uint256 indexed tokenId, address indexed source, uint256 assets, uint256 shares);
    event Deallocated(uint256 indexed tokenId, address indexed source, uint256 shares, uint256 assets);
    event Compounded(uint256 indexed tokenId, address indexed caller, uint256 profit, uint256 bounty);
    event DaemonUpdate(uint256 indexed tokenId, uint8 mood, string message, uint256 yieldAmount);
    event Hyped(uint256 indexed tokenId, address indexed from, address token, uint256 amount);
    event BoostApplied(uint256 indexed tokenId, uint256 multiplierBps, uint256 expiresAt);
    event Swept(uint256 indexed tokenId, address indexed to);

    // --- identity ---
    function owner() external view returns (address);
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);

    // --- owner only ---
    /// @notice Deposits `assets` of the base asset already held by this account into an approved source.
    function allocate(address source, uint256 assets) external;
    /// @notice Redeems `shares` from `source` back into this account.
    function deallocate(address source, uint256 shares) external;
    /// @notice Exits every source and sends all assets, rewards, pots and MON to the owner.
    function sweepToOwner() external;

    // --- public ---
    /// @notice Harvest -> swap (oracle min-out) -> restake. Pays the bounty to `bountyRecipient`.
    /// Reverts during cooldown or if profit does not exceed gas reimbursement + bounty.
    function compound(address bountyRecipient) external returns (uint256 profit, uint256 bounty);
    /// @notice Anyone can hype with MON. Payment goes into this Daemon's boost pot.
    function hype() external payable;
    /// @notice Anyone can hype with $CHOG (pulled from msg.sender via transferFrom).
    function hypeWithChog(uint256 amount) external;

    // --- views ---
    function getMood() external view returns (Mood);
    function lastMessage() external view returns (string memory);
    /// @return multiplierBps total multiplier in bps (10000 = 1x), expiresAt, pots in MON and $CHOG
    function getBoost() external view returns (uint256 multiplierBps, uint256 expiresAt, uint256 potMon, uint256 potChog);
    /// @notice Value of pending rewards across sources, in base-asset units (oracle quote).
    function pendingProfit() external view returns (uint256);
    /// @notice Bounty a caller would receive right now (0 if compound would revert).
    function pendingBounty() external view returns (uint256);
    function lastCompoundAt() external view returns (uint256);
    function lastActivityAt() external view returns (uint256);
    /// @notice Assets across all sources plus idle base asset, in base-asset units.
    function totalAssets() external view returns (uint256);
    function lifetimeYield() external view returns (uint256);
}
