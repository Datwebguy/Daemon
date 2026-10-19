// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC6551Registry} from "../../src/vendor/ERC6551Registry.sol";
import {IERC6551Registry} from "../../src/interfaces/IERC6551.sol";
import {IStrategyRegistry} from "../../src/interfaces/IStrategyRegistry.sol";
import {DaemonAccount} from "../../src/account/DaemonAccount.sol";
import {AToken, AWMON, ANFT, AOracle, ARouter, ASource, AStrategyRegistry, ATraitPolicy} from "./mocks/AccountMocks.sol";

/// @dev Shared fixture: canonical registry etched, tokens, oracle/router at fair prices, one source, one Daemon.
abstract contract DaemonBase is Test {
    address internal constant CANONICAL_REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    uint256 internal constant CAP = 10_000e18;

    IERC6551Registry internal reg6551;
    AStrategyRegistry internal strategy;
    DaemonAccount internal impl;
    AToken internal asset;
    AToken internal reward;
    AToken internal chog;
    AWMON internal wmon;
    ANFT internal nft;
    AOracle internal oracle;
    ARouter internal router;
    ASource internal sourceA;
    ATraitPolicy internal policy;

    uint256 internal alicePk = 0xA11CE;
    address internal alice;
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal keeper = makeAddr("keeper");

    DaemonAccount internal acct;

    function setUp() public virtual {
        alice = vm.addr(alicePk);
        vm.warp(1_700_000_000);

        ERC6551Registry port = new ERC6551Registry();
        vm.etch(CANONICAL_REGISTRY, address(port).code);
        reg6551 = IERC6551Registry(CANONICAL_REGISTRY);

        asset = new AToken("Daemon USD", "dUSD");
        reward = new AToken("Daemon Reward", "DMNR");
        chog = new AToken("Chog", "CHOG");
        wmon = new AWMON();
        nft = new ANFT();
        oracle = new AOracle();
        router = new ARouter();
        policy = new ATraitPolicy();

        _setPair(address(reward), 2e18); // 1 DMNR = 2 dUSD
        _setPair(address(wmon), 3e18); // 1 MON = 3 dUSD
        _setPair(address(chog), 0.5e18); // 1 CHOG = 0.5 dUSD

        strategy = new AStrategyRegistry();
        strategy.setConfig(_defaultConfig());
        sourceA = new ASource(address(asset), address(reward));
        strategy.approve(address(sourceA), CAP);

        impl = new DaemonAccount(address(strategy));
        nft.mint(alice, 1);
        acct = _createAccount(1);

        asset.mint(address(acct), 1_000e18);
        vm.prank(alice);
        acct.allocate(address(sourceA), 1_000e18);
    }

    function _defaultConfig() internal view returns (IStrategyRegistry.Config memory c) {
        c.asset = address(asset);
        c.wmon = address(wmon);
        c.chog = address(chog);
        c.router = address(router);
        c.oracle = address(oracle);
        c.traitPolicy = address(0);
        c.compoundCooldown = 1 hours;
        c.bountyStartBps = 500;
        c.bountyMaxBps = 1000;
        c.bountyRampSeconds = 1 hours;
        c.maxSlippageBps = 100;
        c.gasReimbursementCap = 1e18;
        c.boostDuration = 3 hours;
        c.boostStepBps = 500;
        c.maxBoostBps = 2500;
        c.hypeCooldownPerUser = 4 hours;
        c.hypeCooldownPerDaemon = 10 minutes;
        c.minHypeMon = 0.01 ether;
        c.minHypeChog = 10e18;
        c.neglectAfter = 3 days;
    }

    function _setPair(address token, uint256 price) internal {
        oracle.setPrice(token, address(asset), price);
        router.setRate(token, address(asset), price);
    }

    function _createAccount(uint256 tokenId) internal returns (DaemonAccount) {
        return DaemonAccount(
            payable(reg6551.createAccount(address(impl), bytes32(0), block.chainid, address(nft), tokenId))
        );
    }

    function _updateConfig(function(IStrategyRegistry.Config memory) internal pure f) internal {
        IStrategyRegistry.Config memory c = strategy.config();
        f(c);
        strategy.setConfig(c);
    }

    /// @dev Warps to the moment compound becomes possible.
    function _warpReady() internal {
        vm.warp(acct.nextCompoundAt());
    }

    /// @dev Sets pending rewards for the fixture account on sourceA.
    function _pend(uint256 rewardAmount) internal {
        sourceA.setPending(address(acct), rewardAmount);
    }

    function _hype(address who, uint256 amount) internal {
        vm.deal(who, amount);
        vm.prank(who);
        acct.hype{value: amount}();
    }
}
