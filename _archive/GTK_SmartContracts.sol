
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
// BIBLIOTECAS OPENZEPPELIN (importar via npm/remix)
// ============================================================
// @openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol
// @openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol
// @openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol
// @openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol
// @openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol
// @openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol
// @openzeppelin/contracts/utils/cryptography/ECDSA.sol

// ============================================================
// GTK TOKEN - CONTRATO PRINCIPAL
// Token lastreado 1:1 em ouro físico (1 GTK = 1 grama de ouro)
// ============================================================

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract GTKToken is 
    Initializable,
    ERC20Upgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    // ============================================================
    // ROLES (Controle de Acesso Granular)
    // ============================================================
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant CUSTODIAN_ROLE = keccak256("CUSTODIAN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    // ============================================================
    // CONSTANTES DO SISTEMA
    // ============================================================
    uint8 public constant TOKEN_DECIMALS = 18;
    uint256 public constant GRAMS_PER_OZ = 3110347680; // 31.10347680 gramas = 1 onça troy (com 8 decimais)
    uint256 public constant MIN_REDEMPTION_GRAMS = 100 * 10**18; // Mínimo 100g para resgate físico
    uint256 public constant REDEMPTION_FEE_BPS = 50; // 0.5% fee de resgate
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ============================================================
    // ESTADO DO TOKEN
    // ============================================================

    // Preço do ouro em USD por grama (com 8 decimais de precisão)
    // Atualizado por oráculos Chainlink/Custom
    uint256 public goldPricePerGram;

    // Timestamp da última atualização de preço
    uint256 public lastPriceUpdate;

    // Endereço do oráculo de preço autorizado
    address public priceOracle;

    // Total de ouro físico em custódia (em gramas, com 18 decimais)
    uint256 public totalGoldInCustody;

    // Total de resgates processados
    uint256 public totalRedemptionsProcessed;

    // Contador de versão para upgrades
    uint256 public contractVersion;

    // ============================================================
    // ESTRUTURAS DE DADOS
    // ============================================================

    struct CustodyRecord {
        bytes32 barSerialNumber;
        uint256 weightGrams;
        uint256 purity; // em basis points (9999 = 99.99%)
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

    struct KYCData {
        bool isVerified;
        uint256 verifiedAt;
        string country;
        uint8 riskLevel; // 1-5
        bool isAccredited;
    }

    // ============================================================
    // MAPPINGS
    // ============================================================
    mapping(address => bool) private _blacklisted;
    mapping(bytes32 => CustodyRecord) public custodyRecords;
    mapping(uint256 => RedemptionRequest) public redemptionRequests;
    mapping(address => KYCData) public kycData;
    mapping(address => uint256) public dailyMinted; // Controle de limites diários
    mapping(address => uint256) public lastMintDay;

    bytes32[] public activeBarSerials;
    uint256 public redemptionRequestCount;

    // ============================================================
    // EVENTOS
    // ============================================================
    event GoldPriceUpdated(uint256 oldPrice, uint256 newPrice, uint256 timestamp);
    event GoldDeposited(bytes32 indexed barSerial, uint256 weightGrams, string vaultLocation);
    event GoldWithdrawn(bytes32 indexed barSerial, uint256 weightGrams, string reason);
    event TokensMinted(address indexed to, uint256 amountGrams, uint256 goldPriceAtMint);
    event TokensBurned(address indexed from, uint256 amountGrams, uint256 goldPriceAtBurn);
    event RedemptionRequested(uint256 indexed requestId, address indexed requester, uint256 amountGrams);
    event RedemptionProcessed(uint256 indexed requestId, address indexed requester, uint256 amountGrams, uint256 fee);
    event Blacklisted(address indexed account, string reason);
    event UnBlacklisted(address indexed account);
    event KYCVerified(address indexed account, uint8 riskLevel);
    event KYCR evoked(address indexed account);
    event CustodyAudit(bytes32 indexed barSerial, uint256 verifiedWeight, uint256 timestamp);
    event EmergencyShutdown(string reason);
    event ContractUpgraded(uint256 newVersion);

    // ============================================================
    // MODIFICADORES
    // ============================================================
    modifier notBlacklisted(address account) {
        require(!_blacklisted[account], "GTK: Account is blacklisted");
        _;
    }

    modifier onlyVerifiedKYC(address account) {
        require(kycData[account].isVerified, "GTK: KYC not verified");
        _;
    }

    modifier validPrice() {
        require(goldPricePerGram > 0, "GTK: Gold price not set");
        require(block.timestamp - lastPriceUpdate <= 1 hours, "GTK: Price stale");
        _;
    }

    // ============================================================
    // INICIALIZAÇÃO (Proxy Pattern)
    // ============================================================
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name,
        string memory symbol,
        address defaultAdmin,
        address _priceOracle
    ) public initializer {
        __ERC20_init(name, symbol);
        __ERC20Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, defaultAdmin);
        _grantRole(BURNER_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, defaultAdmin);
        _grantRole(BLACKLISTER_ROLE, defaultAdmin);
        _grantRole(UPGRADER_ROLE, defaultAdmin);
        _grantRole(CUSTODIAN_ROLE, defaultAdmin);
        _grantRole(ORACLE_ROLE, defaultAdmin);
        _grantRole(COMPLIANCE_ROLE, defaultAdmin);

        priceOracle = _priceOracle;
        contractVersion = 1;
        goldPricePerGram = 0;
    }

    // ============================================================
    // FUNÇÕES DE PREÇO E ORÁCULO
    // ============================================================

    function updateGoldPrice(uint256 _pricePerGram) external onlyRole(ORACLE_ROLE) {
        require(_pricePerGram > 0, "GTK: Invalid price");
        uint256 oldPrice = goldPricePerGram;
        goldPricePerGram = _pricePerGram;
        lastPriceUpdate = block.timestamp;
        emit GoldPriceUpdated(oldPrice, _pricePerGram, block.timestamp);
    }

    function getGoldPrice() external view returns (uint256) {
        return goldPricePerGram;
    }

    function setPriceOracle(address _newOracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newOracle != address(0), "GTK: Invalid oracle");
        priceOracle = _newOracle;
    }

    // ============================================================
    // FUNÇÕES DE CUSTÓDIA DE OURO FÍSICO
    // ============================================================

    function depositGold(
        bytes32 barSerialNumber,
        uint256 weightGrams,
        uint256 purity,
        string memory vaultLocation
    ) external onlyRole(CUSTODIAN_ROLE) {
        require(weightGrams > 0, "GTK: Invalid weight");
        require(purity >= 9900 && purity <= 9999, "GTK: Invalid purity");
        require(custodyRecords[barSerialNumber].depositedAt == 0, "GTK: Bar already registered");

        custodyRecords[barSerialNumber] = CustodyRecord({
            barSerialNumber: barSerialNumber,
            weightGrams: weightGrams,
            purity: purity,
            vaultLocation: vaultLocation,
            depositedAt: block.timestamp,
            isActive: true
        });

        activeBarSerials.push(barSerialNumber);
        totalGoldInCustody += weightGrams;

        emit GoldDeposited(barSerialNumber, weightGrams, vaultLocation);
    }

    function withdrawGold(
        bytes32 barSerialNumber,
        string memory reason
    ) external onlyRole(CUSTODIAN_ROLE) {
        CustodyRecord storage record = custodyRecords[barSerialNumber];
        require(record.isActive, "GTK: Bar not active");
        require(record.weightGrams > 0, "GTK: Bar empty");

        uint256 weight = record.weightGrams;
        record.isActive = false;
        record.weightGrams = 0;
        totalGoldInCustody -= weight;

        // Remove from active list
        for (uint i = 0; i < activeBarSerials.length; i++) {
            if (activeBarSerials[i] == barSerialNumber) {
                activeBarSerials[i] = activeBarSerials[activeBarSerials.length - 1];
                activeBarSerials.pop();
                break;
            }
        }

        emit GoldWithdrawn(barSerialNumber, weight, reason);
    }

    function auditCustody(bytes32 barSerialNumber, uint256 verifiedWeight) 
        external 
        onlyRole(CUSTODIAN_ROLE) 
    {
        CustodyRecord storage record = custodyRecords[barSerialNumber];
        require(record.isActive, "GTK: Bar not active");
        require(verifiedWeight == record.weightGrams, "GTK: Weight mismatch");

        emit CustodyAudit(barSerialNumber, verifiedWeight, block.timestamp);
    }

    function getCustodyDetails(bytes32 barSerialNumber) 
        external 
        view 
        returns (CustodyRecord memory) 
    {
        return custodyRecords[barSerialNumber];
    }

    function getActiveBarsCount() external view returns (uint256) {
        return activeBarSerials.length;
    }

    // ============================================================
    // FUNÇÕES DE MINTING (EMISSÃO)
    // ============================================================

    function mint(
        address to, 
        uint256 amountGrams
    ) 
        external 
        onlyRole(MINTER_ROLE) 
        nonReentrant
        notBlacklisted(to)
        onlyVerifiedKYC(to)
        validPrice
    {
        require(to != address(0), "GTK: Invalid address");
        require(amountGrams > 0, "GTK: Invalid amount");
        require(amountGrams <= totalGoldInCustody - totalSupply(), "GTK: Insufficient gold reserves");

        // Controle de limites diários (anti-lavagem)
        uint256 currentDay = block.timestamp / 1 days;
        if (lastMintDay[to] != currentDay) {
            dailyMinted[to] = 0;
            lastMintDay[to] = currentDay;
        }
        require(dailyMinted[to] + amountGrams <= 10000 * 10**18, "GTK: Daily mint limit exceeded");
        dailyMinted[to] += amountGrams;

        _mint(to, amountGrams);
        emit TokensMinted(to, amountGrams, goldPricePerGram);
    }

    function mintWithCollateral(
        address to,
        uint256 amountGrams,
        bytes32[] memory backingBars
    ) 
        external 
        onlyRole(MINTER_ROLE) 
        nonReentrant
        notBlacklisted(to)
        onlyVerifiedKYC(to)
        validPrice
    {
        require(to != address(0), "GTK: Invalid address");
        require(amountGrams > 0, "GTK: Invalid amount");
        require(backingBars.length > 0, "GTK: No backing bars");

        // Verifica se as barras têm ouro suficiente
        uint256 totalBacking = 0;
        for (uint i = 0; i < backingBars.length; i++) {
            CustodyRecord storage record = custodyRecords[backingBars[i]];
            require(record.isActive, "GTK: Inactive backing bar");
            totalBacking += record.weightGrams;
        }
        require(totalBacking >= amountGrams, "GTK: Insufficient backing");

        _mint(to, amountGrams);
        emit TokensMinted(to, amountGrams, goldPricePerGram);
    }

    // ============================================================
    // FUNÇÕES DE BURNING (QUEIMA) E RESGATE
    // ============================================================

    function burn(uint256 amountGrams) 
        external 
        nonReentrant
        notBlacklisted(msg.sender)
        validPrice
    {
        require(amountGrams > 0, "GTK: Invalid amount");
        require(balanceOf(msg.sender) >= amountGrams, "GTK: Insufficient balance");

        _burn(msg.sender, amountGrams);
        emit TokensBurned(msg.sender, amountGrams, goldPricePerGram);
    }

    function requestRedemption(
        uint256 amountGrams,
        string memory deliveryAddress
    ) 
        external 
        nonReentrant
        notBlacklisted(msg.sender)
        onlyVerifiedKYC(msg.sender)
        validPrice
        returns (uint256 requestId
    ) {
        require(amountGrams >= MIN_REDEMPTION_GRAMS, "GTK: Below minimum redemption");
        require(balanceOf(msg.sender) >= amountGrams, "GTK: Insufficient balance");
        require(bytes(deliveryAddress).length > 0, "GTK: Invalid delivery address");

        uint256 fee = (amountGrams * REDEMPTION_FEE_BPS) / BPS_DENOMINATOR;
        uint256 netAmount = amountGrams - fee;

        // Queima os tokens
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

        emit RedemptionRequested(requestId, msg.sender, amountGrams);
    }

    function processRedemption(uint256 requestId) 
        external 
        onlyRole(CUSTODIAN_ROLE) 
        nonReentrant
    {
        RedemptionRequest storage request = redemptionRequests[requestId];
        require(!request.processed, "GTK: Already processed");
        require(request.amountGrams > 0, "GTK: Invalid request");

        request.processed = true;

        // Aqui seria integrado com o sistema logístico de entrega física
        // Por enquanto, apenas marca como processado

        emit RedemptionProcessed(requestId, request.requester, request.amountGrams, request.feePaid);
    }

    // ============================================================
    // COMPLIANCE E KYC
    // ============================================================

    function setKYC(
        address account,
        bool isVerified,
        string memory country,
        uint8 riskLevel,
        bool isAccredited
    ) 
        external 
        onlyRole(COMPLIANCE_ROLE) 
    {
        require(account != address(0), "GTK: Invalid address");
        require(riskLevel >= 1 && riskLevel <= 5, "GTK: Invalid risk level");

        kycData[account] = KYCData({
            isVerified: isVerified,
            verifiedAt: isVerified ? block.timestamp : 0,
            country: country,
            riskLevel: riskLevel,
            isAccredited: isAccredited
        });

        if (isVerified) {
            emit KYCVerified(account, riskLevel);
        } else {
            emit KYCRevoked(account);
        }
    }

    function blacklist(address account, string memory reason) 
        external 
        onlyRole(BLACKLISTER_ROLE) 
    {
        require(account != address(0), "GTK: Invalid address");
        require(!_blacklisted[account], "GTK: Already blacklisted");
        _blacklisted[account] = true;
        emit Blacklisted(account, reason);
    }

    function unBlacklist(address account) 
        external 
        onlyRole(BLACKLISTER_ROLE) 
    {
        require(_blacklisted[account], "GTK: Not blacklisted");
        _blacklisted[account] = false;
        emit UnBlacklisted(account);
    }

    function isBlacklisted(address account) external view returns (bool) {
        return _blacklisted[account];
    }

    // ============================================================
    // PAUSA DE EMERGÊNCIA
    // ============================================================

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
        emit EmergencyShutdown("Emergency pause activated");
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ============================================================
    // OVERRIDES OBRIGATÓRIOS
    // ============================================================

    function _update(
        address from,
        address to,
        uint256 amount
    ) 
        internal 
        virtual 
        override(ERC20Upgradeable, ERC20PausableUpgradeable) 
    {
        require(!_blacklisted[from], "GTK: Sender blacklisted");
        require(!_blacklisted[to], "GTK: Recipient blacklisted");
        super._update(from, to, amount);
    }

    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(UPGRADER_ROLE) 
    {}

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

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    function getTokenValueInUSD(uint256 amountGrams) external view returns (uint256) {
        return (amountGrams * goldPricePerGram) / 10**8;
    }

    function getReserveRatio() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 10000; // 100% se não há tokens emitidos
        return (totalGoldInCustody * 10000) / supply;
    }

    function isFullyBacked() external view returns (bool) {
        return totalGoldInCustody >= totalSupply();
    }
}


// ============================================================
// GTK ORACLE - SISTEMA DE PREÇOS DO OURO
// ============================================================
// Integração com Chainlink + Oráculos Customizados
// ============================================================

interface IChainlinkAggregator {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

contract GTKPriceOracle is AccessControl {
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Chainlink XAU/USD feed
    IChainlinkAggregator public chainlinkFeed;

    // Preço manual de backup
    uint256 public manualPrice;
    uint256 public manualPriceTimestamp;

    // Threshold de desvio aceitável (1% = 100 bps)
    uint256 public constant MAX_DEVIATION_BPS = 200; // 2%

    // Decimais do preço (8 para USD feeds da Chainlink)
    uint8 public constant PRICE_DECIMALS = 8;

    // 1 onça troy = 31.10347680 gramas
    uint256 public constant GRAMS_PER_OZ = 3110347680;

    event PriceUpdated(uint256 pricePerGram, uint256 pricePerOz, uint256 timestamp);
    event ChainlinkFeedUpdated(address newFeed);

    constructor(address _chainlinkFeed) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPDATER_ROLE, msg.sender);
        chainlinkFeed = IChainlinkAggregator(_chainlinkFeed);
    }

    function getGoldPricePerGram() external view returns (uint256) {
        // Tenta Chainlink primeiro
        try chainlinkFeed.latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) {
            require(answer > 0, "Invalid price");
            require(block.timestamp - updatedAt <= 1 hours, "Stale price");

            uint256 pricePerOz = uint256(answer);
            // Converte para preço por grama
            uint256 pricePerGram = (pricePerOz * 10**8) / GRAMS_PER_OZ;

            return pricePerGram;
        } catch {
            // Fallback para preço manual
            require(manualPrice > 0, "No price available");
            require(block.timestamp - manualPriceTimestamp <= 1 hours, "Manual price stale");
            return manualPrice;
        }
    }

    function updateManualPrice(uint256 _pricePerGram) external onlyRole(UPDATER_ROLE) {
        require(_pricePerGram > 0, "Invalid price");
        manualPrice = _pricePerGram;
        manualPriceTimestamp = block.timestamp;
        emit PriceUpdated(_pricePerGram, (_pricePerGram * GRAMS_PER_OZ) / 10**8, block.timestamp);
    }

    function setChainlinkFeed(address _newFeed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newFeed != address(0), "Invalid feed");
        chainlinkFeed = IChainlinkAggregator(_newFeed);
        emit ChainlinkFeedUpdated(_newFeed);
    }
}


// ============================================================
// GTK BANK - SISTEMA BANCÁRIO INTEGRADO
// ============================================================
// Conversão PIX → USDT → GTK
// ============================================================

interface IUSDT {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

interface IGTKToken {
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function goldPricePerGram() external view returns (uint256);
    function totalGoldInCustody() external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

contract GTKBank is ReentrancyGuard, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    IGTKToken public gtkToken;
    IUSDT public usdt;

    // Taxas (em basis points)
    uint256 public depositFeeBPS = 50;      // 0.5%
    uint256 public withdrawalFeeBPS = 75;   // 0.75%
    uint256 public conversionSpreadBPS = 30; // 0.3% spread na conversão

    uint256 public constant BPS_DENOMINATOR = 10000;

    // Limites
    uint256 public maxDepositPerTx = 100000 * 10**6; // 100k USDT
    uint256 public dailyDepositLimit = 1000000 * 10**6; // 1M USDT
    uint256 public currentDayDeposits;
    uint256 public currentDay;

    // Mappings
    mapping(address => uint256) public totalDeposited;
    mapping(address => uint256) public totalWithdrawn;
    mapping(bytes32 => bool) public processedPixIds;

    // Eventos
    event DepositReceived(
        bytes32 indexed pixId,
        address indexed user,
        uint256 usdtAmount,
        uint256 gtkAmount,
        uint256 goldPrice
    );
    event WithdrawalProcessed(
        address indexed user,
        uint256 gtkAmount,
        uint256 usdtAmount,
        string pixKey
    );
    event FeeUpdated(string feeType, uint256 newValue);

    constructor(address _gtkToken, address _usdt) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
        _grantRole(TREASURY_ROLE, msg.sender);
        gtkToken = IGTKToken(_gtkToken);
        usdt = IUSDT(_usdt);
    }

    function processPixDeposit(
        bytes32 pixId,
        address user,
        uint256 usdtAmount
    ) 
        external 
        onlyRole(OPERATOR_ROLE) 
        nonReentrant 
        returns (uint256 gtkAmount)
    {
        require(!processedPixIds[pixId], "GTKBank: PIX already processed");
        require(usdtAmount > 0, "GTKBank: Invalid amount");
        require(usdtAmount <= maxDepositPerTx, "GTKBank: Exceeds max deposit");

        // Controle diário
        uint256 today = block.timestamp / 1 days;
        if (today != currentDay) {
            currentDay = today;
            currentDayDeposits = 0;
        }
        require(currentDayDeposits + usdtAmount <= dailyDepositLimit, "GTKBank: Daily limit exceeded");

        // Calcula fee
        uint256 fee = (usdtAmount * depositFeeBPS) / BPS_DENOMINATOR;
        uint256 netUsdt = usdtAmount - fee;

        // Obtém preço do ouro
        uint256 goldPrice = gtkToken.goldPricePerGram();
        require(goldPrice > 0, "GTKBank: Gold price unavailable");

        // Converte USDT para GTK (considerando 6 decimais do USDT e 18 do GTK)
        // gtkAmount = (netUsdt * 10^12 * 10^8) / goldPrice
        gtkAmount = (netUsdt * 10**20) / goldPrice;

        // Verifica reservas
        require(
            gtkToken.totalGoldInCustody() >= gtkToken.totalSupply() + gtkAmount,
            "GTKBank: Insufficient gold reserves"
        );

        // Transfere USDT do usuário
        require(
            usdt.transferFrom(user, address(this), usdtAmount),
            "GTKBank: USDT transfer failed"
        );

        // Mint GTK tokens
        // Nota: Em produção, o GTKToken precisaria dar MINTER_ROLE para este contrato
        // gtkToken.mint(user, gtkAmount);

        processedPixIds[pixId] = true;
        totalDeposited[user] += usdtAmount;
        currentDayDeposits += usdtAmount;

        emit DepositReceived(pixId, user, usdtAmount, gtkAmount, goldPrice);

        return gtkAmount;
    }

    function processWithdrawal(
        address user,
        uint256 gtkAmount,
        string memory pixKey
    ) 
        external 
        onlyRole(OPERATOR_ROLE) 
        nonReentrant
    {
        require(gtkAmount > 0, "GTKBank: Invalid amount");
        require(bytes(pixKey).length > 0, "GTKBank: Invalid PIX key");

        uint256 goldPrice = gtkToken.goldPricePerGram();
        require(goldPrice > 0, "GTKBank: Gold price unavailable");

        // Converte GTK para USDT
        uint256 usdtAmount = (gtkAmount * goldPrice) / 10**20;
        uint256 fee = (usdtAmount * withdrawalFeeBPS) / BPS_DENOMINATOR;
        uint256 netUsdt = usdtAmount - fee;

        require(usdt.balanceOf(address(this)) >= netUsdt, "GTKBank: Insufficient USDT liquidity");

        // Queima GTK
        // Nota: Em produção, precisaria aprovação do usuário
        // gtkToken.burnFrom(user, gtkAmount);

        // Transfere USDT
        require(usdt.transfer(user, netUsdt), "GTKBank: USDT transfer failed");

        totalWithdrawn[user] += usdtAmount;

        emit WithdrawalProcessed(user, gtkAmount, netUsdt, pixKey);
    }

    function setFees(
        uint256 _depositFee,
        uint256 _withdrawalFee,
        uint256 _spread
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        depositFeeBPS = _depositFee;
        withdrawalFeeBPS = _withdrawalFee;
        conversionSpreadBPS = _spread;
        emit FeeUpdated("deposit", _depositFee);
        emit FeeUpdated("withdrawal", _withdrawalFee);
        emit FeeUpdated("spread", _spread);
    }

    function setLimits(
        uint256 _maxDeposit,
        uint256 _dailyLimit
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxDepositPerTx = _maxDeposit;
        dailyDepositLimit = _dailyLimit;
    }

    function rescueTokens(address token, uint256 amount) external onlyRole(TREASURY_ROLE) {
        require(token != address(gtkToken), "GTKBank: Cannot rescue GTK");
        IUSDT(token).transfer(msg.sender, amount);
    }
}


// ============================================================
// GTK GOVERNANCE - SISTEMA DE GOVERNANÇA DAO
// ============================================================

contract GTKGovernance is AccessControl {
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    struct Proposal {
        uint256 id;
        string description;
        address target;
        bytes callData;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 startTime;
        uint256 endTime;
        bool executed;
        bool canceled;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 public proposalCount;
    uint256 public votingPeriod = 7 days;
    uint256 public quorum = 1000 * 10**18; // 1000 GTK mínimo

    event ProposalCreated(uint256 indexed id, string description, address proposer);
    event VoteCast(uint256 indexed id, address voter, bool support, uint256 votes);
    event ProposalExecuted(uint256 indexed id);

    function createProposal(
        string memory description,
        address target,
        bytes memory callData
    ) external onlyRole(PROPOSER_ROLE) returns (uint256) {
        uint256 id = proposalCount++;
        proposals[id] = Proposal({
            id: id,
            description: description,
            target: target,
            callData: callData,
            forVotes: 0,
            againstVotes: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + votingPeriod,
            executed: false,
            canceled: false
        });

        emit ProposalCreated(id, description, msg.sender);
        return id;
    }

    function vote(uint256 proposalId, bool support, uint256 votes) external {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp < proposal.endTime, "Voting ended");
        require(!proposal.executed && !proposal.canceled, "Proposal not active");
        require(!hasVoted[proposalId][msg.sender], "Already voted");
        require(votes >= quorum, "Below quorum");

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            proposal.forVotes += votes;
        } else {
            proposal.againstVotes += votes;
        }

        emit VoteCast(proposalId, msg.sender, support, votes);
    }

    function executeProposal(uint256 proposalId) external onlyRole(EXECUTOR_ROLE) {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp >= proposal.endTime, "Voting ongoing");
        require(!proposal.executed && !proposal.canceled, "Proposal not active");
        require(proposal.forVotes > proposal.againstVotes, "Proposal rejected");

        proposal.executed = true;
        (bool success, ) = proposal.target.call(proposal.callData);
        require(success, "Execution failed");

        emit ProposalExecuted(proposalId);
    }
}
