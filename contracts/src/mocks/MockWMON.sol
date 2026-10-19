// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IWMON} from "../interfaces/IDaemonRouter.sol";

/// @title MockWMON
/// @notice WETH9-style wrapped MON. 1 WMON is always backed by 1 MON held by this contract.
contract MockWMON is ERC20, IWMON, ReentrancyGuard {
    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    error NativeTransferFailed();

    constructor() ERC20("Wrapped MON", "WMON") {}

    /// @notice Wraps MON sent with the call by plain transfer.
    receive() external payable {
        _wrap();
    }

    /// @notice Wraps `msg.value` MON into WMON for msg.sender.
    function deposit() external payable {
        _wrap();
    }

    /// @notice Burns `amount` WMON from msg.sender and sends back the same amount of MON.
    /// @param amount amount to unwrap
    function withdraw(uint256 amount) external nonReentrant {
        _burn(msg.sender, amount);
        emit Withdrawal(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }

    function _wrap() private {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }
}
