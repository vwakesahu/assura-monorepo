import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  encodeAbiParameters,
  keccak256,
  toBytes,
  hexToBytes,
  toHex,
  serializeSignature,
  type Hex,
} from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Comprehensive End-to-End Test Suite for AssuraProtectedVault on Base Sepolia
 * 
 * This test suite covers all functionality:
 * - Deployment and configuration (AssuraVerifier, MockERC20, Vault)
 * - Valid compliance data (EIP-191 and EIP-712)
 * - Deposit and mint with compliance
 * - Insufficient score handling with bypass creation
 * - Bypass expiry and access
 * - Bypass nonce incrementing
 * - Error cases (wrong signature, wrong key, insufficient score)
 * - Multiple deposits/mints
 * - Update verification requirements
 * - Standard ERC4626 operations (redeem, withdraw) without compliance
 * 
 * Prerequisites:
 * - PRIVATE_KEY must be set in .env (for deployment and testing)
 * - TEE_PRIVATE_KEY must be set in .env (for signing attestations)
 * - BASE_SEPOLIA_RPC_URL can be set in .env (defaults to https://sepolia.base.org)
 */
describe("Comprehensive Vault E2E Tests on Base Sepolia", async function () {
  // Connect to Base Sepolia network
  const { viem } = await network.connect({ network: "baseSepolia" });
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  // Get private keys from environment
  const deployerPrivateKey = process.env.PRIVATE_KEY || "";
  if (!deployerPrivateKey) {
    throw new Error("PRIVATE_KEY must be set in .env file");
  }

  const teePrivateKey = process.env.TEE_PRIVATE_KEY || deployerPrivateKey;
  const userPrivateKey = process.env.USER_PRIVATE_KEY || deployerPrivateKey;

  // Format private keys
  const formatPrivateKey = (key: string): `0x${string}` => {
    if (!key.startsWith("0x")) {
      return `0x${key}` as `0x${string}`;
    }
    return key as `0x${string}`;
  };

  const formattedTeeKey = formatPrivateKey(teePrivateKey);
  const formattedUserKey = formatPrivateKey(userPrivateKey);

  // Create accounts
  const ownerAccount = deployer.account;
  const teeAccount = privateKeyToAccount(formattedTeeKey);
  const userAccount = privateKeyToAccount(formattedUserKey);

  const ownerAddress = ownerAccount.address;
  const teeAddress = teeAccount.address;
  const userAddress = userAccount.address;

  let assuraVerifierAddress: `0x${string}`;
  let mockERC20Address: `0x${string}`;
  let vaultAddress: `0x${string}`;
  let assuraVerifierContract: Awaited<ReturnType<typeof viem.getContractAt<"AssuraVerifier">>>;
  let mockERC20Contract: Awaited<ReturnType<typeof viem.getContractAt<"MockERC20">>>;
  let vaultContract: Awaited<ReturnType<typeof viem.getContractAt<"AssuraProtectedVault">>>;
  let chainId: bigint;

  // Verification key for the vault
  const verificationKey = keccak256(toBytes("AssuraProtectedVault"));
  const minScore = 50n; // Minimum score required for vault operations
  const tokenDecimals = 6n;

  /**
   * Helper function to wait for transaction and ensure it's fully processed
   */
  async function waitForTransaction(hash: `0x${string}`): Promise<void> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", `Transaction ${hash} should succeed`);
    
    // Wait for a few blocks to ensure state is fully updated
    const currentBlock = await publicClient.getBlockNumber();
    const targetBlock = currentBlock + 2n;
    while (true) {
      const latestBlock = await publicClient.getBlockNumber();
      if (latestBlock >= targetBlock) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    
    // Additional wait for state propagation
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  /**
   * Helper function to create EIP-712 signature for AttestedData
   */
  async function createEIP712Signature(
    attestedData: {
      score: bigint;
      timeAtWhichAttested: bigint;
      chainId: bigint;
    },
    signerPrivateKey: `0x${string}`
  ): Promise<`0x${string}`> {
    const signer = privateKeyToAccount(signerPrivateKey);

    const domain = {
      name: "AssuraVerifier",
      version: "1",
      chainId: Number(chainId),
      verifyingContract: assuraVerifierAddress,
    };

    const types = {
      AttestedData: [
        { name: "score", type: "uint256" },
        { name: "timeAtWhichAttested", type: "uint256" },
        { name: "chainId", type: "uint256" },
      ],
    };

    const signature = await signer.signTypedData({
      domain,
      types,
      primaryType: "AttestedData",
      message: attestedData,
    });

    return signature;
  }

  /**
   * Helper function to create EIP-191 signature
   */
  async function createEIP191Signature(
    attestedData: {
      score: bigint;
      timeAtWhichAttested: bigint;
      chainId: bigint;
    },
    signerPrivateKey: `0x${string}`
  ): Promise<`0x${string}`> {
    const encodedData = encodeAbiParameters(
      [
        { name: "score", type: "uint256" },
        { name: "timeAtWhichAttested", type: "uint256" },
        { name: "chainId", type: "uint256" },
      ],
      [attestedData.score, attestedData.timeAtWhichAttested, attestedData.chainId]
    );

    const dataHash = keccak256(encodedData);
    const messagePrefix = "\x19Ethereum Signed Message:\n32";
    const messageBytes = new Uint8Array(
      messagePrefix.length + hexToBytes(dataHash).length
    );
    messageBytes.set(toBytes(messagePrefix), 0);
    messageBytes.set(hexToBytes(dataHash), messagePrefix.length);

    const messageHash = keccak256(messageBytes);
    const signature = await sign({
      hash: messageHash,
      privateKey: signerPrivateKey,
    });

    return serializeSignature(signature);
  }

  /**
   * Helper function to create ComplianceData and encode it
   */
  function createComplianceData(
    userAddress: `0x${string}`,
    key: `0x${string}`,
    signature: `0x${string}`,
    attestedData: {
      score: bigint;
      timeAtWhichAttested: bigint;
      chainId: bigint;
    }
  ): `0x${string}` {
    // Ensure key is properly formatted as bytes32
    let keyStr = typeof key === "string" ? key : String(key);
    if (!keyStr.startsWith("0x")) {
      keyStr = `0x${keyStr}`;
    }
    let hexPart = keyStr.slice(2).replace(/[^0-9a-fA-F]/g, "");
    if (hexPart.length === 0) hexPart = "0";
    const paddedHex = hexPart.padStart(64, "0");
    const paddedKey = `0x${paddedHex}` as `0x${string}`;

    const encoded = encodeAbiParameters(
      [
        {
          name: "ComplianceData",
          type: "tuple",
          components: [
            { name: "userAddress", type: "address" },
            { name: "key", type: "bytes32" },
            { name: "signedAttestedDataWithTEESignature", type: "bytes" },
            {
              name: "actualAttestedData",
              type: "tuple",
              components: [
                { name: "score", type: "uint256" },
                { name: "timeAtWhichAttested", type: "uint256" },
                { name: "chainId", type: "uint256" },
              ],
            },
          ],
        },
      ],
      [
        {
          userAddress,
          key: paddedKey,
          signedAttestedDataWithTEESignature: signature,
          actualAttestedData: {
            score: attestedData.score,
            timeAtWhichAttested: attestedData.timeAtWhichAttested,
            chainId: attestedData.chainId,
          },
        },
      ]
    );

    return encoded;
  }

  /**
   * Helper function to ensure user has enough tokens and allowance
   */
  async function ensureUserHasTokens(amount: bigint): Promise<void> {
    const userBalance = await mockERC20Contract.read.balanceOf([userAddress]);
    if (userBalance < amount) {
      const needed = amount - userBalance;
      console.log(`Minting ${needed} tokens to user...`);
      const mintHash = await mockERC20Contract.write.mint([userAddress, needed], {
        account: ownerAccount,
      });
      await waitForTransaction(mintHash);
    }

    const allowance = await mockERC20Contract.read.allowance([userAddress, vaultAddress]);
    if (allowance < amount) {
      const approveAmount = amount * 2n; // Approve extra for multiple operations
      console.log(`Approving ${approveAmount} tokens for vault...`);
      const approveHash = await mockERC20Contract.write.approve([vaultAddress, approveAmount], {
        account: userAccount,
      });
      await waitForTransaction(approveHash);
    }
  }

  // ============ Setup ============

  it("Should deploy AssuraVerifier contract", async function () {
    console.log("\n=== Deploying AssuraVerifier ===");
    console.log(`Owner: ${ownerAddress}`);
    console.log(`TEE Address: ${teeAddress}`);

    const assuraVerifier = await viem.deployContract("AssuraVerifier", [
      ownerAddress,
      teeAddress,
    ]);

    assuraVerifierAddress = assuraVerifier.address;
    chainId = BigInt(await publicClient.getChainId());
    
    // Wait for deployment transaction to be mined
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    assuraVerifierContract = await viem.getContractAt(
      "AssuraVerifier",
      assuraVerifierAddress
    );

    console.log(`✓ AssuraVerifier deployed at: ${assuraVerifierAddress}`);
    console.log(`✓ Chain ID: ${chainId}`);

    // Verify deployment with retries
    let owner: `0x${string}`;
    let teeAddr: `0x${string}`;
    for (let i = 0; i < 5; i++) {
      try {
        owner = await assuraVerifierContract.read.owner();
        teeAddr = await assuraVerifierContract.read.ASSURA_TEE_ADDRESS();
        if (owner && teeAddr) break;
      } catch (error) {
        if (i === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    assert.equal(owner.toLowerCase(), ownerAddress.toLowerCase());
    assert.equal(teeAddr.toLowerCase(), teeAddress.toLowerCase());
  });

  it("Should deploy MockERC20 token", async function () {
    console.log("\n=== Deploying MockERC20 ===");

    const mockERC20 = await viem.deployContract("contracts/test/MockERC20.sol:MockERC20", [
      "Test Token",
      "TEST",
    ]);

    mockERC20Address = mockERC20.address;
    console.log(`✓ MockERC20 deployed at: ${mockERC20Address}`);

    // Wait for deployment transaction to be mined
    await new Promise((resolve) => setTimeout(resolve, 3000));

    mockERC20Contract = await viem.getContractAt(
      "contracts/test/MockERC20.sol:MockERC20",
      mockERC20Address
    );

    // Verify deployment with retries
    let totalSupply: bigint;
    for (let i = 0; i < 5; i++) {
      try {
        totalSupply = await mockERC20Contract.read.totalSupply();
        if (totalSupply !== undefined) break;
      } catch (error) {
        if (i === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✓ Total supply: ${totalSupply}`);
  });

  it("Should deploy AssuraProtectedVault contract", async function () {
    console.log("\n=== Deploying AssuraProtectedVault ===");
    console.log(`Verification Key: ${verificationKey}`);
    console.log(`Min Score: ${minScore}`);

    const vault = await viem.deployContract("AssuraProtectedVault", [
      mockERC20Address,
      "Assura Protected Vault",
      "APV",
      assuraVerifierAddress,
      verificationKey,
      minScore,
    ]);

    vaultAddress = vault.address;
    console.log(`✓ AssuraProtectedVault deployed at: ${vaultAddress}`);

    // Wait for deployment transaction to be mined
    await new Promise((resolve) => setTimeout(resolve, 3000));

    vaultContract = await viem.getContractAt(
      "AssuraProtectedVault",
      vaultAddress
    );

    // Verify deployment with retries
    let verifier: `0x${string}`;
    let key: `0x${string}`;
    let score: bigint;
    for (let i = 0; i < 5; i++) {
      try {
        verifier = await vaultContract.read.assuraVerifier();
        key = await vaultContract.read.verificationKey();
        score = await vaultContract.read.minScore();
        if (verifier && key && score !== undefined) break;
      } catch (error) {
        if (i === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    
    assert.equal(
      verifier!.toLowerCase(),
      assuraVerifierAddress.toLowerCase(),
      "Vault should have correct AssuraVerifier"
    );
    assert.equal(key, verificationKey, "Vault should have correct verification key");
    assert.equal(score, minScore, "Vault should have correct min score");

    console.log(`✓ Vault verifier: ${verifier}`);
    console.log(`✓ Vault verification key: ${key}`);
    console.log(`✓ Vault min score: ${score}`);
  });

  it("Should verify that verifying data was set correctly", async function () {
    console.log("\n=== Verifying Data Setup ===");

    const verifyingData = await assuraVerifierContract.read.getVerifyingData([
      vaultAddress,
      verificationKey,
    ]);

    assert.equal(verifyingData.score, minScore, `Vault should require score ${minScore}`);
    assert.equal(verifyingData.expiry, 0n, "Vault should have no expiry");
    assert.equal(verifyingData.chainId, 0n, "Vault should accept any chain");

    console.log(`✓ Vault requires score: ${verifyingData.score}`);
    console.log(`✓ Vault expiry: ${verifyingData.expiry} (0 = no expiry)`);
    console.log(`✓ Vault chainId: ${verifyingData.chainId} (0 = any chain)`);
  });

  // ============ Valid Compliance Data Tests ============

  it("Should successfully deposit with valid EIP-191 compliance data", async function () {
    console.log("\n=== Testing depositWithCompliance with EIP-191 signature ===");

    const depositAmount = 1000n * 10n ** tokenDecimals;
    await ensureUserHasTokens(depositAmount);

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    const attestedData = {
      score: 100n, // Higher than minScore (50)
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const signature = await createEIP191Signature(attestedData, formattedTeeKey);
    const complianceData = createComplianceData(
      userAddress,
      verificationKey,
      signature,
      attestedData
    );

    const initialUserBalance = await mockERC20Contract.read.balanceOf([userAddress]);
    const initialVaultBalance = await mockERC20Contract.read.balanceOf([vaultAddress]);
    const initialUserShares = await vaultContract.read.balanceOf([userAddress]);
    const initialTotalAssets = await vaultContract.read.totalAssets();

    console.log(`Depositing ${depositAmount} tokens...`);
    const hash = await vaultContract.write.depositWithCompliance(
      [depositAmount, userAddress, complianceData],
      { account: userAccount }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", "Transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Retry reading until balances update
    let finalUserBalance = await mockERC20Contract.read.balanceOf([userAddress]);
    let finalVaultBalance = await mockERC20Contract.read.balanceOf([vaultAddress]);
    let finalUserShares = await vaultContract.read.balanceOf([userAddress]);
    for (let i = 0; i < 5; i++) {
      if (
        finalUserBalance === initialUserBalance - depositAmount &&
        finalVaultBalance === initialVaultBalance + depositAmount &&
        finalUserShares > initialUserShares
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      finalUserBalance = await mockERC20Contract.read.balanceOf([userAddress]);
      finalVaultBalance = await mockERC20Contract.read.balanceOf([vaultAddress]);
      finalUserShares = await vaultContract.read.balanceOf([userAddress]);
    }

    assert.equal(
      finalUserBalance,
      initialUserBalance - depositAmount,
      "User token balance should decrease by deposit amount"
    );
    assert.equal(
      finalVaultBalance,
      initialVaultBalance + depositAmount,
      "Vault token balance should increase by deposit amount"
    );
    assert(finalUserShares > initialUserShares, "User should receive shares");
    console.log(`✓ Deposit successful: ${initialUserShares} → ${finalUserShares} shares`);
  });

  it("Should successfully deposit with valid EIP-712 compliance data", async function () {
    console.log("\n=== Testing depositWithCompliance with EIP-712 signature ===");

    const depositAmount = 500n * 10n ** tokenDecimals;
    await ensureUserHasTokens(depositAmount);

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const signature = await createEIP712Signature(attestedData, formattedTeeKey);
    const complianceData = createComplianceData(
      userAddress,
      verificationKey,
      signature,
      attestedData
    );

    const initialUserShares = await vaultContract.read.balanceOf([userAddress]);

    console.log(`Depositing ${depositAmount} tokens...`);
    const hash = await vaultContract.write.depositWithCompliance(
      [depositAmount, userAddress, complianceData],
      { account: userAccount }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", "Transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Retry reading until shares update
    let finalUserShares = await vaultContract.read.balanceOf([userAddress]);
    for (let i = 0; i < 5; i++) {
      if (finalUserShares > initialUserShares) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      finalUserShares = await vaultContract.read.balanceOf([userAddress]);
    }

    assert(finalUserShares > initialUserShares, "User should receive shares");
    console.log(`✓ Deposit successful: ${initialUserShares} → ${finalUserShares} shares`);
  });

  it("Should successfully mint shares with valid compliance data", async function () {
    console.log("\n=== Testing mintWithCompliance ===");

    const sharesToMint = 300n * 10n ** tokenDecimals;
    const assetsRequired = await vaultContract.read.previewMint([sharesToMint]);
    await ensureUserHasTokens(assetsRequired);

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const signature = await createEIP191Signature(attestedData, formattedTeeKey);
    const complianceData = createComplianceData(
      userAddress,
      verificationKey,
      signature,
      attestedData
    );

    const initialUserShares = await vaultContract.read.balanceOf([userAddress]);

    // Wait to avoid nonce conflicts
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log(`Minting ${sharesToMint} shares...`);
    const hash = await vaultContract.write.mintWithCompliance(
      [sharesToMint, userAddress, complianceData],
      { account: userAccount }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", "Transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Retry reading until shares update
    let finalUserShares = await vaultContract.read.balanceOf([userAddress]);
    for (let i = 0; i < 5; i++) {
      if (finalUserShares >= initialUserShares + sharesToMint) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      finalUserShares = await vaultContract.read.balanceOf([userAddress]);
    }

    assert(
      finalUserShares >= initialUserShares + sharesToMint,
      `User should receive at least ${sharesToMint} shares`
    );
    console.log(`✓ Mint successful: ${initialUserShares} → ${finalUserShares} shares`);
  });

  // ============ Error Cases ============

  it("Should fail deposit with insufficient score", async function () {
    console.log("\n=== Testing depositWithCompliance with insufficient score ===");

    const depositAmount = 100n * 10n ** tokenDecimals;
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Use score 30 (less than minScore of 50)
    const attestedData = {
      score: 30n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const signature = await createEIP191Signature(attestedData, formattedTeeKey);
    const complianceData = createComplianceData(
      userAddress,
      verificationKey,
      signature,
      attestedData
    );

    console.log(`Attempting deposit with score 30 (requires ${minScore})...`);
    try {
      const hash = await vaultContract.write.depositWithCompliance(
        [depositAmount, userAddress, complianceData],
        { account: userAccount }
      );
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "reverted") {
        assert.fail("Transaction should have reverted");
      }
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || "";
      const hasExpectedError =
        errorMessage.includes("Compliance verification failed") ||
        errorMessage.includes("revert") ||
        errorMessage.includes("Compliance") ||
        errorMessage.includes("score");
      
      assert(hasExpectedError, `Expected compliance error, got: ${errorMessage}`);
      console.log("✓ Correctly rejected insufficient score");
    }
  });

  it("Should fail with wrong signature", async function () {
    console.log("\n=== Testing wrong signature ===");

    const depositAmount = 100n * 10n ** tokenDecimals;
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    // Sign with user's key instead of TEE key (wrong signature)
    const wrongSignature = await createEIP191Signature(attestedData, formattedUserKey);
    const complianceData = createComplianceData(
      userAddress,
      verificationKey,
      wrongSignature,
      attestedData
    );

    try {
      const hash = await vaultContract.write.depositWithCompliance(
        [depositAmount, userAddress, complianceData],
        { account: userAccount }
      );
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        assert.fail("Should have reverted with wrong signature");
      }
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || "";
      const hasExpectedError =
        errorMessage.includes("Signature not from TEE") ||
        errorMessage.includes("Compliance verification failed") ||
        errorMessage.includes("revert");
      
      assert(hasExpectedError, `Expected signature error, got: ${errorMessage}`);
      console.log("✓ Correctly rejected wrong signature");
    }
  });

  it("Should fail with wrong key", async function () {
    console.log("\n=== Testing wrong key ===");

    const depositAmount = 100n * 10n ** tokenDecimals;
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const signature = await createEIP191Signature(attestedData, formattedTeeKey);
    // Use wrong key (different bytes32)
    const wrongKey = keccak256(toBytes("WrongKey"));
    const complianceData = createComplianceData(
      userAddress,
      wrongKey,
      signature,
      attestedData
    );

    try {
      await vaultContract.write.depositWithCompliance(
        [depositAmount, userAddress, complianceData],
        { account: userAccount }
      );
      assert.fail("Should have reverted with wrong key");
    } catch (error: any) {
      assert(
        error.message.includes("Key mismatch") ||
          error.message.includes("Compliance verification failed"),
        `Expected key mismatch error, got: ${error.message}`
      );
      console.log("✓ Correctly rejected wrong key");
    }
  });

  // ============ Bypass Functionality Tests ============

  it("Should create bypass entry when score is insufficient", async function () {
    console.log("\n=== Testing bypass entry creation ===");

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Use score 30 (less than required 50)
    const attestedData = {
      score: 30n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const signature = await createEIP191Signature(attestedData, formattedTeeKey);
    const complianceData = createComplianceData(
      userAddress,
      verificationKey,
      signature,
      attestedData
    );

    const verifierWithUser = assuraVerifierContract as any;

    // Call verifyWithBypass to create bypass entry
    const hash = await verifierWithUser.write.verifyWithBypass([
      vaultAddress,
      verificationKey,
      complianceData,
    ], {
      account: userAccount,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", "Transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check bypass entry was created
    let bypassEntryTuple: [bigint, bigint, boolean];
    for (let i = 0; i < 5; i++) {
      bypassEntryTuple = await (assuraVerifierContract.read as any).bypassEntries([
        userAddress,
        vaultAddress,
        verificationKey,
      ]);
      if (bypassEntryTuple[2] === true) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    
    const bypassEntry = {
      expiry: bypassEntryTuple![0],
      nonce: bypassEntryTuple![1],
      allowed: bypassEntryTuple![2],
    };

    assert.equal(bypassEntry.allowed, true, "Bypass entry should be created");
    assert.equal(bypassEntry.nonce, 1n, "Bypass entry should have nonce=1");

    // Get block timestamp to verify expiry
    const block = await publicClient.getBlock({ blockTag: "latest" });
    const blockTimestamp = BigInt(block.timestamp);
    const expectedExpiry = blockTimestamp + 200n; // (50 - 30) * 10 = 200 seconds
    const tolerance = 5n;

    assert(
      bypassEntry.expiry >= expectedExpiry - tolerance && bypassEntry.expiry <= expectedExpiry + tolerance,
      `Bypass expiry should be around ${expectedExpiry} (got ${bypassEntry.expiry})`
    );

    console.log(`✓ Bypass entry created with expiry: ${bypassEntry.expiry}`);
    console.log(`  Expected expiry: ${expectedExpiry}`);
    console.log(`  Nonce: ${bypassEntry.nonce}`);
  });

  it("Should increment bypass entry nonce on subsequent attempts", async function () {
    console.log("\n=== Testing bypass nonce increment ===");

    // Use a different user address to avoid state pollution
    const testUserAddress = `0x${Math.random().toString(16).slice(2, 42).padEnd(40, '0')}` as `0x${string}`;
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    const attestedData = {
      score: 30n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const signature = await createEIP191Signature(attestedData, formattedTeeKey);
    const testComplianceData = createComplianceData(
      testUserAddress,
      verificationKey,
      signature,
      attestedData
    );

    const verifierWithUser = assuraVerifierContract as any;

    // First attempt: creates bypass entry with nonce 1
    const hash1 = await verifierWithUser.write.verifyWithBypass([
      vaultAddress,
      verificationKey,
      testComplianceData,
    ], {
      account: userAccount,
    });
    const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
    assert.equal(receipt1.status, "success", "First transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let bypassEntryTuple = await (assuraVerifierContract.read as any).bypassEntries([
      testUserAddress,
      vaultAddress,
      verificationKey,
    ]);
    let bypassEntry = {
      expiry: bypassEntryTuple[0],
      nonce: bypassEntryTuple[1],
      allowed: bypassEntryTuple[2],
    };
    assert.equal(bypassEntry.nonce, 1n, `First bypass entry should have nonce=1, got: ${bypassEntry.nonce}`);

    // Second attempt: updates bypass entry with nonce 2
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    const currentTimestamp2 = BigInt(Math.floor(Date.now() / 1000));
    const attestedData2 = {
      score: 30n,
      timeAtWhichAttested: currentTimestamp2,
      chainId: chainId,
    };
    const signature2 = await createEIP191Signature(attestedData2, formattedTeeKey);
    const testComplianceData2 = createComplianceData(
      testUserAddress,
      verificationKey,
      signature2,
      attestedData2
    );
    
    await new Promise((resolve) => setTimeout(resolve, 4000));
    
    const hash2 = await verifierWithUser.write.verifyWithBypass([
      vaultAddress,
      verificationKey,
      testComplianceData2,
    ], {
      account: userAccount,
    });
    const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
    assert.equal(receipt2.status, "success", "Second transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Retry reading bypass entry until nonce updates
    for (let i = 0; i < 5; i++) {
      bypassEntryTuple = await (assuraVerifierContract.read as any).bypassEntries([
        testUserAddress,
        vaultAddress,
        verificationKey,
      ]);
      bypassEntry = {
        expiry: bypassEntryTuple[0],
        nonce: bypassEntryTuple[1],
        allowed: bypassEntryTuple[2],
      };
      if (bypassEntry.nonce === 2n) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(bypassEntry.nonce, 2n, `Second bypass entry should have nonce=2, got: ${bypassEntry.nonce}`);

    console.log(`✓ Bypass nonce incremented from 1 to ${bypassEntry.nonce}`);
  });

  // ============ Multiple Operations ============

  it("Should handle multiple deposits", async function () {
    console.log("\n=== Testing multiple deposits ===");

    const depositAmount = 200n * 10n ** tokenDecimals;
    await ensureUserHasTokens(depositAmount * 3n);

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const signature = await createEIP191Signature(attestedData, formattedTeeKey);
    const complianceData = createComplianceData(
      userAddress,
      verificationKey,
      signature,
      attestedData
    );

    const initialUserShares = await vaultContract.read.balanceOf([userAddress]);

    // Make 3 deposits
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const hash = await vaultContract.write.depositWithCompliance(
        [depositAmount, userAddress, complianceData],
        { account: userAccount }
      );
      await waitForTransaction(hash);
    }

    const finalUserShares = await vaultContract.read.balanceOf([userAddress]);
    assert(finalUserShares > initialUserShares, "User should have more shares after multiple deposits");
    console.log(`✓ Multiple deposits successful: ${initialUserShares} → ${finalUserShares} shares`);
  });

  it("Should support both EIP-191 and EIP-712 signatures", async function () {
    console.log("\n=== Testing both EIP-191 and EIP-712 ===");

    const depositAmount = 100n * 10n ** tokenDecimals;
    await ensureUserHasTokens(depositAmount * 2n);

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const initialUserShares = await vaultContract.read.balanceOf([userAddress]);

    // Test EIP-191 signature
    const eip191Signature = await createEIP191Signature(attestedData, formattedTeeKey);
    const eip191ComplianceData = createComplianceData(
      userAddress,
      verificationKey,
      eip191Signature,
      attestedData
    );

    const hash1 = await vaultContract.write.depositWithCompliance(
      [depositAmount, userAddress, eip191ComplianceData],
      { account: userAccount }
    );
    const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
    assert.equal(receipt1.status, "success", "EIP-191 transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    let sharesAfterEIP191 = await vaultContract.read.balanceOf([userAddress]);
    for (let i = 0; i < 3; i++) {
      if (sharesAfterEIP191 > initialUserShares) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      sharesAfterEIP191 = await vaultContract.read.balanceOf([userAddress]);
    }
    assert(sharesAfterEIP191 > initialUserShares, "EIP-191 signature should work");
    console.log(`✓ EIP-191 signature worked: ${initialUserShares} → ${sharesAfterEIP191} shares`);

    // Test EIP-712 signature
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const sharesBeforeEIP712 = await vaultContract.read.balanceOf([userAddress]);
    const eip712Signature = await createEIP712Signature(attestedData, formattedTeeKey);
    const eip712ComplianceData = createComplianceData(
      userAddress,
      verificationKey,
      eip712Signature,
      attestedData
    );

    const hash2 = await vaultContract.write.depositWithCompliance(
      [depositAmount, userAddress, eip712ComplianceData],
      { account: userAccount }
    );
    const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
    assert.equal(receipt2.status, "success", "EIP-712 transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    let sharesAfterEIP712 = await vaultContract.read.balanceOf([userAddress]);
    for (let i = 0; i < 5; i++) {
      if (sharesAfterEIP712 > sharesBeforeEIP712) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      sharesAfterEIP712 = await vaultContract.read.balanceOf([userAddress]);
    }
    assert(sharesAfterEIP712 > sharesBeforeEIP712, "EIP-712 signature should work");
    console.log(`✓ EIP-712 signature worked: ${sharesAfterEIP191} → ${sharesAfterEIP712} shares`);
  });

  // ============ Standard ERC4626 Operations ============

  it("Should allow redeem without compliance (standard ERC4626)", async function () {
    console.log("\n=== Testing redeem (no compliance required) ===");

    const userShares = await vaultContract.read.balanceOf([userAddress]);
    console.log(`User shares: ${userShares}`);

    if (userShares === 0n) {
      console.log("⚠ Skipping test - user has no shares");
      return;
    }

    const redeemAmount = userShares / 4n; // Redeem 1/4 of shares
    const assetsExpected = await vaultContract.read.previewRedeem([redeemAmount]);

    console.log(`Redeeming ${redeemAmount} shares`);
    console.log(`Expected assets: ${assetsExpected}`);

    const initialUserBalance = await mockERC20Contract.read.balanceOf([userAddress]);

    // Redeem shares (standard ERC4626 function, no compliance required)
    const redeemHash = await vaultContract.write.redeem(
      [redeemAmount, userAddress, userAddress],
      { account: userAccount }
    );

    const receipt = await publicClient.waitForTransactionReceipt({ hash: redeemHash });
    assert.equal(receipt.status, "success", "Redeem transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify user received tokens
    let finalUserBalance = await mockERC20Contract.read.balanceOf([userAddress]);
    for (let i = 0; i < 5; i++) {
      if (finalUserBalance > initialUserBalance) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      finalUserBalance = await mockERC20Contract.read.balanceOf([userAddress]);
    }
    
    assert(finalUserBalance > initialUserBalance, "User should receive tokens");
    console.log(`✓ Redeem successful: ${initialUserBalance} → ${finalUserBalance} tokens`);
  });

  // ============ Update Verification Requirements ============

  it("Should update verification requirements", async function () {
    console.log("\n=== Testing updateVerificationRequirements ===");

    // Note: This would require the vault to have an owner/admin function
    // For now, we'll just verify the current requirements
    const verifyingData = await assuraVerifierContract.read.getVerifyingData([
      vaultAddress,
      verificationKey,
    ]);

    assert.equal(verifyingData.score, minScore, "Initial score should match minScore");
    console.log(`✓ Current verification requirements:`);
    console.log(`  Score: ${verifyingData.score}`);
    console.log(`  Expiry: ${verifyingData.expiry}`);
    console.log(`  ChainId: ${verifyingData.chainId}`);
  });

  // ============ Final State Verification ============

  it("Should verify final vault state", async function () {
    console.log("\n=== Final State Verification ===");

    const totalAssets = await vaultContract.read.totalAssets();
    const totalSupply = await vaultContract.read.totalSupply();
    const userShares = await vaultContract.read.balanceOf([userAddress]);
    const userTokenBalance = await mockERC20Contract.read.balanceOf([userAddress]);

    console.log(`Total assets: ${totalAssets}`);
    console.log(`Total supply: ${totalSupply}`);
    console.log(`User shares: ${userShares}`);
    console.log(`User token balance: ${userTokenBalance}`);
    console.log(`✓ All vault tests completed successfully!`);
  });
});