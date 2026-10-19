// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDaemonAccount} from "./interfaces/IDaemonAccount.sol";
import {IERC6551Registry} from "./interfaces/IERC6551.sol";

/// @title DaemonHub
/// @notice Stateless batching helper. Compounds many Daemons in one transaction; every bounty is paid by each
///         account directly to the hub caller. The hub never holds funds and has no owner.
/// @dev Monad charges the gas LIMIT: callers should simulate and set a tight limit. Batches are capped at
///      MAX_BATCH to keep worst-case gas bounded.
contract DaemonHub {
    /// @notice Salt used for every Daemon account created through the canonical registry.
    bytes32 public constant SALT = bytes32(0);
    /// @notice Maximum accounts per `compoundMany` / `pendingBounties` call.
    uint256 public constant MAX_BATCH = 50;

    /// @notice Outcome of one compound attempt.
    struct Result {
        address account;
        bool success;
        uint256 profit;
        uint256 bounty;
    }

    /// @notice Emitted once per batch with totals.
    event BatchCompounded(address indexed caller, uint256 attempted, uint256 succeeded, uint256 totalBounty);

    error BatchTooLarge(uint256 length, uint256 max);

    /// @notice Calls `compound(msg.sender)` on each account; a failing account does not revert the batch.
    /// @param accounts Daemon accounts to compound
    /// @return results per-account outcome, in input order
    function compoundMany(address[] calldata accounts) external returns (Result[] memory results) {
        uint256 n = accounts.length;
        if (n > MAX_BATCH) revert BatchTooLarge(n, MAX_BATCH);
        results = new Result[](n);
        uint256 succeeded;
        uint256 totalBounty;
        for (uint256 i; i < n; ++i) {
            address a = accounts[i];
            results[i].account = a;
            if (a.code.length == 0) continue;
            try IDaemonAccount(a).compound(msg.sender) returns (uint256 profit, uint256 bounty) {
                results[i].success = true;
                results[i].profit = profit;
                results[i].bounty = bounty;
                ++succeeded;
                totalBounty += bounty;
            } catch {}
        }
        emit BatchCompounded(msg.sender, n, succeeded, totalBounty);
    }

    /// @notice Address of the Daemon account for an NFT (salt = SALT).
    /// @param registry6551 ERC-6551 registry (canonical: 0x000000006551c19487814612e58FE06813775758)
    /// @param implementation DaemonAccount implementation
    /// @param chainId chain of the NFT
    /// @param tokenContract NFT contract
    /// @param tokenId NFT id
    function accountOf(
        address registry6551,
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address) {
        return IERC6551Registry(registry6551).account(implementation, SALT, chainId, tokenContract, tokenId);
    }

    /// @notice Bounty each account would pay right now (0 for accounts that would revert or are not Daemons).
    /// @param accounts Daemon accounts
    function pendingBounties(address[] calldata accounts) external view returns (uint256[] memory bounties) {
        uint256 n = accounts.length;
        if (n > MAX_BATCH) revert BatchTooLarge(n, MAX_BATCH);
        bounties = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            if (accounts[i].code.length == 0) continue;
            try IDaemonAccount(accounts[i]).pendingBounty() returns (uint256 b) {
                bounties[i] = b;
            } catch {}
        }
    }
}
