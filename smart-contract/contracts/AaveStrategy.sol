// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolDataProvider} from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";
import {IStrategy} from "./interfaces/IStrategy.sol";

contract AaveStrategy is IStrategy {
    IERC20 public immutable asset;
    IERC20 public immutable aToken;
    IPool public immutable lendingPool;
    IPoolDataProvider public immutable dataProvider;
    
    address public yieldOptimizer; // Not immutable - set after deployment
    bool public initialized;
    
    mapping(address => uint256) public userBalances;
    uint256 public totalManagedAssets;
    
    event Initialized(address indexed yieldOptimizer);
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event PositionCredited(address indexed user, uint256 amount);
    
    modifier onlyYieldOptimizer() {
        require(msg.sender == yieldOptimizer && initialized, "Only yield optimizer");
        _;
    }
    
    modifier onlyUninitialized() {
        require(!initialized, "Already initialized");
        _;
    }
    
    constructor(
        address _asset,
        address _aToken,
        address _lendingPool,
        address _dataProvider
    ) {
        asset = IERC20(_asset);
        aToken = IERC20(_aToken);
        lendingPool = IPool(_lendingPool);
        dataProvider = IPoolDataProvider(_dataProvider);
    }
    
    /**
     * @notice Initialize the strategy with yield optimizer address
     * @param _yieldOptimizer Address of the yield optimizer contract
     */
    function initialize(address _yieldOptimizer) external onlyUninitialized {
        require(_yieldOptimizer != address(0), "Invalid address");
        yieldOptimizer = _yieldOptimizer;
        initialized = true;
        emit Initialized(_yieldOptimizer);
    }
    
    function deposit(uint256 amount) external override onlyYieldOptimizer {
        require(amount > 0, "Invalid amount");
        
        // Transfer assets from yield optimizer
        asset.transferFrom(yieldOptimizer, address(this), amount);
        
        // Deposit to Aave
        asset.approve(address(lendingPool), amount);
        lendingPool.supply(address(asset), amount, address(this), 0);
        
        totalManagedAssets += amount;
        emit Deposited(amount);
    }
    
    function withdraw(uint256 amount) external override onlyYieldOptimizer {
        require(amount > 0, "Invalid amount");
        require(amount <= totalManagedAssets, "Insufficient balance");
        
        // Withdraw from Aave
        uint256 withdrawn = lendingPool.withdraw(address(asset), amount, address(this));
        
        // Transfer to yield optimizer
        asset.transfer(yieldOptimizer, withdrawn);
        
        totalManagedAssets -= withdrawn;
        emit Withdrawn(withdrawn);
    }
    
    function creditPosition(address user, uint256 amount) external override onlyYieldOptimizer {
        userBalances[user] += amount;
        totalManagedAssets += amount;
        emit PositionCredited(user, amount);
    }
    
    function getCurrentAPY() external view override returns (uint256) {
        bytes memory data = abi.encodeWithSelector(
            IPoolDataProvider.getReserveData.selector,
            address(asset)
        );
        
        (bool success, bytes memory result) = address(dataProvider).staticcall(data);
        require(success, "Failed to get reserve data");
        
        // Decode only the liquidityRate (4th return value)
        uint256 liquidityRate;
        assembly {
            // Skip first 3 values (32 bytes each) to get to liquidityRate
            liquidityRate := mload(add(result, 0x80)) // 0x20 + 0x60 = 0x80
        }
        
        return liquidityRate / 1e23;
    }
    
    function totalAssets() external view override returns (uint256) {
        return aToken.balanceOf(address(this));
    }
    
    function balanceOf(address user) external view override returns (uint256) {
        return userBalances[user];
    }
}