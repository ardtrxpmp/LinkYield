// Sepolia testnet integration testing
require("dotenv").config();
const { ethers } = require("hardhat");

// Sepolia testnet addresses
const SEPOLIA_ADDRESSES = {
    USDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // USDC on Sepolia
    CCIP_ROUTER: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59", // Sepolia CCIP Router
    LINK_TOKEN: "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5", // LINK on Sepolia
    PRICE_FEED: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // ETH/USD on Sepolia
    FUNCTIONS_ROUTER: "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0", // Functions Router
    // Aave V3 Sepolia addresses
    AAVE_POOL: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
    AAVE_DATA_PROVIDER: "0x927F584d4321C1dCcBf5e2902368124b02419a1E",
    AUSDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8" // aUSDC on Sepolia
};

async function testSepoliaDeployment() {
    console.log("🧪 Testing on Sepolia Testnet...");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
    
    let strategy, yieldOptimizer;
    
    try {
        // Step 1: Deploy Strategy Contract (AaveStrategy or MockStrategy)
        console.log("\n📦 Deploying Strategy Contract...");
        
        // Try to deploy AaveStrategy first, fallback to MockStrategy
        try {
            console.log("Attempting to deploy AaveStrategy...");
            const AaveStrategy = await ethers.getContractFactory("AaveStrategy");
            strategy = await AaveStrategy.deploy(
                SEPOLIA_ADDRESSES.USDC,
                SEPOLIA_ADDRESSES.AUSDC,
                SEPOLIA_ADDRESSES.AAVE_POOL,
                SEPOLIA_ADDRESSES.AAVE_DATA_PROVIDER
            );
            await strategy.waitForDeployment();
            console.log("✅ AaveStrategy deployed at:", await strategy.getAddress());
        } catch (aaveError) {
            console.log("⚠️ AaveStrategy deployment failed, using MockStrategy...");
            console.log("Error:", aaveError.message);
            
            const MockStrategy = await ethers.getContractFactory("MockStrategy");
            strategy = await MockStrategy.deploy();
            await strategy.waitForDeployment();
            console.log("✅ MockStrategy deployed at:", await strategy.getAddress());
        }
        
        // Step 2: Deploy Main Contract
        console.log("\n📦 Deploying CrossChainYieldOptimizer...");
        const YieldOptimizer = await ethers.getContractFactory("CrossChainYieldOptimizer");
        yieldOptimizer = await YieldOptimizer.deploy(
            SEPOLIA_ADDRESSES.CCIP_ROUTER,
            0, // Network.ETHEREUM
            SEPOLIA_ADDRESSES.PRICE_FEED,
            deployer.address, // Temporary functions oracle (use your address)
            await strategy.getAddress(),
            SEPOLIA_ADDRESSES.USDC
        );
        await yieldOptimizer.waitForDeployment();
        console.log("✅ YieldOptimizer deployed at:", await yieldOptimizer.getAddress());
        
        // Step 3: Initialize Contracts (CRITICAL STEP)
        console.log("\n🔧 Initializing Contracts...");
        
        // Initialize Strategy with YieldOptimizer address
        console.log("Initializing strategy...");
        const strategyInitTx = await strategy.initialize(await yieldOptimizer.getAddress());
        await strategyInitTx.wait();
        console.log("✅ Strategy initialized:", strategyInitTx.hash);
        
        // Verify strategy initialization
        const isStrategyInitialized = await strategy.initialized();
        const strategyOptimizer = await strategy.yieldOptimizer();
        console.log("Strategy initialized:", isStrategyInitialized);
        console.log("Strategy's yield optimizer:", strategyOptimizer);
    
        
        console.log("\n✅ All contracts deployed and initialized successfully!");
        
    } catch (deploymentError) {
        console.error("❌ Deployment failed:", deploymentError);
        throw deploymentError;
    }
    
    // Step 4: Basic Contract Interaction Tests
    console.log("\n🔍 Testing contract interactions...");
    
    // Test 1: Check initial state
    const currentNetwork = await yieldOptimizer.currentNetwork();
    console.log("Current network:", currentNetwork.toString());
    
    // Test 2: Strategy Integration Test
    console.log("\n🔗 Testing strategy integration...");
    try {
        const strategyAddress = await yieldOptimizer.yieldStrategy();
        const strategyAsset = await yieldOptimizer.asset();
        console.log("Strategy address in optimizer:", strategyAddress);
        console.log("Asset address:", strategyAsset);
        
        // Test strategy APY call
        try {
            const apy = await strategy.getCurrentAPY();
            console.log("Strategy APY:", apy.toString(), "basis points");
        } catch (apyError) {
            console.log("⚠️ APY call failed:", apyError.message);
        }
    } catch (integrationError) {
        console.log("❌ Strategy integration test failed:", integrationError.message);
    }
    
    // Test 3: USDC Balance and Deposit Test
    console.log("\n💰 Testing USDC interactions...");
    try {
        const usdc = await ethers.getContractAt("IERC20", SEPOLIA_ADDRESSES.USDC);
        const balance = await usdc.balanceOf(deployer.address);
        console.log("USDC balance:", ethers.formatUnits(balance, 6));
        
        if (balance > 0) {
            // Test deposit functionality
            console.log("Testing deposit...");
            const depositAmount = ethers.parseUnits("1", 6); // 1 USDC
            
            // Check allowance first
            const currentAllowance = await usdc.allowance(deployer.address, await yieldOptimizer.getAddress());
            console.log("Current allowance:", ethers.formatUnits(currentAllowance, 6));
            
            if (currentAllowance < depositAmount) {
                const approveTx = await usdc.approve(await yieldOptimizer.getAddress(), depositAmount);
                await approveTx.wait();
                console.log("✅ USDC approved:", approveTx.hash);
            }
            
            const depositTx = await yieldOptimizer.deposit(depositAmount);
            await depositTx.wait();
            console.log("✅ Deposit successful:", depositTx.hash);
            
            // Check position
            const position = await yieldOptimizer.positions(deployer.address);
            console.log("Position collateral:", ethers.formatUnits(position.collateral, 6));
            
            // Check if user was added
            const isUser = await yieldOptimizer.isUser(deployer.address);
            console.log("User registered:", isUser);
            
        } else {
            console.log("⚠️ No USDC balance. Get testnet USDC from faucet to test deposits");
        }
    } catch (error) {
        console.log("❌ USDC test failed:", error.message);
    }
    
    // Test 4: Health Factor Update
    console.log("\n🏥 Testing health factor update...");
    try {
        const healthFactor = ethers.parseEther("1.05"); // 1.05 (triggers rebalance)
        const tx = await yieldOptimizer.updateHealthFactor(deployer.address, healthFactor);
        await tx.wait();
        console.log("✅ Health factor updated:", tx.hash);
        
        const position = await yieldOptimizer.positions(deployer.address);
        console.log("Health factor:", ethers.formatEther(position.lastHealthFactor));
        console.log("Needs rebalance:", position.needsRebalance);
    } catch (error) {
        console.log("❌ Health factor update failed:", error.message);
    }
    
    // Test 5: Automation Check
    console.log("\n🤖 Testing automation...");
    try {
        const [upkeepNeeded, performData] = await yieldOptimizer.checkUpkeep("0x");
        console.log("Upkeep needed:", upkeepNeeded);
        if (upkeepNeeded && performData !== "0x") {
            const [userAddress] = ethers.AbiCoder.defaultAbiCoder().decode(["address"], performData);
            console.log("User needing rebalance:", userAddress);
        }
    } catch (error) {
        console.log("❌ Automation check failed:", error.message);
    }
    
    // Test 6: Price Feed
    console.log("\n💲 Testing price feed...");
    try {
        const priceFeed = await ethers.getContractAt("AggregatorV3Interface", SEPOLIA_ADDRESSES.PRICE_FEED);
        const [, price, , ,] = await priceFeed.latestRoundData();
        console.log("ETH/USD Price:", ethers.formatUnits(price, 8));
    } catch (error) {
        console.log("❌ Price feed test failed:", error.message);
    }
    
    return {
        yieldOptimizer: await yieldOptimizer.getAddress(),
        strategy: await strategy.getAddress()
    };
}

// Enhanced gas usage analysis
async function analyzeGasUsage(yieldOptimizerAddress, strategyAddress) {
    console.log("\n⛽ Analyzing gas usage...");
    
    const yieldOptimizer = await ethers.getContractAt("CrossChainYieldOptimizer", yieldOptimizerAddress);
    const strategy = await ethers.getContractAt("IStrategy", strategyAddress);
    
    // Estimate gas for key functions
    const estimates = {};
    
    try {
        estimates.deposit = await yieldOptimizer.deposit.estimateGas(ethers.parseUnits("100", 6));
    } catch (e) { estimates.deposit = "N/A"; }
    
    try {
        estimates.updateHealthFactor = await yieldOptimizer.updateHealthFactor.estimateGas(
            ethers.ZeroAddress, 
            ethers.parseEther("1.5")
        );
    } catch (e) { estimates.updateHealthFactor = "N/A"; }
    
    try {
        estimates.checkUpkeep = await yieldOptimizer.checkUpkeep.estimateGas("0x");
    } catch (e) { estimates.checkUpkeep = "N/A"; }
    
    try {
        estimates.initializeStrategy = await yieldOptimizer.initializeStrategy.estimateGas();
    } catch (e) { estimates.initializeStrategy = "N/A"; }
    
    console.log("Gas estimates:");
    Object.entries(estimates).forEach(([func, gas]) => {
        console.log(`  ${func}: ${gas.toString()} gas`);
    });
}

// Test initialization edge cases
async function testInitializationEdgeCases(contracts) {
    console.log("\n🧪 Testing initialization edge cases...");
    
    const strategy = await ethers.getContractAt("IStrategy", contracts.strategy);
    const yieldOptimizer = await ethers.getContractAt("CrossChainYieldOptimizer", contracts.yieldOptimizer);
    
    // Test 1: Try to initialize again (should fail)
    try {
        await strategy.initialize(contracts.yieldOptimizer);
        console.log("❌ ERROR: Strategy allowed double initialization!");
    } catch (error) {
        console.log("✅ Strategy correctly prevents double initialization");
    }
    
    // Test 2: Try to initialize yield optimizer again (should fail)
    try {
        await yieldOptimizer.initializeStrategy();
        console.log("❌ ERROR: YieldOptimizer allowed double initialization!");
    } catch (error) {
        console.log("✅ YieldOptimizer correctly prevents double initialization");
    }
    
    // Test 3: Check initialization states
    const strategyInitialized = await strategy.initialized();
    const optimizerInitialized = await yieldOptimizer.initialized();
    
    console.log("Strategy initialized state:", strategyInitialized);
    console.log("YieldOptimizer initialized state:", optimizerInitialized);
}

// Chainlink Functions test preparation (unchanged)
async function prepareChainlinkFunctions() {
    console.log("\n🔗 Preparing Chainlink Functions test...");
    
    const functionsSource = `
        const userAddress = args[0] || "0x0000000000000000000000000000000000000000";
        const collateral = parseFloat(args[1]) || 1000;
        const debt = parseFloat(args[2]) || 500;
        
        const healthFactor = debt > 0 ? (collateral * 0.8) / debt : 999;
        const needsRebalance = healthFactor < 1.1;
        
        const result = {
            user_address: userAddress,
            health_factor: healthFactor,
            needs_rebalance: needsRebalance,
            optimal_chain: "ethereum",
            timestamp: Math.floor(Date.now() / 1000)
        };
        
        return Functions.encodeString(JSON.stringify(result));
    `;
    
    console.log("Functions source code prepared. Length:", functionsSource.length);
    return functionsSource;
}

async function main() {
    try {
        console.log("🚀 Starting Enhanced Sepolia Integration Test");
        console.log("=" .repeat(50));
        
        // Test deployment with initialization
        const contracts = await testSepoliaDeployment();
        
        // Test initialization edge cases
        await testInitializationEdgeCases(contracts);
        
        // Analyze gas usage
        await analyzeGasUsage(contracts.yieldOptimizer, contracts.strategy);
        
        // Prepare Chainlink Functions
        await prepareChainlinkFunctions();
        
        console.log("\n✅ Enhanced Sepolia testing completed!");
        console.log("=" .repeat(50));
        console.log("📋 Contract Addresses:");
        console.log("YieldOptimizer:", contracts.yieldOptimizer);
        console.log("Strategy:", contracts.strategy);
        
        console.log("\n🚀 Next Steps:");
        console.log("1. Get testnet USDC from faucet: https://faucet.circle.com/");
        console.log("2. Set up Chainlink Functions subscription");
        console.log("3. Register for Chainlink Automation");
        console.log("4. Test cross-chain functionality on multiple testnets");
        console.log("5. Monitor contract interactions on Sepolia explorer");
        
    } catch (error) {
        console.error("❌ Enhanced Sepolia testing failed:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { 
    testSepoliaDeployment, 
    analyzeGasUsage, 
    prepareChainlinkFunctions,
    testInitializationEdgeCases,
    SEPOLIA_ADDRESSES
};