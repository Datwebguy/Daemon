// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Testnet faucet token with configurable decimals. Anyone can mint.
/// @dev Used for dUSD (base asset, 18 decimals), DMNR (reward token) and mock $CHOG. Testnet only.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    /// @param name_ token name
    /// @param symbol_ token symbol
    /// @param decimals_ token decimals
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /// @notice Token decimals, as configured at deploy time.
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Faucet: mints `amount` tokens to `to`. Permissionless (testnet only).
    /// @param to recipient
    /// @param amount amount in token units
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
