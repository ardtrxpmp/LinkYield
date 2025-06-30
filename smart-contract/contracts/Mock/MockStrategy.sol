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