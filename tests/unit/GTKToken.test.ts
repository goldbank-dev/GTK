import { expect } from "chai";
import { ethers, upgrades, network } from "hardhat";
import { GTKToken, GTKPriceOracle, GTKBank } from "../../typechain-types";

describe("GTKToken", function () {
  let gtkToken: GTKToken;
  let oracle: GTKPriceOracle;
  let gtkBank: GTKBank;
  let owner: any, minter: any, compliance: any, custodian: any, pauser: any;
  let user1: any, user2: any, attacker: any;

  const INITIAL_PRICE = ethers.parseUnits("65", 8);
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async function () {
    [owner, minter, compliance, custodian, pauser, user1, user2, attacker] =
      await ethers.getSigners();

    const GTKPriceOracleFactory = await ethers.getContractFactory("GTKPriceOracle");
    oracle = await GTKPriceOracleFactory.deploy(owner.address);
    await oracle.waitForDeployment();

    const GTKTokenFactory = await ethers.getContractFactory("GTKToken");
    gtkToken = await upgrades.deployProxy(
      GTKTokenFactory,
      [owner.address, await oracle.getAddress()],
      { kind: "uups", initializer: "initialize" }
    ) as GTKToken;
    await gtkToken.waitForDeployment();

    const GTKBankFactory = await ethers.getContractFactory("GTKBank");
    gtkBank = await upgrades.deployProxy(
      GTKBankFactory,
      [await gtkToken.getAddress(), owner.address, owner.address],
      { kind: "uups", initializer: "initialize" }
    ) as GTKBank;
    await gtkBank.waitForDeployment();

    await gtkToken.grantRole(await gtkToken.MINTER_ROLE(), minter.address);
    await gtkToken.grantRole(await gtkToken.COMPLIANCE_ROLE(), compliance.address);
    await gtkToken.grantRole(await gtkToken.CUSTODIAN_ROLE(), custodian.address);
    await gtkToken.grantRole(await gtkToken.PAUSER_ROLE(), pauser.address);

    await gtkToken.grantRole(await gtkToken.MINTER_ROLE(), await gtkBank.getAddress());
    await gtkToken.grantRole(await gtkToken.BURNER_ROLE(), await gtkBank.getAddress());

    await oracle.grantRole(await oracle.PRICE_UPDATER_ROLE(), owner.address);
    await oracle.setManualPrice(INITIAL_PRICE);
    await gtkToken.updateGoldPrice(INITIAL_PRICE);

    await gtkToken.connect(compliance).setKycTier(user1.address, 1);
    await gtkToken.connect(compliance).setKycTier(user2.address, 1);
  });

  describe("Deployment", function () {
    it("should initialize with correct metadata", async function () {
      expect(await gtkToken.name()).to.equal("Gold Token");
      expect(await gtkToken.symbol()).to.equal("GTK");
      expect(await gtkToken.decimals()).to.equal(18);
      expect(await gtkToken.version()).to.equal(1);
    });

    it("should set initial roles", async function () {
      expect(await gtkToken.hasRole(await gtkToken.MINTER_ROLE(), minter.address)).to.be.true;
      expect(await gtkToken.hasRole(await gtkToken.COMPLIANCE_ROLE(), compliance.address)).to.be.true;
    });
  });

  describe("Minting", function () {
    it("should mint with gold backing", async function () {
      const amount = ethers.parseEther("100");

      await gtkToken.connect(custodian).depositGold(
        ethers.encodeBytes32String("BAR001"),
        amount,
        9999,
        "Vault A"
      );

      await gtkToken.connect(minter).mint(
        user1.address, amount, amount,
        ethers.encodeBytes32String("DEP001")
      );

      expect(await gtkToken.balanceOf(user1.address)).to.equal(amount);
      expect(await gtkToken.totalGoldReserves()).to.equal(amount);
    });

    it("should revert mint without gold backing", async function () {
      await expect(
        gtkToken.connect(minter).mint(
          user1.address,
          ethers.parseEther("100"),
          ethers.parseEther("50"),
          ethers.encodeBytes32String("DEP002")
        )
      ).to.be.revertedWith("GTK: insufficient backing");
    });

    it("should revert mint without KYC", async function () {
      await expect(
        gtkToken.connect(minter).mint(
          attacker.address, ethers.parseEther("100"),
          ethers.parseEther("100"),
          ethers.encodeBytes32String("DEP003")
        )
      ).to.be.revertedWith("GTK: KYC required");
    });

    it("should revert mint to blacklisted address", async function () {
      await gtkToken.connect(compliance).setBlacklist(user1.address, true);
      await expect(
        gtkToken.connect(minter).mint(
          user1.address, ethers.parseEther("100"),
          ethers.parseEther("100"),
          ethers.encodeBytes32String("DEP004")
        )
      ).to.be.revertedWith("GTK: recipient blacklisted");
    });

    it("should enforce daily limit", async function () {
      await gtkToken.connect(custodian).depositGold(
        ethers.encodeBytes32String("BAR002"),
        ethers.parseEther("2000"),
        9999,
        "Vault A"
      );

      await gtkToken.connect(minter).mint(
        user1.address, ethers.parseEther("1000"),
        ethers.parseEther("1000"),
        ethers.encodeBytes32String("DEP005")
      );

      await expect(
        gtkToken.connect(minter).mint(
          user1.address, ethers.parseEther("100"),
          ethers.parseEther("100"),
          ethers.encodeBytes32String("DEP006")
        )
      ).to.be.revertedWith("GTK: daily limit exceeded");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await gtkToken.connect(custodian).depositGold(
        ethers.encodeBytes32String("BAR001"),
        ethers.parseEther("1000"),
        9999,
        "Vault A"
      );
      await gtkToken.connect(minter).mint(
        user1.address,
        ethers.parseEther("500"),
        ethers.parseEther("500"),
        ethers.encodeBytes32String("DEP001")
      );
    });

    it("should burn tokens without affecting reserves", async function () {
      await gtkToken.connect(user1).burn(
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        ethers.encodeBytes32String("WTH001")
      );

      expect(await gtkToken.balanceOf(user1.address)).to.equal(ethers.parseEther("400"));
      expect(await gtkToken.totalGoldReserves()).to.equal(ethers.parseEther("1000"));
    });

    it("should revert burn zero amount", async function () {
      await expect(
        gtkToken.connect(user1).burn(0, 0, ethers.encodeBytes32String("WTH003"))
      ).to.be.revertedWith("GTK: burn zero");
    });
  });

  describe("Transfers", function () {
    beforeEach(async function () {
      await gtkToken.connect(custodian).depositGold(
        ethers.encodeBytes32String("BAR001"),
        ethers.parseEther("1000"),
        9999,
        "Vault A"
      );
      await gtkToken.connect(minter).mint(
        user1.address,
        ethers.parseEther("500"),
        ethers.parseEther("500"),
        ethers.encodeBytes32String("DEP001")
      );
    });

    it("should transfer between KYC-verified users", async function () {
      await gtkToken.connect(user1).transfer(user2.address, ethers.parseEther("100"));
      expect(await gtkToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
    });

    it("should revert transfer from blacklisted sender", async function () {
      await gtkToken.connect(compliance).setBlacklist(user1.address, true);
      await expect(
        gtkToken.connect(user1).transfer(user2.address, ethers.parseEther("10"))
      ).to.be.revertedWith("GTK: sender blacklisted");
    });

    it("should revert transfer to blacklisted recipient", async function () {
      await gtkToken.connect(compliance).setBlacklist(user2.address, true);
      await expect(
        gtkToken.connect(user1).transfer(user2.address, ethers.parseEther("10"))
      ).to.be.revertedWith("GTK: recipient blacklisted");
    });

    it("should revert transfer when paused", async function () {
      await gtkToken.connect(pauser).pause();
      await expect(
        gtkToken.connect(user1).transfer(user2.address, ethers.parseEther("10"))
      ).to.be.reverted;
    });
  });

  describe("Custody", function () {
    it("should deposit gold bars", async function () {
      await gtkToken.connect(custodian).depositGold(
        ethers.encodeBytes32String("BAR001"),
        ethers.parseEther("1000"),
        9999,
        "Zurich Vault"
      );

      const record = await gtkToken.custodyRecords(ethers.encodeBytes32String("BAR001"));
      expect(record.weightGrams).to.equal(ethers.parseEther("1000"));
      expect(record.isActive).to.be.true;
    });

    it("should reject non-custodian deposit", async function () {
      await expect(
        gtkToken.connect(attacker).depositGold(
          ethers.encodeBytes32String("BAR001"),
          ethers.parseEther("1000"),
          9999,
          "Fake Vault"
        )
      ).to.be.reverted;
    });

    it("should withdraw gold and reduce reserves", async function () {
      await gtkToken.connect(custodian).depositGold(
        ethers.encodeBytes32String("BAR001"),
        ethers.parseEther("1000"),
        9999,
        "Vault"
      );

      await gtkToken.connect(custodian).withdrawGold(
        ethers.encodeBytes32String("BAR001"),
        "Audit"
      );

      const record = await gtkToken.custodyRecords(ethers.encodeBytes32String("BAR001"));
      expect(record.isActive).to.be.false;
      expect(await gtkToken.totalGoldReserves()).to.equal(0);
    });

    it("should audit custody records", async function () {
      await gtkToken.connect(custodian).depositGold(
        ethers.encodeBytes32String("BAR001"),
        ethers.parseEther("1000"),
        9999,
        "Vault"
      );

      await expect(
        gtkToken.connect(custodian).auditCustody(
          ethers.encodeBytes32String("BAR001"),
          ethers.parseEther("1000")
        )
      ).to.not.be.reverted;
    });
  });

  describe("Redemption", function () {
    beforeEach(async function () {
      await gtkToken.connect(compliance).setKycTier(user1.address, 3);

      await gtkToken.connect(custodian).depositGold(
        ethers.encodeBytes32String("BAR001"),
        ethers.parseEther("10000"),
        9999,
        "Vault"
      );
      await gtkToken.connect(minter).mint(
        user1.address,
        ethers.parseEther("5000"),
        ethers.parseEther("5000"),
        ethers.encodeBytes32String("DEP001")
      );
    });

    it("should request redemption above minimum", async function () {
      const amount = ethers.parseEther("200");
      await gtkToken.connect(user1).requestRedemption(amount, "Rua Teste, 123");

      const request = await gtkToken.redemptionRequests(0);
      expect(request.requester).to.equal(user1.address);
      expect(request.amountGrams).to.equal(ethers.parseEther("199"));
      expect(request.feePaid).to.equal(ethers.parseEther("1"));
    });

    it("should revert redemption below minimum", async function () {
      await expect(
        gtkToken.connect(user1).requestRedemption(
          ethers.parseEther("50"),
          "Rua Teste"
        )
      ).to.be.revertedWith("GTK: below minimum");
    });

    it("should process redemption by custodian", async function () {
      await gtkToken.connect(user1).requestRedemption(
        ethers.parseEther("200"),
        "Rua Teste, 123"
      );

      await gtkToken.connect(custodian).processRedemption(0);
      const request = await gtkToken.redemptionRequests(0);
      expect(request.processed).to.be.true;
    });

    it("should revert stale price redemption", async function () {
      await network.provider.send("evm_increaseTime", [7200]);
      await network.provider.send("evm_mine");

      await expect(
        gtkToken.connect(user1).requestRedemption(
          ethers.parseEther("200"),
          "Rua Teste"
        )
      ).to.be.revertedWith("GTK: stale price");
    });
  });

  describe("Compliance", function () {
    it("should toggle blacklist", async function () {
      await gtkToken.connect(compliance).setBlacklist(user1.address, true);
      expect(await gtkToken.blacklisted(user1.address)).to.be.true;

      await gtkToken.connect(compliance).setBlacklist(user1.address, false);
      expect(await gtkToken.blacklisted(user1.address)).to.be.false;
    });

    it("should set KYC tiers", async function () {
      await gtkToken.connect(compliance).setKycTier(attacker.address, 2);
      expect(await gtkToken.kycTier(attacker.address)).to.equal(2);
    });

    it("should revert invalid KYC tier", async function () {
      await expect(
        gtkToken.connect(compliance).setKycTier(attacker.address, 4)
      ).to.be.revertedWith("GTK: invalid tier");
    });
  });

  describe("Pause", function () {
    it("should pause and unpause", async function () {
      await gtkToken.connect(pauser).pause();
      expect(await gtkToken.paused()).to.be.true;

      await gtkToken.connect(pauser).unpause();
      expect(await gtkToken.paused()).to.be.false;
    });

    it("should block mint when paused", async function () {
      await gtkToken.connect(pauser).pause();
      await expect(
        gtkToken.connect(minter).mint(
          user1.address, ethers.parseEther("100"),
          ethers.parseEther("100"),
          ethers.encodeBytes32String("DEP001")
        )
      ).to.be.reverted;
    });
  });

  describe("Reserve Ratio", function () {
    it("should be fully backed initially", async function () {
      expect(await gtkToken.isFullyBacked()).to.be.true;
    });

    it("should maintain backing after mint", async function () {
      await gtkToken.connect(custodian).depositGold(
        ethers.encodeBytes32String("BAR001"),
        ethers.parseEther("1000"),
        9999,
        "Vault"
      );
      await gtkToken.connect(minter).mint(
        user1.address, ethers.parseEther("500"),
        ethers.parseEther("500"),
        ethers.encodeBytes32String("DEP001")
      );

      expect(await gtkToken.isFullyBacked()).to.be.true;
      expect(await gtkToken.getReserveRatio()).to.equal(20000);
    });
  });

  describe("USD Value", function () {
    it("should calculate token value in USD", async function () {
      const amount = ethers.parseEther("10");
      const value = await gtkToken.getTokenValueInUSD(amount);
      expect(value).to.equal(650n * 10n ** 8n);
    });
  });

  describe("Upgradeability", function () {
    it("should upgrade implementation", async function () {
      const GTKTokenV2 = await ethers.getContractFactory("GTKToken");
      await upgrades.upgradeProxy(await gtkToken.getAddress(), GTKTokenV2);

      await gtkToken.connect(owner).upgradeVersion();
      expect(await gtkToken.version()).to.equal(2);
    });

    it("should reject unauthorized upgrade", async function () {
      const GTKTokenV2 = await ethers.getContractFactory("GTKToken", attacker);
      await expect(
        upgrades.upgradeProxy(await gtkToken.getAddress(), GTKTokenV2)
      ).to.be.reverted;
    });
  });

  describe("Security", function () {
    it("should reject unauthorized mint", async function () {
      await expect(
        gtkToken.connect(attacker).mint(
          attacker.address, ethers.parseEther("1000"),
          ethers.parseEther("1000"),
          ethers.encodeBytes32String("DEP001")
        )
      ).to.be.reverted;
    });

    it("should reject unauthorized custody withdrawal", async function () {
      await expect(
        gtkToken.connect(attacker).withdrawGold(
          ethers.encodeBytes32String("BAR001"),
          "theft"
        )
      ).to.be.reverted;
    });
  });
});
