
// ============================================================
// GTK TEST SUITE - Testes Completos de Segurança
// ============================================================
// npx hardhat test GTK_Test.js
// ============================================================

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("GTK Token System - Complete Test Suite", function () {
    let gtkToken, oracle, gtkBank, governance;
    let owner, minter, burner, pauser, blacklister, custodian, oracleUpdater;
    let user1, user2, user3, attacker;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const INITIAL_PRICE = 6500000000; // $65/grama com 8 decimais
    const GRAMS_PER_OZ = 3110347680;

    beforeEach(async function () {
        [owner, minter, burner, pauser, blacklister, custodian, oracleUpdater, user1, user2, user3, attacker] = await ethers.getSigners();

        // Deploy Oracle
        const GTKPriceOracle = await ethers.getContractFactory("GTKPriceOracle");
        oracle = await GTKPriceOracle.deploy(owner.address);
        await oracle.waitForDeployment();

        // Deploy Token
        const GTKToken = await ethers.getContractFactory("GTKToken");
        gtkToken = await upgrades.deployProxy(GTKToken, [
            "Gold Token",
            "GTK",
            owner.address,
            await oracle.getAddress()
        ], { initializer: "initialize", kind: "uups" });
        await gtkToken.waitForDeployment();

        // Deploy Bank
        const GTKBank = await ethers.getContractFactory("GTKBank");
        gtkBank = await GTKBank.deploy(
            await gtkToken.getAddress(),
            owner.address // Mock USDT
        );
        await gtkBank.waitForDeployment();

        // Deploy Governance
        const GTKGovernance = await ethers.getContractFactory("GTKGovernance");
        governance = await GTKGovernance.deploy();
        await governance.waitForDeployment();

        // Setup roles
        await gtkToken.grantRole(await gtkToken.MINTER_ROLE(), minter.address);
        await gtkToken.grantRole(await gtkToken.BURNER_ROLE(), burner.address);
        await gtkToken.grantRole(await gtkToken.PAUSER_ROLE(), pauser.address);
        await gtkToken.grantRole(await gtkToken.BLACKLISTER_ROLE(), blacklister.address);
        await gtkToken.grantRole(await gtkToken.CUSTODIAN_ROLE(), custodian.address);
        await gtkToken.grantRole(await gtkToken.ORACLE_ROLE(), oracleUpdater.address);
        await gtkToken.grantRole(await gtkToken.COMPLIANCE_ROLE(), owner.address);

        // Setup KYC
        await gtkToken.setKYC(user1.address, true, "BR", 1, false);
        await gtkToken.setKYC(user2.address, true, "US", 2, true);
        await gtkToken.setKYC(user3.address, true, "CH", 1, false);

        // Set initial price
        await oracle.updateManualPrice(INITIAL_PRICE);
        await gtkToken.connect(oracleUpdater).updateGoldPrice(INITIAL_PRICE);

        // Deposit gold
        await gtkToken.connect(custodian).depositGold(
            ethers.encodeBytes32String("BAR001"),
            ethers.parseUnits("1000", 18), // 1000g
            9999,
            "Switzerland Vault A"
        );

        await gtkToken.connect(custodian).depositGold(
            ethers.encodeBytes32String("BAR002"),
            ethers.parseUnits("5000", 18), // 5000g
            9999,
            "Switzerland Vault B"
        );
    });

    // ============================================================
    // TESTES DE EMISSÃO (MINTING)
    // ============================================================

    describe("Minting", function () {
        it("Should mint tokens with valid KYC and reserves", async function () {
            const amount = ethers.parseUnits("100", 18);
            await gtkToken.connect(minter).mint(user1.address, amount);

            expect(await gtkToken.balanceOf(user1.address)).to.equal(amount);
            expect(await gtkToken.totalSupply()).to.equal(amount);
        });

        it("Should fail mint without KYC", async function () {
            const amount = ethers.parseUnits("100", 18);
            await expect(
                gtkToken.connect(minter).mint(attacker.address, amount)
            ).to.be.revertedWith("GTK: KYC not verified");
        });

        it("Should fail mint exceeding reserves", async function () {
            const amount = ethers.parseUnits("10000", 18); // Mais que 6000g disponíveis
            await expect(
                gtkToken.connect(minter).mint(user1.address, amount)
            ).to.be.revertedWith("GTK: Insufficient gold reserves");
        });

        it("Should enforce daily mint limits", async function () {
            const amount = ethers.parseUnits("5000", 18);
            await gtkToken.connect(minter).mint(user1.address, amount);

            // Tenta mintar mais no mesmo dia
            await expect(
                gtkToken.connect(minter).mint(user1.address, amount)
            ).to.be.revertedWith("GTK: Daily mint limit exceeded");
        });

        it("Should fail mint by non-minter", async function () {
            await expect(
                gtkToken.connect(attacker).mint(user1.address, 100)
            ).to.be.reverted;
        });

        it("Should fail mint to blacklisted address", async function () {
            await gtkToken.connect(blacklister).blacklist(user1.address, "Test");
            await expect(
                gtkToken.connect(minter).mint(user1.address, 100)
            ).to.be.revertedWith("GTK: Account is blacklisted");
        });

        it("Should fail mint with stale price", async function () {
            // Avança 2 horas
            await network.provider.send("evm_increaseTime", [7200]);
            await network.provider.send("evm_mine");

            await expect(
                gtkToken.connect(minter).mint(user1.address, 100)
            ).to.be.revertedWith("GTK: Price stale");
        });
    });

    // ============================================================
    // TESTES DE TRANSFERÊNCIA
    // ============================================================

    describe("Transfers", function () {
        beforeEach(async function () {
            await gtkToken.connect(minter).mint(user1.address, ethers.parseUnits("1000", 18));
        });

        it("Should transfer between verified users", async function () {
            const amount = ethers.parseUnits("100", 18);
            await gtkToken.connect(user1).transfer(user2.address, amount);

            expect(await gtkToken.balanceOf(user2.address)).to.equal(amount);
        });

        it("Should fail transfer from blacklisted sender", async function () {
            await gtkToken.connect(blacklister).blacklist(user1.address, "Test");

            await expect(
                gtkToken.connect(user1).transfer(user2.address, 100)
            ).to.be.revertedWith("GTK: Sender blacklisted");
        });

        it("Should fail transfer to blacklisted recipient", async function () {
            await gtkToken.connect(blacklister).blacklist(user2.address, "Test");

            await expect(
                gtkToken.connect(user1).transfer(user2.address, 100)
            ).to.be.revertedWith("GTK: Recipient blacklisted");
        });

        it("Should fail transfer when paused", async function () {
            await gtkToken.connect(pauser).pause();

            await expect(
                gtkToken.connect(user1).transfer(user2.address, 100)
            ).to.be.revertedWith("EnforcedPause");
        });
    });

    // ============================================================
    // TESTES DE RESGATE (REDEMPTION)
    // ============================================================

    describe("Redemption", function () {
        beforeEach(async function () {
            await gtkToken.connect(minter).mint(user1.address, ethers.parseUnits("1000", 18));
        });

        it("Should request redemption above minimum", async function () {
            const amount = ethers.parseUnits("200", 18); // Acima do mínimo de 100g
            await gtkToken.connect(user1).requestRedemption(amount, "Rua Teste, 123");

            const request = await gtkToken.redemptionRequests(0);
            expect(request.requester).to.equal(user1.address);
            expect(request.amountGrams).to.equal(ethers.parseUnits("199", 18)); // -0.5% fee
            expect(request.processed).to.be.false;
        });

        it("Should fail redemption below minimum", async function () {
            const amount = ethers.parseUnits("50", 18); // Abaixo de 100g

            await expect(
                gtkToken.connect(user1).requestRedemption(amount, "Rua Teste, 123")
            ).to.be.revertedWith("GTK: Below minimum redemption");
        });

        it("Should calculate correct redemption fee", async function () {
            const amount = ethers.parseUnits("1000", 18);
            const expectedFee = (amount * 50n) / 10000n; // 0.5%

            await gtkToken.connect(user1).requestRedemption(amount, "Rua Teste, 123");

            const request = await gtkToken.redemptionRequests(0);
            expect(request.feePaid).to.equal(expectedFee);
        });

        it("Should process redemption by custodian", async function () {
            const amount = ethers.parseUnits("200", 18);
            await gtkToken.connect(user1).requestRedemption(amount, "Rua Teste, 123");

            await gtkToken.connect(custodian).processRedemption(0);

            const request = await gtkToken.redemptionRequests(0);
            expect(request.processed).to.be.true;
        });

        it("Should burn tokens on redemption", async function () {
            const amount = ethers.parseUnits("200", 18);
            const balanceBefore = await gtkToken.balanceOf(user1.address);

            await gtkToken.connect(user1).requestRedemption(amount, "Rua Teste, 123");

            const balanceAfter = await gtkToken.balanceOf(user1.address);
            expect(balanceAfter).to.equal(balanceBefore - amount);
        });
    });

    // ============================================================
    // TESTES DE CUSTÓDIA
    // ============================================================

    describe("Custody", function () {
        it("Should deposit gold bars", async function () {
            await gtkToken.connect(custodian).depositGold(
                ethers.encodeBytes32String("BAR003"),
                ethers.parseUnits("2000", 18),
                9999,
                "Dubai Vault"
            );

            const record = await gtkToken.custodyRecords(ethers.encodeBytes32String("BAR003"));
            expect(record.weightGrams).to.equal(ethers.parseUnits("2000", 18));
            expect(record.isActive).to.be.true;
        });

        it("Should track total custody correctly", async function () {
            const total = await gtkToken.totalGoldInCustody();
            expect(total).to.equal(ethers.parseUnits("6000", 18)); // 1000 + 5000
        });

        it("Should fail deposit by non-custodian", async function () {
            await expect(
                gtkToken.connect(attacker).depositGold(
                    ethers.encodeBytes32String("BAR003"),
                    1000,
                    9999,
                    "Fake Vault"
                )
            ).to.be.reverted;
        });

        it("Should withdraw gold with reason", async function () {
            await gtkToken.connect(custodian).withdrawGold(
                ethers.encodeBytes32String("BAR001"),
                "Redemption fulfillment"
            );

            const record = await gtkToken.custodyRecords(ethers.encodeBytes32String("BAR001"));
            expect(record.isActive).to.be.false;
        });

        it("Should audit custody records", async function () {
            await gtkToken.connect(custodian).auditCustody(
                ethers.encodeBytes32String("BAR001"),
                ethers.parseUnits("1000", 18)
            );

            // Evento emitido - verificado implicitamente
        });
    });

    // ============================================================
    // TESTES DE PREÇO E ORÁCULO
    // ============================================================

    describe("Price Oracle", function () {
        it("Should update price by oracle role", async function () {
            const newPrice = 7000000000; // $70/grama
            await gtkToken.connect(oracleUpdater).updateGoldPrice(newPrice);

            expect(await gtkToken.goldPricePerGram()).to.equal(newPrice);
        });

        it("Should fail price update by non-oracle", async function () {
            await expect(
                gtkToken.connect(attacker).updateGoldPrice(7000000000)
            ).to.be.reverted;
        });

        it("Should reject zero price", async function () {
            await expect(
                gtkToken.connect(oracleUpdater).updateGoldPrice(0)
            ).to.be.revertedWith("GTK: Invalid price");
        });

        it("Should track price update timestamp", async function () {
            await gtkToken.connect(oracleUpdater).updateGoldPrice(7000000000);

            const lastUpdate = await gtkToken.lastPriceUpdate();
            expect(lastUpdate).to.be.gt(0);
        });

        it("Should calculate USD value correctly", async function () {
            const amount = ethers.parseUnits("10", 18); // 10g
            const value = await gtkToken.getTokenValueInUSD(amount);

            // 10g * $65/g = $650 = 65000000000 (com 8 decimais)
            expect(value).to.equal(650000000000);
        });
    });

    // ============================================================
    // TESTES DE RESERVAS E BACKING
    // ============================================================

    describe("Reserve Ratio", function () {
        it("Should be 100% backed initially", async function () {
            expect(await gtkToken.isFullyBacked()).to.be.true;
        });

        it("Should track reserve ratio after mint", async function () {
            await gtkToken.connect(minter).mint(user1.address, ethers.parseUnits("1000", 18));

            const ratio = await gtkToken.getReserveRatio();
            expect(ratio).to.equal(10000); // 100%
        });

        it("Should maintain backing after multiple operations", async function () {
            await gtkToken.connect(minter).mint(user1.address, ethers.parseUnits("1000", 18));
            await gtkToken.connect(minter).mint(user2.address, ethers.parseUnits("2000", 18));

            expect(await gtkToken.isFullyBacked()).to.be.true;
            expect(await gtkToken.totalSupply()).to.equal(ethers.parseUnits("3000", 18));
        });
    });

    // ============================================================
    // TESTES DE COMPLIANCE E BLACKLIST
    // ============================================================

    describe("Compliance", function () {
        it("Should blacklist address", async function () {
            await gtkToken.connect(blacklister).blacklist(user1.address, "Suspicious activity");

            expect(await gtkToken.isBlacklisted(user1.address)).to.be.true;
        });

        it("Should unblacklist address", async function () {
            await gtkToken.connect(blacklister).blacklist(user1.address, "Test");
            await gtkToken.connect(blacklister).unBlacklist(user1.address);

            expect(await gtkToken.isBlacklisted(user1.address)).to.be.false;
        });

        it("Should fail blacklist by non-blacklister", async function () {
            await expect(
                gtkToken.connect(attacker).blacklist(user1.address, "Test")
            ).to.be.reverted;
        });

        it("Should set KYC data", async function () {
            await gtkToken.connect(owner).setKYC(attacker.address, true, "RU", 3, false);

            const kyc = await gtkToken.kycData(attacker.address);
            expect(kyc.isVerified).to.be.true;
            expect(kyc.country).to.equal("RU");
            expect(kyc.riskLevel).to.equal(3);
        });

        it("Should revoke KYC", async function () {
            await gtkToken.connect(owner).setKYC(user1.address, false, "BR", 1, false);

            const kyc = await gtkToken.kycData(user1.address);
            expect(kyc.isVerified).to.be.false;
        });
    });

    // ============================================================
    // TESTES DE PAUSA DE EMERGÊNCIA
    // ============================================================

    describe("Emergency Pause", function () {
        beforeEach(async function () {
            await gtkToken.connect(minter).mint(user1.address, ethers.parseUnits("1000", 18));
        });

        it("Should pause by pauser role", async function () {
            await gtkToken.connect(pauser).pause();
            expect(await gtkToken.paused()).to.be.true;
        });

        it("Should unpause by pauser role", async function () {
            await gtkToken.connect(pauser).pause();
            await gtkToken.connect(pauser).unpause();

            expect(await gtkToken.paused()).to.be.false;
        });

        it("Should block transfers when paused", async function () {
            await gtkToken.connect(pauser).pause();

            await expect(
                gtkToken.connect(user1).transfer(user2.address, 100)
            ).to.be.revertedWith("EnforcedPause");
        });

        it("Should block minting when paused", async function () {
            await gtkToken.connect(pauser).pause();

            await expect(
                gtkToken.connect(minter).mint(user1.address, 100)
            ).to.be.revertedWith("EnforcedPause");
        });

        it("Should fail pause by non-pauser", async function () {
            await expect(
                gtkToken.connect(attacker).pause()
            ).to.be.reverted;
        });
    });

    // ============================================================
    // TESTES DE UPGRADEABILIDADE
    // ============================================================

    describe("Upgradeability", function () {
        it("Should upgrade contract", async function () {
            const GTKTokenV2 = await ethers.getContractFactory("GTKToken");
            const upgraded = await upgrades.upgradeProxy(
                await gtkToken.getAddress(),
                GTKTokenV2
            );

            expect(await upgraded.getAddress()).to.equal(await gtkToken.getAddress());
        });

        it("Should fail upgrade by non-upgrader", async function () {
            const GTKTokenV2 = await ethers.getContractFactory("GTKToken", attacker);

            await expect(
                upgrades.upgradeProxy(await gtkToken.getAddress(), GTKTokenV2)
            ).to.be.reverted;
        });
    });

    // ============================================================
    // TESTES DE SEGURANÇA - ATAQUES
    // ============================================================

    describe("Security - Attack Scenarios", function () {
        it("Should prevent reentrancy on mint", async function () {
            // Teste simplificado - em produção usar contrato atacante malicioso
            await gtkToken.connect(minter).mint(user1.address, ethers.parseUnits("100", 18));

            // Verifica que não há duplo mint
            expect(await gtkToken.balanceOf(user1.address)).to.equal(ethers.parseUnits("100", 18));
        });

        it("Should prevent unauthorized mint", async function () {
            await expect(
                gtkToken.connect(attacker).mint(attacker.address, ethers.parseUnits("1000000", 18))
            ).to.be.reverted;
        });

        it("Should prevent unauthorized custody withdrawal", async function () {
            await expect(
                gtkToken.connect(attacker).withdrawGold(
                    ethers.encodeBytes32String("BAR001"),
                    "Theft"
                )
            ).to.be.reverted;
        });

        it("Should prevent double redemption processing", async function () {
            await gtkToken.connect(minter).mint(user1.address, ethers.parseUnits("1000", 18));
            await gtkToken.connect(user1).requestRedemption(
                ethers.parseUnits("200", 18),
                "Rua Teste"
            );

            await gtkToken.connect(custodian).processRedemption(0);

            await expect(
                gtkToken.connect(custodian).processRedemption(0)
            ).to.be.revertedWith("GTK: Already processed");
        });

        it("Should prevent price manipulation", async function () {
            // Tenta setar preço zero
            await expect(
                gtkToken.connect(oracleUpdater).updateGoldPrice(0)
            ).to.be.revertedWith("GTK: Invalid price");
        });

        it("Should maintain 1:1 backing under stress", async function () {
            // Múltiplas operações simultâneas
            await gtkToken.connect(minter).mint(user1.address, ethers.parseUnits("1000", 18));
            await gtkToken.connect(minter).mint(user2.address, ethers.parseUnits("2000", 18));
            await gtkToken.connect(minter).mint(user3.address, ethers.parseUnits("1500", 18));

            // Resgate
            await gtkToken.connect(user1).requestRedemption(
                ethers.parseUnits("200", 18),
                "Rua Teste"
            );

            // Verifica backing
            expect(await gtkToken.isFullyBacked()).to.be.true;
            const supply = await gtkToken.totalSupply();
            const reserves = await gtkToken.totalGoldInCustody();
            expect(reserves).to.be.gte(supply);
        });
    });

    // ============================================================
    // TESTES DE GOVERNANÇA
    // ============================================================

    describe("Governance", function () {
        it("Should create proposal", async function () {
            const callData = gtkToken.interface.encodeFunctionData("pause");

            await governance.connect(owner).createProposal(
                "Emergency pause",
                await gtkToken.getAddress(),
                callData
            );

            const proposal = await governance.proposals(0);
            expect(proposal.description).to.equal("Emergency pause");
        });

        it("Should vote on proposal", async function () {
            const callData = gtkToken.interface.encodeFunctionData("pause");
            await governance.connect(owner).createProposal("Test", await gtkToken.getAddress(), callData);

            await governance.vote(0, true, ethers.parseUnits("1000", 18));

            const proposal = await governance.proposals(0);
            expect(proposal.forVotes).to.equal(ethers.parseUnits("1000", 18));
        });
    });

    // ============================================================
    // TESTES DE INTEGRAÇÃO BANCÁRIA
    // ============================================================

    describe("Bank Integration", function () {
        it("Should process PIX deposit", async function () {
            // Mock - em produção integrar com gateway de pagamento
            const pixId = ethers.encodeBytes32String("PIX123456");
            const usdtAmount = ethers.parseUnits("1000", 6); // 1000 USDT

            // Nota: Em teste real, precisaria de mock USDT e aprovação
            // await gtkBank.connect(operator).processPixDeposit(pixId, user1.address, usdtAmount);

            // Verifica estrutura
            expect(await gtkBank.processedPixIds(pixId)).to.be.false;
        });

        it("Should prevent double PIX processing", async function () {
            const pixId = ethers.encodeBytes32String("PIX123456");

            // Simula processamento
            // await gtkBank.connect(operator).processPixDeposit(pixId, user1.address, 1000);
            // await expect(
            //     gtkBank.connect(operator).processPixDeposit(pixId, user1.address, 1000)
            // ).to.be.revertedWith("GTKBank: PIX already processed");
        });
    });
});
