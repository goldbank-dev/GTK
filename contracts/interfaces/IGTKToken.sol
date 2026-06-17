// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IGTKToken {
    function mint(address to, uint256 amount, uint256 goldGrams, bytes32 depositRef) external;
    function burn(uint256 amount, uint256 goldGrams, bytes32 withdrawalRef) external;
    function balanceOf(address account) external view returns (uint256);
    function goldPricePerGram() external view returns (uint256);
    function totalGoldReserves() external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function setKycTier(address account, uint8 tier) external;
    function blacklisted(address account) external view returns (bool);
}
