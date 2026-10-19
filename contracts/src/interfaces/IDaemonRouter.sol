// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal swap router used by Daemon accounts (testnet: MockRouter, constant-product pools).
interface IDaemonRouter {
    /// @notice Swaps exactly `amountIn` of `tokenIn` (pulled from msg.sender) for `tokenOut`, sent to `to`.
    /// Must revert if output < `minAmountOut`.
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to)
        external
        returns (uint256 amountOut);
}

/// @notice Fair-price source used to compute the minimum swap output. Never caller-supplied.
interface IPriceOracle {
    /// @notice Value of `amountIn` of `tokenIn`, expressed in `tokenOut` units, at the oracle price.
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut);
}

/// @notice Wrapped MON (WETH9-style).
interface IWMON {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
