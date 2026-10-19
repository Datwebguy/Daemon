// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IYieldSource} from "../../../src/interfaces/IYieldSource.sol";
import {IDaemonRouter, IPriceOracle, IWMON} from "../../../src/interfaces/IDaemonRouter.sol";
import {IStrategyRegistry} from "../../../src/interfaces/IStrategyRegistry.sol";
import {ITraitPolicy} from "../../../src/interfaces/IChog.sol";
import {IDaemonAccount} from "../../../src/interfaces/IDaemonAccount.sol";

/// @dev Mintable ERC20 for tests.
contract AToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev WETH9-style wrapped MON.
contract AWMON is ERC20, IWMON {
    constructor() ERC20("Wrapped MON", "WMON") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "send");
    }

    function mint(address to, uint256 amount) external payable {
        _mint(to, amount);
    }
}

/// @dev Plain ERC721 (the "Chog").
contract ANFT is ERC721 {
    constructor() ERC721("Chog", "CHOG") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

/// @dev Oracle with fixed 1e18-scaled prices per pair.
contract AOracle is IPriceOracle {
    mapping(address => mapping(address => uint256)) public price;

    function setPrice(address tokenIn, address tokenOut, uint256 p) external {
        price[tokenIn][tokenOut] = p;
    }

    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        return (amountIn * price[tokenIn][tokenOut]) / 1e18;
    }
}

/// @dev Router that pulls tokenIn and mints tokenOut at a configurable rate.
contract ARouter is IDaemonRouter {
    mapping(address => mapping(address => uint256)) public rate;
    bool public ignoreMinOut;
    address public reenterTarget;

    function setRate(address tokenIn, address tokenOut, uint256 r) external {
        rate[tokenIn][tokenOut] = r;
    }

    function setIgnoreMinOut(bool v) external {
        ignoreMinOut = v;
    }

    function setReenter(address target) external {
        reenterTarget = target;
    }

    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to)
        external
        returns (uint256 amountOut)
    {
        if (reenterTarget != address(0)) IDaemonAccount(reenterTarget).compound(address(this));
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        amountOut = (amountIn * rate[tokenIn][tokenOut]) / 1e18;
        if (!ignoreMinOut) require(amountOut >= minAmountOut, "MIN_OUT");
        AToken(tokenOut).mint(to, amountOut);
    }
}

/// @dev 1:1 share vault with a test-controlled reward stream.
contract ASource is IYieldSource {
    address public immutable asset;
    address public immutable rewardToken;
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) internal _pending;
    bool public claimReverts;
    bool public redeemReverts;
    address public reenterTarget;
    uint8 public reenterMode; // 1 = compound, 2 = hype

    constructor(address asset_, address rewardToken_) {
        asset = asset_;
        rewardToken = rewardToken_;
    }

    function setPending(address account, uint256 amount) external {
        _pending[account] = amount;
    }

    function setClaimReverts(bool v) external {
        claimReverts = v;
    }

    function setRedeemReverts(bool v) external {
        redeemReverts = v;
    }

    function setReenter(address target, uint8 mode) external {
        reenterTarget = target;
        reenterMode = mode;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256) {
        IERC20(asset).transferFrom(msg.sender, address(this), assets);
        balanceOf[receiver] += assets;
        return assets;
    }

    function redeem(uint256 shares, address receiver, address owner_) external returns (uint256) {
        require(!redeemReverts, "REDEEM_BROKEN");
        require(msg.sender == owner_, "owner");
        balanceOf[owner_] -= shares;
        IERC20(asset).transfer(receiver, shares);
        return shares;
    }

    function convertToAssets(uint256 shares) external pure returns (uint256) {
        return shares;
    }

    function pendingRewards(address account) external view returns (uint256) {
        return _pending[account];
    }

    function claimRewards(address to) external returns (uint256 amount) {
        require(!claimReverts, "CLAIM_BROKEN");
        if (reenterTarget != address(0)) {
            if (reenterMode == 1) IDaemonAccount(reenterTarget).compound(address(this));
            else IDaemonAccount(reenterTarget).hype{value: 0}();
        }
        amount = _pending[msg.sender];
        _pending[msg.sender] = 0;
        if (amount != 0) AToken(rewardToken).mint(to, amount);
    }

    function riskLabel() external pure returns (string memory) {
        return "Stable";
    }
}

/// @dev Strategy registry with a settable config.
contract AStrategyRegistry is IStrategyRegistry {
    Config internal _config;
    mapping(address => bool) public isApproved;
    mapping(address => uint256) public capPerAccount;
    address[] internal _sources;

    function setConfig(Config memory c) external {
        _config = c;
    }

    function config() external view returns (Config memory) {
        return _config;
    }

    function approve(address source, uint256 cap) external {
        if (!isApproved[source]) _sources.push(source);
        isApproved[source] = true;
        capPerAccount[source] = cap;
    }

    function sources() external view returns (address[] memory) {
        return _sources;
    }

    function timelockDelay() external pure returns (uint256) {
        return 0;
    }

    function queueSource(address, uint256) external pure {}

    function activateSource(address) external pure {}
}

/// @dev Trait policy with a fixed bias.
contract ATraitPolicy is ITraitPolicy {
    uint8 public bias;

    function setBias(uint8 b) external {
        bias = b;
    }

    function moodBias(address, uint256) external view returns (uint8) {
        return bias;
    }
}
