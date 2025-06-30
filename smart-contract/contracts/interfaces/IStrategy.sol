// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IStrategy {
    function initialize(address yieldOptimizer) external;
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function creditPosition(address user, uint256 amount) external;
    function getCurrentAPY() external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function balanceOf(address user) external view returns (uint256);
}

pragma solidity ^0.8.19;

library RiskMath {
    function calculateHealthFactor(
        uint256 collateral,
        uint256 debt,
        uint256 collateralPrice,
        uint256 debtPrice
    ) internal pure returns (uint256) {
        if (debt == 0) return type(uint256).max;
        uint256 collateralValue = collateral * collateralPrice;
        uint256 debtValue = debt * debtPrice;
        return (collateralValue * 1e18) / debtValue;
    }
}