// Local testing setup for Cross-Chain Yield Optimizer
const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("CrossChainYieldOptimizer - Basic Tests", function() {
    let yieldOptimizer;
    let mockStrategy;
    let mockUSDC;
    let mockPriceFeed;
    let owner, user1, user2;
    
    beforeEach(async function() {
        [owner, user1, user2] = await ethers.getSigners();
        
        // Deploy mock contracts first
        await deployMockContracts();
        
        // Deploy main contract
        const YieldOptimizer = await ethers.getContractFactory("CrossChainYieldOptimizer");
        yieldOptimizer = await YieldOptimizer.deploy(
            '0x141fa059441E0ca23ce184B6A78bafD2A517DdE8', // Mock router for local testing
            0, // Network.ETHEREUM
            await mockPriceFeed.getAddress(),
            owner.address, // Mock functions oracle
            await mockStrategy.getAddress(),
            await mockUSDC.getAddress()
        );
    });
    
    async function deployMockContracts() {
        // Mock USDC Token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
        
        // Mock Strategy
        const MockStrategy = await ethers.getContractFactory("MockStrategy");
        mockStrategy = await MockStrategy.deploy();
        
        // Mock Price Feed
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockPriceFeed = await MockPriceFeed.deploy();
        
        // Mint test tokens
        await mockUSDC.mint(user1.address, ethers.parseUnits("10000", 6));
        await mockUSDC.mint(user2.address, ethers.parseUnits("5000", 6));
    }
    
    describe("Basic Functionality", function() {
        it("Should allow user deposit", async function() {
            const depositAmount = ethers.parseUnits("1000", 6);
            
            // Approve and deposit
            await mockUSDC.connect(user1).approve(await yieldOptimizer.getAddress(), depositAmount);
            await yieldOptimizer.connect(user1).deposit(depositAmount);
            
            // Check position
            const position = await yieldOptimizer.positions(user1.address);
            expect(position.collateral).to.equal(depositAmount);
            
            // Check user tracking
            expect(await yieldOptimizer.isUser(user1.address)).to.be.true;
        });
        
        it("Should update health factor correctly", async function() {
            // First deposit
            const depositAmount = ethers.parseUnits("1000", 6);
            await mockUSDC.connect(user1).approve(await yieldOptimizer.getAddress(), depositAmount);
            await yieldOptimizer.connect(user1).deposit(depositAmount);
            
            // Update health factor
            const newHealthFactor = ethers.parseEther("1.05"); // 1.05
            await yieldOptimizer.updateHealthFactor(user1.address, newHealthFactor);
            
            const position = await yieldOptimizer.positions(user1.address);
            expect(position.lastHealthFactor).to.equal(newHealthFactor);
            expect(position.needsRebalance).to.be.true; // Below 1.1 threshold
        });
        
        it("Should check upkeep correctly", async function() {
            // Setup user with rebalance needed
            const depositAmount = ethers.parseUnits("1000", 6);
            await mockUSDC.connect(user1).approve(await yieldOptimizer.getAddress(), depositAmount);
            await yieldOptimizer.connect(user1).deposit(depositAmount);
            
            // Set low health factor
            await yieldOptimizer.updateHealthFactor(user1.address, ethers.parseEther("1.05"));
            
            const [upkeepNeeded, performData] = await yieldOptimizer.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;
            
            // Decode perform data
            const [userAddress] = ethers.AbiCoder.defaultAbiCoder().decode(["address"], performData);
            expect(userAddress).to.equal(user1.address);
        });
    });
    
    describe("Edge Cases", function() {
        it("Should handle zero deposits", async function() {
            await expect(
                yieldOptimizer.connect(user1).deposit(0)
            ).to.be.revertedWith("Amount must be greater than 0");
        });
        
        it("Should handle insufficient allowance", async function() {
            const depositAmount = ethers.parseUnits("1000", 6);
            
            await expect(
                yieldOptimizer.connect(user1).deposit(depositAmount)
            ).to.be.revertedWith("ERC20: insufficient allowance");
        });
        
        it("Should only allow functions oracle to update health factor", async function() {
            const newHealthFactor = ethers.parseEther("1.5");
            
            await expect(
                yieldOptimizer.connect(user1).updateHealthFactor(user1.address, newHealthFactor)
            ).to.be.revertedWith("Not authorized");
        });
    });
});

// Mock contract implementations
const mockContracts = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;
    
    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }
    
    function decimals() public view override returns (uint8) {
        return _decimals;
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockStrategy {
    mapping(address => uint256) public balances;
    uint256 public totalDeposited;
    
    function deposit(uint256 amount) external returns (uint256) {
        totalDeposited += amount;
        return amount;
    }
    
    function withdraw(uint256 amount) external returns (uint256) {
        require(totalDeposited >= amount, "Insufficient balance");
        totalDeposited -= amount;
        return amount;
    }
    
    function creditPosition(address user, uint256 amount) external {
        balances[user] += amount;
    }
    
    function getAPY() external pure returns (uint256) {
        return 5e16; // 5% APY
    }
    
    function totalValueLocked() external view returns (uint256) {
        return totalDeposited;
    }
    
    function getUserBalance(address user) external view returns (uint256) {
        return balances[user];
    }
}

contract MockPriceFeed {
    int256 private price = 100000000; // $1.00 with 8 decimals
    
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, price, block.timestamp, block.timestamp, 1);
    }
    
    function setPrice(int256 _price) external {
        price = _price;
    }
}
`;

module.exports = { mockContracts };