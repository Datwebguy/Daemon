// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title WelcomeDrip
/// @notice A small, one-time MON gift for brand-new wallets so a first-time player can pay network fees without
///         leaving the app for a faucet. Anyone may fund it by sending MON.
/// @dev Only the `relayer` (the app's server, which checks the player's sign-in) can call `claimFor`, and it pays the
///      gas the new wallet does not have. Everyone else is refused, so bots cannot drain the pool by calling the
///      contract directly. The limits are enforced here, not by the relayer: one claim per wallet AND one per signed-in
///      account (`userId`, a hash of the sign-in identity, so many fresh wallets cannot farm one account), only for
///      wallets holding less than `amount`, and at most `dailyLimit` claims per UTC day, so even a stolen relayer key
///      can hand out at most `amount * dailyLimit` per day. The funder can swap the relayer (if its key leaks) and withdraw
///      what is left; it has no other power.
contract WelcomeDrip is ReentrancyGuardTransient {
    /// @notice MON sent to each new wallet.
    uint256 public immutable amount;
    /// @notice Max number of claims per UTC day.
    uint256 public immutable dailyLimit;
    /// @notice The only address that may withdraw leftover MON or replace the relayer.
    address public immutable funder;
    /// @notice The only address that may call `claimFor`.
    address public relayer;

    /// @notice Wallets that already received their welcome MON.
    mapping(address wallet => bool) public claimed;
    /// @notice Signed-in accounts (hash of the sign-in identity) that already received their welcome MON.
    mapping(bytes32 userId => bool) public userClaimed;
    /// @notice UTC day (timestamp / 1 day) of the current counter.
    uint256 public day;
    /// @notice Claims made during `day`.
    uint256 public claimsToday;

    event Dripped(address indexed to, bytes32 indexed userId, uint256 amount);
    event Funded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event RelayerChanged(address indexed relayer);

    error ZeroAddress();
    error InvalidConfig();
    error AlreadyClaimed();
    error UserAlreadyClaimed();
    error ZeroUser();
    error NotNew(uint256 balance);
    error DailyLimitReached();
    error OutOfFunds();
    error NotFunder();
    error NotRelayer();
    error TransferFailed();

    /// @param amount_ MON per new wallet
    /// @param dailyLimit_ max claims per UTC day
    /// @param funder_ address allowed to withdraw leftovers and replace the relayer
    /// @param relayer_ address allowed to call `claimFor`
    constructor(uint256 amount_, uint256 dailyLimit_, address funder_, address relayer_) {
        if (funder_ == address(0) || relayer_ == address(0)) revert ZeroAddress();
        if (amount_ == 0 || dailyLimit_ == 0) revert InvalidConfig();
        amount = amount_;
        dailyLimit = dailyLimit_;
        funder = funder_;
        relayer = relayer_;
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Sends `amount` MON to `to` once, if `to` is a near-empty wallet, the signed-in account has not claimed
    ///         before, and today's budget allows it.
    /// @param to the new wallet
    /// @param userId hash of the signed-in account's identity (set by the relayer from the verified sign-in)
    function claimFor(address to, bytes32 userId) external nonReentrant {
        if (msg.sender != relayer) revert NotRelayer();
        if (to == address(0)) revert ZeroAddress();
        if (userId == bytes32(0)) revert ZeroUser();
        if (claimed[to]) revert AlreadyClaimed();
        if (userClaimed[userId]) revert UserAlreadyClaimed();
        if (to.balance >= amount) revert NotNew(to.balance);
        if (address(this).balance < amount) revert OutOfFunds();
        uint256 today = block.timestamp / 1 days;
        if (today != day) {
            day = today;
            claimsToday = 0;
        }
        if (claimsToday >= dailyLimit) revert DailyLimitReached();

        claimed[to] = true;
        userClaimed[userId] = true;
        ++claimsToday;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Dripped(to, userId, amount);
    }

    /// @notice Why `to` cannot claim right now (empty string = it can).
    function status(address to) external view returns (string memory) {
        if (to == address(0)) return "no address";
        if (claimed[to]) return "already claimed";
        if (to.balance >= amount) return "wallet already has MON";
        if (address(this).balance < amount) return "drip is empty";
        uint256 today = block.timestamp / 1 days;
        if (today == day && claimsToday >= dailyLimit) return "daily limit reached";
        return "";
    }

    /// @notice Funder only: replaces the relayer (for example after its key leaked).
    function setRelayer(address relayer_) external {
        if (msg.sender != funder) revert NotFunder();
        if (relayer_ == address(0)) revert ZeroAddress();
        relayer = relayer_;
        emit RelayerChanged(relayer_);
    }

    /// @notice Funder only: withdraws leftover MON.
    function withdraw(uint256 value) external nonReentrant {
        if (msg.sender != funder) revert NotFunder();
        (bool ok,) = funder.call{value: value}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(funder, value);
    }
}
