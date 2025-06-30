const { ethers, network } = require("hardhat");

// Network configurations
const NETWORK_CONFIG = {
  sepolia: {
    name: "ETHEREUM",
    enum: 0,
    chainSelector: "16015286601757825753",
    ccipRouter: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59", // Correct Ethereum Sepolia CCIP Router
    priceFeed: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", // USDC/USD Sepolia (8 decimals)
    asset: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // Correct USDC Sepolia
    aToken: "0x16dA4541aD1807f4443d92D26044C1147406EB80", // aUSDC Sepolia
    lendingPool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951", // Aave Pool Sepolia
    dataProvider: "0x3e9708d80f7B3e43118013075F7e95CE3AB31F31" // Aave Data Provider Sepolia
  },
  polygon: {
    name: "POLYGON", 
    enum: 2,
    chainSelector: "12532609583862916517",
    ccipRouter: "0x9C32fCB86BF0f4a1A8921a9Fe46de3198bb884B2", // Correct Polygon Mumbai CCIP Router
    priceFeed: "0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0", // USDC/USD Mumbai
    asset: "0x9999f7Fea5938fD3b1E26A12c3f2fb024e194f97", // USDC Mumbai (Circle's testnet USDC)
    aToken: "0x52D306e36E3B6B02c153d0266ff0f85d18BCD413", // aUSDC Mumbai
    lendingPool: "0x6C9fB0D5bD9429eb9Cd96B85B81d872281771E6B", // Aave Pool Mumbai
    dataProvider: "0x9440e7a8eE3b2Dda5A39cDC9f69a2D93b4eCaF86" // Aave Data Provider Mumbai
  },
  base: {
    name: "BASE",
    enum: 1, 
    chainSelector: "10344971235874465080",
    ccipRouter: "0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93", // Base Sepolia CCIP Router
    priceFeed: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165", // USDC/USD Base Sepolia
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC Base Sepolia
    aToken: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB", // aUSDC Base Sepolia
    lendingPool: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D", // Aave Pool Base Sepolia
    dataProvider: "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac" // Aave Data Provider Base Sepolia
  },
  avalanche: {
    name: "AVALANCHE",
    enum: 3,
    chainSelector: "14767482510784806043", 
    ccipRouter: "0xF694E193200268f9a4868e4Aa017A0118C9a8177", // Correct Avalanche Fuji CCIP Router
    priceFeed: "0x97FE42a7E96640D932bbc0e1580c73E705A8EB73", // USDC/USD Fuji
    asset: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // USDC Fuji
    aToken: "0x625E7708f30cA75bfd92586e17077590C60eb4cD", // aUSDC Fuji
    lendingPool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", // Aave Pool Fuji
    dataProvider: "0x3e9708d80f7B3e43118013075F7e95CE3AB31F31" // Aave Data Provider Fuji
  }
};

async function getNetworkConfig() {
  const networkName = network.name;
  console.log(`Deploying to network: ${networkName}`);
  
  const config = NETWORK_CONFIG[networkName];
  if (!config) {
    throw new Error(`Network ${networkName} not supported. Supported networks: ${Object.keys(NETWORK_CONFIG).join(', ')}`);
  }
  
  return config;
}

async function deployStrategy(config) {
  console.log("\n🚀 Deploying AaveStrategy...");
  
  const AaveStrategy = await ethers.getContractFactory("AaveStrategy");
  const strategy = await AaveStrategy.deploy(
    config.asset,
    config.aToken, 
    config.lendingPool,
    config.dataProvider
  );
  
  await strategy.waitForDeployment();
  const strategyAddress = await strategy.getAddress();
  
  console.log(`✅ AaveStrategy deployed to: ${strategyAddress}`);
  
  return strategy;
}

async function deployYieldOptimizer(config, strategyAddress) {
  console.log("\n🚀 Deploying CrossChainYieldOptimizer...");
  
  const CrossChainYieldOptimizer = await ethers.getContractFactory("CrossChainYieldOptimizer");
  const yieldOptimizer = await CrossChainYieldOptimizer.deploy(
    config.ccipRouter,
    config.enum,
    config.priceFeed,
    config.ccipRouter, // Using router as functionsOracle for now
    strategyAddress,
    config.asset
  );
  
  await yieldOptimizer.waitForDeployment();
  const optimizerAddress = await yieldOptimizer.getAddress();
  
  console.log(`✅ CrossChainYieldOptimizer deployed to: ${optimizerAddress}`);
  
  return yieldOptimizer;
}

async function initializeContracts(strategy, yieldOptimizer) {
  console.log("\n🔧 Initializing contracts...");
  
  const optimizerAddress = await yieldOptimizer.getAddress();
  
  // Initialize yield optimizer strategy
  console.log("⏳ Initializing yield optimizer strategy...");
  const initOptimizerTx = await yieldOptimizer.initializeStrategy();
  await initOptimizerTx.wait();
  console.log("✅ Yield optimizer strategy initialized");
}

async function saveDeploymentInfo(config, strategy, yieldOptimizer) {
  const fs = require('fs');
  const path = require('path');
  
  const deploymentInfo = {
    network: network.name,
    chainId: network.config.chainId,
    timestamp: new Date().toISOString(),
    contracts: {
      AaveStrategy: await strategy.getAddress(),
      CrossChainYieldOptimizer: await yieldOptimizer.getAddress()
    },
    config: config
  };
  
  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  
  const filePath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`📝 Deployment info saved to: ${filePath}`);
}

async function main() {
  console.log("🌟 Starting LinkYield Cross-Chain Yield Optimizer Deployment");
  console.log("================================================");
  
  // Get signers
  const [deployer] = await ethers.getSigners();
  console.log(`👤 Deploying with account: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Account balance: ${ethers.formatEther(balance)} ETH`);
  
  // Get network configuration
  const config = await getNetworkConfig();
  console.log(`🌐 Network: ${config.name} (Chain Selector: ${config.chainSelector})`);

  try {
    // Step 1: Deploy Strategy
    const strategy = await deployStrategy(config);
    
    // Step 2: Deploy Yield Optimizer
    const yieldOptimizer = await deployYieldOptimizer(config, await strategy.getAddress());
    
    // Step 3: Initialize contracts
    await initializeContracts(strategy, yieldOptimizer);
    
    // Step 4: Save deployment info
    await saveDeploymentInfo(config, strategy, yieldOptimizer);
    
    console.log("\n🎉 Deployment completed successfully!");
    console.log("================================================");
    console.log("📋 Deployment Summary:");
    console.log(`   Network: ${config.name}`);
    console.log(`   AaveStrategy: ${await strategy.getAddress()}`);
    console.log(`   CrossChainYieldOptimizer: ${await yieldOptimizer.getAddress()}`);
    console.log("================================================");
    
  } catch (error) {
    console.error("💥 Deployment failed:", error);
    process.exit(1);
  }
}

// Execute deployment
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main, NETWORK_CONFIG };