// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.20;

// import "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
// import "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";

// /// @title CrossYield Source Vault
// /// @notice Users deposit into this vault, which uses Chainlink CCIP to bridge funds to destination vaults
// contract SourceVault {
//     address public owner;
//     IRouterClient public ccipRouter;
//     mapping(uint64 => address) public destinationVaults; // chainSelector => vault address

//     event Deposited(address indexed user, uint256 amount);
//     event Rebalanced(uint64 toChain, uint256 amount, address destinationVault);

//     modifier onlyOwner() {
//         require(msg.sender == owner, "Not owner");
//         _;
//     }

//     constructor(address _router) {
//         owner = msg.sender;
//         ccipRouter = IRouterClient(_router);
//     }

//     receive() external payable {
//         emit Deposited(msg.sender, msg.value);
//     }

//     function setDestinationVault(uint64 chainSelector, address vaultAddress) external onlyOwner {
//         destinationVaults[chainSelector] = vaultAddress;
//     }

//     function rebalance(uint64 toChain, uint256 amount) external onlyOwner {
//         require(address(this).balance >= amount, "Insufficient funds");
//         address receiver = destinationVaults[toChain];
//         require(receiver != address(0), "Invalid destination vault");

//         Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
//             receiver: abi.encode(receiver),
//             data: abi.encode("rebalance", amount),
//             tokenAmounts: new Client.EVMTokenAmount[](0),
//             extraArgs: "",
//             feeToken: address(0)
//         });

//         ccipRouter.ccipSend{value: amount}(toChain, message);
//         emit Rebalanced(toChain, amount, receiver);
//     }
// }

// /// @title CrossYield Destination Vault
// /// @notice Receives bridged funds and deposits into integrated strategy (e.g., Aave)
// contract DestinationVault {
//     address public strategy;
//     address public owner;

//     event StrategyUpdated(address indexed newStrategy);
//     event ReceivedFromCCIP(uint256 amount);

//     modifier onlyOwner() {
//         require(msg.sender == owner, "Not owner");
//         _;
//     }

//     constructor() {
//         owner = msg.sender;
//     }

//     receive() external payable {
//         emit ReceivedFromCCIP(msg.value);
//         _invest(msg.value);
//     }

//     function setStrategy(address _strategy) external onlyOwner {
//         strategy = _strategy;
//         emit StrategyUpdated(_strategy);
//     }

//     function _invest(uint256 amount) internal {
//         require(strategy != address(0), "Strategy not set");
//         // Forward ETH or token to external yield strategy
//         (bool success, ) = strategy.call{value: amount}("");
//         require(success, "Strategy deposit failed");
//     }
// }
