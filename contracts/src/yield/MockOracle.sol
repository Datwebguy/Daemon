// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPriceOracle} from "../interfaces/IDaemonRouter.sol";

/// @title MockOracle
/// @notice Testnet stand-in for Pyth: USD prices (1e18 = $1 per whole token) pushed by a single `updater`.
/// @dev Only used to compute the oracle-based minimum output of swaps. It has no access to any funds.
contract MockOracle is IPriceOracle {
    /// @notice Address allowed to set prices.
    address public immutable updater;

    struct PriceData {
        uint256 price; // USD per whole token, 1e18 precision
        uint256 updatedAt;
    }

    mapping(address => PriceData) private _prices;

    event PriceUpdated(address indexed token, uint256 price, uint256 updatedAt);

    error ZeroAddress();
    error NotUpdater();
    error PriceNotSet(address token);

    /// @param updater_ address allowed to call `setPrice`
    constructor(address updater_) {
        if (updater_ == address(0)) revert ZeroAddress();
        updater = updater_;
    }

    /// @notice Sets the USD price of one whole `token` (1e18 precision). Updater only.
    /// @param token token address
    /// @param price USD per whole token, 1e18 = $1 (0 unsets)
    function setPrice(address token, uint256 price) external {
        if (msg.sender != updater) revert NotUpdater();
        if (token == address(0)) revert ZeroAddress();
        _prices[token] = PriceData(price, block.timestamp);
        emit PriceUpdated(token, price, block.timestamp);
    }

    /// @notice Price (1e18 USD per whole token) and last update time of `token`.
    function priceOf(address token) external view returns (uint256 price, uint256 updatedAt) {
        PriceData memory d = _prices[token];
        return (d.price, d.updatedAt);
    }

    /// @inheritdoc IPriceOracle
    /// @dev amountOut = amountIn * priceIn * 10^decOut / (priceOut * 10^decIn), rounded down.
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        if (tokenIn == tokenOut) return amountIn;
        uint256 pIn = _prices[tokenIn].price;
        uint256 pOut = _prices[tokenOut].price;
        if (pIn == 0) revert PriceNotSet(tokenIn);
        if (pOut == 0) revert PriceNotSet(tokenOut);
        uint256 decIn = IERC20Metadata(tokenIn).decimals();
        uint256 decOut = IERC20Metadata(tokenOut).decimals();
        return Math.mulDiv(amountIn, pIn * 10 ** decOut, pOut * 10 ** decIn);
    }
}
