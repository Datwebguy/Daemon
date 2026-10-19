// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The part of Pyth Entropy V2 that Daemon uses (signatures match @pythnetwork/entropy-sdk-solidity).
/// Monad testnet: 0x825c0390f379C631f3Cf11A82a37D20BddF93c07 (Pyth contract_manager store).
interface IEntropyV2 {
    /// @notice Requests a random number from the default provider; the callback may use up to `gasLimit` gas.
    function requestV2(uint32 gasLimit) external payable returns (uint64 assignedSequenceNumber);

    /// @notice Fee for a request with the given callback gas limit, from the default provider.
    function getFeeV2(uint32 gasLimit) external view returns (uint128 feeAmount);
}

/// @notice Callback Pyth Entropy calls on the requester (selector `_entropyCallback(uint64,address,bytes32)`).
interface IEntropyConsumerV2 {
    function _entropyCallback(uint64 sequence, address provider, bytes32 randomNumber) external;
}
