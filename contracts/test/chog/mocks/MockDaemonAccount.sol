// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDaemonAccount} from "../../../src/interfaces/IDaemonAccount.sol";

/// @notice Test-only Daemon account implementing the IDaemonAccount views MockChog reads, with setters and
/// per-function revert switches. Used as the ERC-6551 implementation behind registry-deployed proxies.
contract MockDaemonAccount {
    IDaemonAccount.Mood public mood;
    uint256 public boostBps = 10_000;
    uint256 public boostExpiresAt;
    uint256 public yieldTotal;
    string public message;

    bool public revertMood;
    bool public revertBoost;
    bool public revertYield;
    bool public revertMessage;

    error Nope();

    function setMood(IDaemonAccount.Mood m) external {
        mood = m;
    }

    function setBoost(uint256 bps, uint256 expiresAt) external {
        boostBps = bps;
        boostExpiresAt = expiresAt;
    }

    function setLifetimeYield(uint256 y) external {
        yieldTotal = y;
    }

    function setMessage(string calldata m) external {
        message = m;
    }

    function setReverts(bool m, bool b, bool y, bool msg_) external {
        revertMood = m;
        revertBoost = b;
        revertYield = y;
        revertMessage = msg_;
    }

    function getMood() external view returns (IDaemonAccount.Mood) {
        if (revertMood) revert Nope();
        return mood;
    }

    function getBoost() external view returns (uint256, uint256, uint256, uint256) {
        if (revertBoost) revert Nope();
        return (boostBps, boostExpiresAt, 1 ether, 0);
    }

    function lifetimeYield() external view returns (uint256) {
        if (revertYield) revert Nope();
        return yieldTotal;
    }

    function lastMessage() external view returns (string memory) {
        if (revertMessage) revert Nope();
        return message;
    }
}

/// @notice Test-only hostile account code, etched at a Daemon address. Mode is immutable so it survives vm.etch.
/// 0: always revert, 1: return malformed data, 2: burn all gas, 3: return a huge payload.
contract HostileDaemon {
    uint256 public immutable mode;

    constructor(uint256 mode_) {
        mode = mode_;
    }

    fallback() external {
        uint256 m = mode;
        assembly {
            if eq(m, 0) { revert(0, 0) }
            if eq(m, 1) {
                // word 0: absurd value (bad mood / bad string offset), word 1: absurd length
                mstore(0x00, not(0))
                mstore(0x20, not(0))
                return(0x00, 0x40)
            }
            if eq(m, 2) { for {} 1 {} {} }
            // mode 3: a valid ABI string header followed by ~40 KB of 'A' (mood 0x20 -> invalid too)
            mstore(0x00, 0x20)
            mstore(0x20, 40000)
            let end := add(0x40, 40000)
            for { let p := 0x40 } lt(p, end) { p := add(p, 0x20) } {
                mstore(p, 0x4141414141414141414141414141414141414141414141414141414141414141)
            }
            return(0x00, end)
        }
    }
}

/// @notice Test-only IChogTraits returning arbitrary (possibly out-of-range) traits.
contract TraitsStub {
    uint256 public vibe;

    function setVibe(uint256 v) external {
        vibe = v;
    }

    function traitsOf(uint256) external view returns (uint256, uint256, uint256, uint256) {
        return (0, 0, 0, vibe);
    }
}
