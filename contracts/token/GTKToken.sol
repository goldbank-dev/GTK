// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

contract GTKToken is
    ERC20Upgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant CUSTODIAN_ROLE = keccak256("CUSTODIAN_ROLE");

    uint8 public constant TOKEN_DECIMALS = 18;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_REDEMPTION_GRAMS = 100 * 10 ** 18;
    uint256 public constant REDEMPTION_FEE_BPS = 50;

    uint256 public totalGoldReserves;
    address public priceOracle;
    uint256 public goldPricePerGram;
    uint256 public lastPriceUpdate;
    uint256 public totalRedemptionsProcessed;
    uint256 public contractVersion;

    mapping(address => bool) public blacklisted;
    mapping(address => uint8) public kycTier;
    mapping(address => uint256) public dailyVolume;
    mapping(address => uint256) public lastVolumeReset;
    mapping(uint8 => uint256) public dailyLimits;

    struct CustodyRecord {
        bytes32 barSerialNumber;
        uint256 weightGrams;
        uint256 purity;
        string vaultLocation;
        uint256 depositedAt;
        bool isActive;
    }

    struct RedemptionRequest {
        address requester;
        uint256 amountGrams;
        uint256 requestedAt;
        bool processed;
        string deliveryAddress;
        uint256 feePaid;
    }

    mapping(bytes32 => CustodyRecord) public custodyRecords;
    bytes32[] public activeBarSerials;

    mapping(uint256 => RedemptionRequest) public redemptionRequests;
    uint256 public redemptionRequestCount;

    event GoldPriceUpdated(uint256 oldPrice, uint256 newPrice, uint256 timestamp);
    event GoldDeposited(bytes32 indexed barSerial, uint256 weightGrams, string vaultLocation);
    event GoldWithdrawn(bytes32 indexed barSerial, uint256 weightGrams, string reason);
    event TokensMinted(address indexed to, uint256 amountGrams, uint256 goldPriceAtMint);
    event TokensBurned(address indexed from, uint256 amountGrams, uint256 goldPriceAtBurn);
    event RedemptionRequested(uint256 indexed requestId, address indexed requester, uint256 amountGrams);
    event RedemptionProcessed(uint256 indexed requestId, address indexed requester, uint256 amountGrams, uint256 fee);
    event BlacklistUpdated(address indexed account, bool status);
    event KycUpdated(address indexed account, uint8 tier);
    event CustodyAudit(bytes32 indexed barSerial, uint256 verifiedWeight, uint256 timestamp);
    event EmergencyShutdown(string reason);
    event ContractUpgraded(uint256 newVersion);

    modifier validPrice() {
        require(goldPricePerGram > 0, "GTK: price not set");
        require(block.timestamp - lastPriceUpdate <= 1 hours, "GTK: stale price");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address _priceOracle) public initializer {
        __ERC20_init("Gold Token", "GTK");
        __ERC20Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(CUSTODIAN_ROLE, admin);

        priceOracle = _priceOracle;
        contractVersion = 1;

        dailyLimits[1] = 1000 * 10 ** 18;
        dailyLimits[2] = 10000 * 10 ** 18;
        dailyLimits[3] = type(uint256).max;
    }

    function updateGoldPrice(uint256 _pricePerGram) external onlyRole(MINTER_ROLE) {
        require(_pricePerGram > 0, "GTK: invalid price");
        uint256 oldPrice = goldPricePerGram;
        goldPricePerGram = _pricePerGram;
        lastPriceUpdate = block.timestamp;
        emit GoldPriceUpdated(oldPrice, _pricePerGram, block.timestamp);
    }

    function setPriceOracle(address _newOracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newOracle != address(0), "GTK: invalid oracle");
        priceOracle = _newOracle;
    }

    function depositGold(
        bytes32 barSerialNumber,
        uint256 weightGrams,
        uint256 purity,
        string memory vaultLocation
    ) external onlyRole(CUSTODIAN_ROLE) {
        require(weightGrams > 0, "GTK: invalid weight");
        require(purity >= 9900 && purity <= 9999, "GTK: invalid purity");
        require(custodyRecords[barSerialNumber].depositedAt == 0, "GTK: bar exists");

        custodyRecords[barSerialNumber] = CustodyRecord({
            barSerialNumber: barSerialNumber,
            weightGrams: weightGrams,
            purity: purity,
            vaultLocation: vaultLocation,
            depositedAt: block.timestamp,
            isActive: true
        });

        activeBarSerials.push(barSerialNumber);
        totalGoldReserves += weightGrams;

        emit GoldDeposited(barSerialNumber, weightGrams, vaultLocation);
    }

    function withdrawGold(bytes32 barSerialNumber, string memory reason) external onlyRole(CUSTODIAN_ROLE) {
        CustodyRecord storage record = custodyRecords[barSerialNumber];
        require(record.isActive, "GTK: bar not active");

        uint256 weight = record.weightGrams;
        record.isActive = false;
        record.weightGrams = 0;
        totalGoldReserves -= weight;

        for (uint256 i = 0; i < activeBarSerials.length; i++) {
            if (activeBarSerials[i] == barSerialNumber) {
                activeBarSerials[i] = activeBarSerials[activeBarSerials.length - 1];
                activeBarSerials.pop();
                break;
            }
        }

        emit GoldWithdrawn(barSerialNumber, weight, reason);
    }

    function auditCustody(bytes32 barSerialNumber, uint256 verifiedWeight) external onlyRole(CUSTODIAN_ROLE) {
        CustodyRecord storage record = custodyRecords[barSerialNumber];
        require(record.isActive, "GTK: bar not active");
        require(verifiedWeight == record.weightGrams, "GTK: weight mismatch");
        emit CustodyAudit(barSerialNumber, verifiedWeight, block.timestamp);
    }

    function getActiveBarsCount() external view returns (uint256) {
        return activeBarSerials.length;
    }

    function getCustodyDetails(bytes32 barSerialNumber) external view returns (CustodyRecord memory) {
        return custodyRecords[barSerialNumber];
    }

    function mint(
        address to,
        uint256 amount,
        uint256 goldGrams,
        bytes32 depositRef
    ) external onlyRole(MINTER_ROLE) whenNotPaused nonReentrant {
        require(to != address(0), "GTK: mint to zero");
        require(amount > 0, "GTK: zero amount");
        require(!blacklisted[to], "GTK: recipient blacklisted");
        require(kycTier[to] > 0, "GTK: KYC required");

        require(totalSupply() + amount <= totalGoldReserves, "GTK: insufficient backing");

        _checkDailyLimit(to, amount);
        _mint(to, amount);

        emit TokensMinted(to, amount, goldPricePerGram);
    }

    function burn(uint256 amount, uint256 goldGrams, bytes32 withdrawalRef) external whenNotPaused nonReentrant {
        require(amount > 0, "GTK: burn zero");
        require(balanceOf(msg.sender) >= amount, "GTK: insufficient balance");

        _burn(msg.sender, amount);

        emit TokensBurned(msg.sender, amount, goldPricePerGram);
    }

    function requestRedemption(
        uint256 amountGrams,
        string memory deliveryAddress
    ) external nonReentrant notBlacklisted(msg.sender) validPrice returns (uint256 requestId) {
        require(amountGrams >= MIN_REDEMPTION_GRAMS, "GTK: below minimum");
        require(balanceOf(msg.sender) >= amountGrams, "GTK: insufficient balance");
        require(bytes(deliveryAddress).length > 0, "GTK: invalid address");

        uint256 fee = (amountGrams * REDEMPTION_FEE_BPS) / BPS_DENOMINATOR;
        uint256 netAmount = amountGrams - fee;

        _burn(msg.sender, amountGrams);

        requestId = redemptionRequestCount++;
        redemptionRequests[requestId] = RedemptionRequest({
            requester: msg.sender,
            amountGrams: netAmount,
            requestedAt: block.timestamp,
            processed: false,
            deliveryAddress: deliveryAddress,
            feePaid: fee
        });

        totalRedemptionsProcessed += amountGrams;
        totalGoldReserves -= amountGrams;

        emit RedemptionRequested(requestId, msg.sender, amountGrams);
    }

    function processRedemption(uint256 requestId) external onlyRole(CUSTODIAN_ROLE) nonReentrant {
        RedemptionRequest storage request = redemptionRequests[requestId];
        require(!request.processed, "GTK: already processed");
        request.processed = true;
        emit RedemptionProcessed(requestId, request.requester, request.amountGrams, request.feePaid);
    }

    function setBlacklist(address account, bool status) external onlyRole(COMPLIANCE_ROLE) {
        blacklisted[account] = status;
        emit BlacklistUpdated(account, status);
    }

    function setKycTier(address account, uint8 tier) external onlyRole(COMPLIANCE_ROLE) {
        require(tier <= 3, "GTK: invalid tier");
        kycTier[account] = tier;
        emit KycUpdated(account, tier);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
        emit EmergencyShutdown("emergency pause");
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _update(address from, address to, uint256 amount)
        internal
        override(ERC20Upgradeable, ERC20PausableUpgradeable)
    {
        if (from != address(0)) {
            require(!blacklisted[from], "GTK: sender blacklisted");
        }
        if (to != address(0)) {
            require(!blacklisted[to], "GTK: recipient blacklisted");
        }
        super._update(from, to, amount);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    function decimals() public pure override returns (uint8) {
        return TOKEN_DECIMALS;
    }

    function version() external view returns (uint256) {
        return contractVersion;
    }

    function upgradeVersion() external onlyRole(UPGRADER_ROLE) {
        contractVersion++;
        emit ContractUpgraded(contractVersion);
    }

    function getTokenValueInUSD(uint256 amountGrams) external view returns (uint256) {
        return (amountGrams * goldPricePerGram) / 10 ** 18;
    }

    function getReserveRatio() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 10000;
        return (totalGoldReserves * 10000) / supply;
    }

    function isFullyBacked() external view returns (bool) {
        return totalGoldReserves >= totalSupply();
    }

    modifier notBlacklisted(address account) {
        require(!blacklisted[account], "GTK: blacklisted");
        _;
    }

    function _checkDailyLimit(address account, uint256 amount) internal {
        uint8 tier = kycTier[account];
        if (tier == 0) revert("GTK: KYC required");
        uint256 limit = dailyLimits[tier];
        if (limit == type(uint256).max) return;
        if (block.timestamp > lastVolumeReset[account] + 1 days) {
            dailyVolume[account] = 0;
            lastVolumeReset[account] = block.timestamp;
        }
        require(dailyVolume[account] + amount <= limit, "GTK: daily limit exceeded");
        dailyVolume[account] += amount;
    }
}
