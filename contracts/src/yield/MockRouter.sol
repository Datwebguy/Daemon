// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IDaemonRouter} from "../interfaces/IDaemonRouter.sol";

/// @title MockRouter
/// @notice Testnet swap router: one constant-product pool (x * y = k, 0.3% fee) per unordered token pair.
/// @dev Liquidity is permanently donated: `addLiquidity` is public, mints no LP tokens and cannot be withdrawn.
/// There is no admin. Amounts are accepted at any ratio (the first deposit sets the price; later deposits at a
/// different ratio move it), which is fine for a testnet stand-in. Daemon accounts protect themselves with an
/// oracle-based `minAmountOut`.
contract MockRouter is IDaemonRouter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BPS = 30;
    uint256 private constant BPS = 10_000;

    struct Pool {
        uint256 reserve0; // reserve of the lower-address token
        uint256 reserve1; // reserve of the higher-address token
    }

    mapping(address => mapping(address => Pool)) private _pools;

    event LiquidityAdded(address indexed provider, address indexed tokenA, address indexed tokenB, uint256 amountA, uint256 amountB);
    event Swap(
        address indexed sender,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address to
    );

    error IdenticalTokens();
    error ZeroAddress();
    error ZeroAmount();
    error NoLiquidity();
    error InsufficientOutput(uint256 amountOut, uint256 minAmountOut);

    /// @notice Adds `amountA` of `tokenA` and `amountB` of `tokenB` (pulled from msg.sender) to their pool.
    /// @dev Liquidity is donated permanently; no LP tokens.
    function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB) external nonReentrant {
        (address t0, address t1) = _sort(tokenA, tokenB);
        if (amountA == 0 || amountB == 0) revert ZeroAmount();
        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);
        Pool storage p = _pools[t0][t1];
        if (tokenA == t0) {
            p.reserve0 += amountA;
            p.reserve1 += amountB;
        } else {
            p.reserve0 += amountB;
            p.reserve1 += amountA;
        }
        emit LiquidityAdded(msg.sender, tokenA, tokenB, amountA, amountB);
    }

    /// @inheritdoc IDaemonRouter
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (to == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();
        (uint256 reserveIn, uint256 reserveOut) = getReserves(tokenIn, tokenOut);
        if (reserveIn == 0 || reserveOut == 0) revert NoLiquidity();
        amountOut = _amountOut(amountIn, reserveIn, reserveOut);
        if (amountOut == 0 || amountOut < minAmountOut) revert InsufficientOutput(amountOut, minAmountOut);

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        _setReserves(tokenIn, tokenOut, reserveIn + amountIn, reserveOut - amountOut);
        IERC20(tokenOut).safeTransfer(to, amountOut);
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, to);
    }

    /// @notice Reserves of the (tokenA, tokenB) pool, ordered as the arguments.
    function getReserves(address tokenA, address tokenB) public view returns (uint256 reserveA, uint256 reserveB) {
        (address t0, address t1) = _sort(tokenA, tokenB);
        Pool storage p = _pools[t0][t1];
        (reserveA, reserveB) = tokenA == t0 ? (p.reserve0, p.reserve1) : (p.reserve1, p.reserve0);
    }

    /// @notice Output `swapExactIn` would return for `amountIn` right now (0 if no liquidity).
    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        (uint256 reserveIn, uint256 reserveOut) = getReserves(tokenIn, tokenOut);
        if (reserveIn == 0 || reserveOut == 0) return 0;
        return _amountOut(amountIn, reserveIn, reserveOut);
    }

    function _amountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) private pure returns (uint256) {
        uint256 amountInWithFee = amountIn * (BPS - FEE_BPS);
        return (amountInWithFee * reserveOut) / (reserveIn * BPS + amountInWithFee);
    }

    function _setReserves(address tokenA, address tokenB, uint256 reserveA, uint256 reserveB) private {
        (address t0, address t1) = _sort(tokenA, tokenB);
        Pool storage p = _pools[t0][t1];
        if (tokenA == t0) {
            (p.reserve0, p.reserve1) = (reserveA, reserveB);
        } else {
            (p.reserve0, p.reserve1) = (reserveB, reserveA);
        }
    }

    function _sort(address a, address b) private pure returns (address, address) {
        if (a == b) revert IdenticalTokens();
        if (a == address(0) || b == address(0)) revert ZeroAddress();
        return a < b ? (a, b) : (b, a);
    }
}
