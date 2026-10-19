// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntropyV2, IEntropyConsumerV2} from "../../../src/interfaces/IEntropyV2.sol";

/// @dev Asynchronous like the real Entropy: a request is stored and answered later by `reveal`.
contract MockEntropyV2 is IEntropyV2 {
    uint128 public fee = 0.1 ether;
    uint64 public nextSequence = 1;
    mapping(uint64 => address) public requester;
    mapping(uint64 => uint32) public gasLimitOf;

    function setFee(uint128 f) external {
        fee = f;
    }

    function getFeeV2(uint32) external view returns (uint128) {
        return fee;
    }

    function requestV2(uint32 gasLimit) external payable returns (uint64 seq) {
        require(msg.value >= fee, "fee");
        seq = nextSequence++;
        requester[seq] = msg.sender;
        gasLimitOf[seq] = gasLimit;
    }

    /// @dev Delivers `randomNumber` with the gas the requester asked for, as the real provider does.
    function reveal(uint64 seq, bytes32 randomNumber) external {
        IEntropyConsumerV2(requester[seq])._entropyCallback{gas: gasLimitOf[seq]}(seq, address(this), randomNumber);
    }
}
