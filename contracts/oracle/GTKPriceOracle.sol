// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract GTKPriceOracle is AccessControl {
    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");

    AggregatorV3Interface public immutable chainlinkFeed;

    uint256 public manualPrice;
    uint256 public lastManualUpdate;

    uint256 public constant DEVIATION_THRESHOLD = 200;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant OZ_TO_GRAM = 3110347680;

    event PriceUpdated(uint256 chainlinkPrice, uint256 manualPrice, uint256 deviation);
    event FallbackActivated(uint256 manualPrice);

    constructor(address _chainlinkFeed) {
        chainlinkFeed = AggregatorV3Interface(_chainlinkFeed);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PRICE_UPDATER_ROLE, msg.sender);
    }

    function getGoldPricePerGram() external view returns (uint256) {
        (uint256 chainlinkPrice, bool chainlinkValid) = _getChainlinkPrice();

        if (chainlinkValid) {
            if (manualPrice > 0) {
                uint256 deviation = _calculateDeviation(chainlinkPrice, manualPrice);
                if (deviation <= DEVIATION_THRESHOLD) {
                    return chainlinkPrice;
                }
                return manualPrice;
            }
            return chainlinkPrice;
        }

        require(block.timestamp - lastManualUpdate < 1 hours, "Oracle: stale manual price");
        require(manualPrice > 0, "Oracle: no price available");
        return manualPrice;
    }

    function setManualPrice(uint256 _price) external onlyRole(PRICE_UPDATER_ROLE) {
        require(_price > 0, "Oracle: invalid price");
        manualPrice = _price;
        lastManualUpdate = block.timestamp;
        emit FallbackActivated(_price);
    }

    function _getChainlinkPrice() internal view returns (uint256, bool) {
        try chainlinkFeed.latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256 /* startedAt */,
            uint256 updatedAt,
            uint80 answeredInRound
        ) {
            if (answer <= 0) return (0, false);
            if (updatedAt == 0) return (0, false);
            if (answeredInRound < roundId) return (0, false);
            if (block.timestamp - updatedAt > 1 hours) return (0, false);

            uint256 pricePerOz = uint256(answer);
            uint256 pricePerGram = (pricePerOz * 10 ** 8) / OZ_TO_GRAM;

            return (pricePerGram, true);
        } catch {
            return (0, false);
        }
    }

    function _calculateDeviation(uint256 priceA, uint256 priceB) internal pure returns (uint256) {
        if (priceA == 0 && priceB == 0) return 0;
        if (priceA == 0 || priceB == 0) return BASIS_POINTS;
        uint256 maxPrice = priceA > priceB ? priceA : priceB;
        uint256 minPrice = priceA < priceB ? priceA : priceB;
        return ((maxPrice - minPrice) * BASIS_POINTS) / maxPrice;
    }
}
