// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IGTKToken.sol";

contract GTKBank is AccessControlUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IGTKToken public gtkToken;
    IERC20 public usdt;

    uint256 public depositFeeBps;
    uint256 public withdrawalFeeBps;
    uint256 public constant BPS_DENOMINATOR = 10000;

    uint256 public dailyDepositLimit;
    uint256 public dailyWithdrawalLimit;
    uint256 public dailyDeposits;
    uint256 public dailyWithdrawals;
    uint256 public lastLimitReset;

    mapping(bytes32 => bool) public processedDeposits;
    mapping(bytes32 => Deposit) public deposits;

    struct Deposit {
        address user;
        uint256 brlAmount;
        uint256 usdtAmount;
        uint256 gtkAmount;
        uint256 goldGrams;
        uint256 timestamp;
        bool processed;
    }

    event DepositProcessed(bytes32 indexed pixId, address indexed user, uint256 brlAmount, uint256 gtkAmount);
    event WithdrawalRequested(bytes32 indexed withdrawalId, address indexed user, uint256 gtkAmount, uint256 usdtAmount);
    event FeeUpdated(string feeType, uint256 newBps);
    event LimitsUpdated(string limitType, uint256 newValue);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _gtkToken, address _usdt, address admin) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        gtkToken = IGTKToken(_gtkToken);
        usdt = IERC20(_usdt);

        depositFeeBps = 50;
        withdrawalFeeBps = 75;

        dailyDepositLimit = 1_000_000 * 10 ** 6;
        dailyWithdrawalLimit = 500_000 * 10 ** 6;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function processDeposit(
        bytes32 pixId,
        address user,
        uint256 brlAmount,
        uint256 usdtAmount,
        uint256 goldGrams,
        uint256 gtkAmount
    ) external onlyRole(OPERATOR_ROLE) nonReentrant {
        require(!processedDeposits[pixId], "Bank: duplicate deposit");
        require(user != address(0), "Bank: invalid user");
        require(usdtAmount > 0 && gtkAmount > 0, "Bank: zero amount");
        _checkDailyLimit(usdtAmount, true);

        processedDeposits[pixId] = true;
        deposits[pixId] = Deposit({
            user: user,
            brlAmount: brlAmount,
            usdtAmount: usdtAmount,
            gtkAmount: gtkAmount,
            goldGrams: goldGrams,
            timestamp: block.timestamp,
            processed: true
        });

        require(
            usdt.transferFrom(user, address(this), usdtAmount),
            "Bank: USDT transfer failed"
        );

        uint256 fee = (gtkAmount * depositFeeBps) / BPS_DENOMINATOR;
        uint256 netAmount = gtkAmount - fee;

        gtkToken.mint(user, netAmount, goldGrams, pixId);

        if (fee > 0) {
            gtkToken.mint(address(this), fee, 0, pixId);
        }

        emit DepositProcessed(pixId, user, brlAmount, netAmount);
    }

    function requestWithdrawal(
        uint256 gtkAmount,
        uint256 goldGrams,
        bytes32 withdrawalId
    ) external nonReentrant {
        require(gtkAmount > 0, "Bank: zero amount");
        require(gtkToken.balanceOf(msg.sender) >= gtkAmount, "Bank: insufficient GTK");

        uint256 fee = (gtkAmount * withdrawalFeeBps) / BPS_DENOMINATOR;
        uint256 netGtk = gtkAmount - fee;

        uint256 goldPrice = gtkToken.goldPricePerGram();
        require(goldPrice > 0, "Bank: no price");

        uint256 usdtAmount = (netGtk * goldPrice) / 10 ** 20;
        _checkDailyLimit(usdtAmount, false);

        gtkToken.burn(gtkAmount, goldGrams, withdrawalId);

        emit WithdrawalRequested(withdrawalId, msg.sender, gtkAmount, usdtAmount);
    }

    function processWithdrawalPix(bytes32 withdrawalId, address user, uint256 usdtAmount, string memory pixKey)
        external
        onlyRole(OPERATOR_ROLE)
        nonReentrant
    {
        require(usdt.balanceOf(address(this)) >= usdtAmount, "Bank: insufficient USDT");
        require(usdt.transfer(user, usdtAmount), "Bank: USDT transfer failed");
    }

    function setFees(uint256 _depositFee, uint256 _withdrawalFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        depositFeeBps = _depositFee;
        withdrawalFeeBps = _withdrawalFee;
        emit FeeUpdated("deposit", _depositFee);
        emit FeeUpdated("withdrawal", _withdrawalFee);
    }

    function setLimits(uint256 _depositLimit, uint256 _withdrawalLimit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        dailyDepositLimit = _depositLimit;
        dailyWithdrawalLimit = _withdrawalLimit;
        emit LimitsUpdated("deposit", _depositLimit);
        emit LimitsUpdated("withdrawal", _withdrawalLimit);
    }

    function rescueTokens(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(gtkToken), "Bank: cannot rescue GTK");
        IERC20(token).transfer(msg.sender, amount);
    }

    function _checkDailyLimit(uint256 amount, bool isDeposit) internal {
        if (block.timestamp > lastLimitReset + 1 days) {
            dailyDeposits = 0;
            dailyWithdrawals = 0;
            lastLimitReset = block.timestamp;
        }
        if (isDeposit) {
            require(dailyDeposits + amount <= dailyDepositLimit, "Bank: deposit limit");
            dailyDeposits += amount;
        } else {
            require(dailyWithdrawals + amount <= dailyWithdrawalLimit, "Bank: withdrawal limit");
            dailyWithdrawals += amount;
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
