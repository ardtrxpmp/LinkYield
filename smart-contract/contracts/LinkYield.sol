// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IStrategy.sol";

contract CrossChainYieldOptimizer is CCIPReceiver, AutomationCompatibleInterface {
    // Chainlink services
    AggregatorV3Interface public priceFeed;
    address public functionsOracle;
    IRouterClient private ccipRouter;
    
    address public yieldStrategy;
    address public asset;
    
    address[] public users;
    mapping(address => bool) public isUser;
    
    enum Network { ETHEREUM, BASE, POLYGON, AVALANCHE }
    Network public currentNetwork;
    
    // User positions
    struct Position {
        uint256 collateral;
        uint256 debt;
        uint256 lastHealthFactor;
        bool needsRebalance;
    }
    mapping(address => Position) public positions;
    
    // CCIP config
    mapping(Network => uint64) public chainSelectors;
    
    // Events
    event Deposited(address indexed user, uint256 amount, Network network);
    event RebalanceInitiated(address indexed user, Network from, Network to);
    event HealthFactorUpdated(address indexed user, uint256 newHealthFactor);
    
    bool public initialized;
    
    constructor(
        address _router,
        Network _network,
        address _priceFeed,
        address _functionsOracle,
        address _yieldStrategy,
        address _asset
    ) CCIPReceiver(_router) {
        ccipRouter = IRouterClient(_router);
        currentNetwork = _network;
        priceFeed = AggregatorV3Interface(_priceFeed);
        functionsOracle = _functionsOracle;
        yieldStrategy = _yieldStrategy;
        asset = _asset;
        
        // Initialize chain selectors
        chainSelectors[Network.ETHEREUM] = 16015286601757825753;
        chainSelectors[Network.BASE] = 10344971235874465080;
        chainSelectors[Network.POLYGON] = 12532609583862916517;
        chainSelectors[Network.AVALANCHE] = 14767482510784806043;
    }
    
    /**
     * @notice Initialize the strategy contract with this contract's address
     * @dev Must be called after deployment
     */
    function initializeStrategy() external {
        require(!initialized, "Already initialized");
        IStrategy(yieldStrategy).initialize(address(this));
        initialized = true;
    }
    
    // ========== USER FUNCTIONS ==========
    function deposit(uint256 amount) external {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        require(amount > 0, "Amount must be greater than 0");
        
        // Execute deposit strategy
        IStrategy(yieldStrategy).deposit(amount);
        
        // Update position and track user
        Position storage position = positions[msg.sender];
        position.collateral += amount;
        
        if (!isUser[msg.sender]) {
            users.push(msg.sender);
            isUser[msg.sender] = true;
        }
        
        emit Deposited(msg.sender, amount, currentNetwork);
    }
    
    // ========== CROSS-CHAIN REBALANCING ==========
    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        (address user, uint256 amount, Network targetNetwork) = 
            abi.decode(message.data, (address, uint256, Network));
        
        require(targetNetwork == currentNetwork, "Invalid target network");
        
        // Execute strategy on receiving chain
        IStrategy(yieldStrategy).creditPosition(user, amount);
        positions[user].collateral += amount;
        
        if (!isUser[user]) {
            users.push(user);
            isUser[user] = true;
        }
    }
    
    function performUpkeep(bytes calldata performData) external override {
        address user = abi.decode(performData, (address));
        Position storage position = positions[user];
        
        if(position.needsRebalance) {
            // Determine best chain using off-chain data (simplified)
            Network optimalChain = _findOptimalChain(user);
            
            // Call internal rebalance function
            _initiateRebalance(user, position.collateral / 2, optimalChain);
        }
    }
    
    // Make the original function call the internal one
    function initiateRebalance(
        address user,
        uint256 amount,
        Network targetNetwork
    ) external onlyAutomation {
        _initiateRebalance(user, amount, targetNetwork);
    }
    
    // Create internal version
    function _initiateRebalance(
        address user,
        uint256 amount,
        Network targetNetwork
    ) internal {
        require(positions[user].needsRebalance, "Rebalance not needed");
        
        // Withdraw from current strategy
        IStrategy(yieldStrategy).withdraw(amount);
        
        // Approve CCIP router to spend tokens
        IERC20(asset).approve(address(ccipRouter), amount);
        
        // Prepare CCIP message with token transfer
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({
            token: asset,
            amount: amount
        });
        
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(address(this)),
            data: abi.encode(user, amount, targetNetwork),
            tokenAmounts: tokenAmounts, // ← Include actual tokens
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: 200_000})),
            feeToken: address(0)
        });
        
        // Send via CCIP with tokens
        ccipRouter.ccipSend(chainSelectors[targetNetwork], message);
        positions[user].collateral -= amount;
        
        emit RebalanceInitiated(user, currentNetwork, targetNetwork);
    }
    
    // ========== RISK MANAGEMENT ==========
    function updateHealthFactor(
        address user, 
        uint256 newHealthFactor
    ) external onlyFunctionsOracle {
        Position storage position = positions[user];
        position.lastHealthFactor = newHealthFactor;
        
        // Flag for rebalance if below threshold
        position.needsRebalance = newHealthFactor < 1.1e18; // 1.1 in 18 decimals
        
        emit HealthFactorUpdated(user, newHealthFactor);
    }
    
    // ========== AUTOMATION ==========
    function checkUpkeep(bytes calldata) external view override returns (
        bool upkeepNeeded, 
        bytes memory performData
    ) {
        // Simplified: Check all positions (in production use paging)
        for(uint i = 0; i < users.length; i++) {
            if(positions[users[i]].needsRebalance) {
                return (true, abi.encode(users[i]));
            }
        }
        return (false, "");
    }
    
    // ========== INTERNAL HELPERS ==========
    function _findOptimalChain(address user) internal view returns (Network) {
        // Simplified logic - in practice use Chainlink Functions
        // This would call your Python risk model
        return currentNetwork == Network.ETHEREUM ? Network.POLYGON : Network.ETHEREUM;
    }
    
    // ========== MODIFIERS ==========
    modifier onlyFunctionsOracle() {
        require(msg.sender == functionsOracle, "Not authorized");
        _;
    }
    
    modifier onlyAutomation() {
        // In production, verify this is called by Chainlink Automation
        _;
    }
}