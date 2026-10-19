// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title WelcomeDrip
/// @notice A small, one-time MON gift for brand-new wallets so a first-time player can pay network fees without
///         leaving the app for a faucet. Anyone may fund it by sending MON.
/// @dev `claimFor` is public so a relayer (the app's server) can pay the gas for a wallet that has none. The limits
///      are enforced here, not by the relayer: one claim per wallet, only for wallets holding less than `amount`,
///      and at most `dailyLimit` claims per UTC day. So even a misused relayer can hand out at most
///      `amount * dailyLimit` per day. The funder can only withdraw what is left; it has no other power.
contract WelcomeDrip is ReentrancyGuardTransient {
    /// @notice MON sent to each new wallet.
    uint256 public immutable amount;
    /// @notice Max number of claims per UTC day.
    uint256 public immutable dailyLimit;
    /// @notice The only address that may withdraw leftover MON.
    address public immutable funder;

    /// @notice Wallets that already received their welcome MON.
    mapping(address wallet => bool) public claimed;
    /// @notice UTC day (timestamp / 1 day) of the current counter.
    uint256 public day;
    /// @notice Claims made during `day`.
    uint256 public claimsToday;

    event Dripped(address indexed to, uint256 amount);
    event Funded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    error ZeroAddress();
    error InvalidConfig();
    error AlreadyClaimed();
    error NotNew(uint256 balance);
    error DailyLimitReached();
    error OutOfFunds();
    error NotFunder();
    error TransferFailed();

    /// @param amount_ MON per new wallet
    /// @param dailyLimit_ max claims per UTC day
    /// @param funder_ address allowed to withdraw leftovers
    constructor(uint256 amount_, uint256 dailyLimit_, address funder_) {
        if (funder_ == address(0)) revert ZeroAddress();
        if (amount_ == 0 || dailyLimit_ == 0) revert InvalidConfig();
        amount = amount_;
        dailyLimit = dailyLimit_;
        funder = funder_;
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Sends `amount` MON to `to` once, if `to` is a near-empty wallet and today's budget allows it.
    function claimFor(address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (claimed[to]) revert AlreadyClaimed();
        if (to.balance >= amount) revert NotNew(to.balance);
        if (address(this).balance < amount) revert OutOfFunds();
        uint256 today = block.timestamp / 1 days;
        if (today != day) {
            day = today;
            claimsToday = 0;
        }
        if (claimsToday >= dailyLimit) revert DailyLimitReached();

        claimed[to] = true;
        ++claimsToday;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Dripped(to, amount);
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

    /// @notice Funder only: withdraws leftover MON.
    function withdraw(uint256 value) external nonReentrant {
        if (msg.sender != funder) revert NotFunder();
        (bool ok,) = funder.call{value: value}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(funder, value);
    }
}
