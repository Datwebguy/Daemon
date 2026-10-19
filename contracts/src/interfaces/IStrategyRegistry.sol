// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Platform-wide, immutable configuration plus the list of approved yield sources.
/// There is no admin over user funds. The only privileged action is adding a source, behind a timelock.
/// Sources can never be removed, so an owner's exit is never blocked.
interface IStrategyRegistry {
    struct Config {
        // tokens and infra
        address asset; // base asset every source accepts (testnet: dUSD mock stablecoin)
        address wmon; // wrapped MON
        address chog; // $CHOG token (testnet: mock)
        address router; // IDaemonRouter
        address oracle; // IPriceOracle
        address traitPolicy; // ITraitPolicy
        // compounding
        uint32 compoundCooldown; // min seconds between compounds of one Daemon
        uint16 bountyStartBps; // caller share of profit right after cooldown (e.g. 500 = 5%)
        uint16 bountyMaxBps; // cap on caller share (e.g. 1000 = 10%)
        uint32 bountyRampSeconds; // seconds after cooldown for share to rise from start to max
        uint16 maxSlippageBps; // allowed shortfall vs oracle quote on swaps (e.g. 100 = 1%)
        uint256 gasReimbursementCap; // max gas reimbursement per compound, in asset units
        // hype / boost
        uint32 boostDuration; // seconds a boost lasts (2-4h)
        uint16 boostStepBps; // multiplier added per hype (e.g. 500 = +0.05x)
        uint16 maxBoostBps; // max total multiplier above 1x (e.g. 2500 = 1.25x)
        uint32 hypeCooldownPerUser; // seconds before the same address can hype the same Daemon again
        uint32 hypeCooldownPerDaemon; // seconds between any two hypes of one Daemon
        uint256 minHypeMon; // minimum MON per hype
        uint256 minHypeChog; // minimum $CHOG per hype
        // mood
        uint32 neglectAfter; // seconds without compound or hype before mood decays to Tired
    }

    event SourceQueued(address indexed source, uint256 capPerAccount, uint256 eta);
    event SourceActivated(address indexed source, uint256 capPerAccount);

    function config() external view returns (Config memory);

    function isApproved(address source) external view returns (bool);
    /// @notice Max assets one Daemon may hold in `source`.
    function capPerAccount(address source) external view returns (uint256);
    function sources() external view returns (address[] memory);

    function timelockDelay() external view returns (uint256);
    function queueSource(address source, uint256 capPerAccount) external;
    function activateSource(address source) external;
}
