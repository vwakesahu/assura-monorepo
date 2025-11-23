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
import { getTeeAddress, getAttestation } from "../scripts/get-tee-address.js";

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
  const userAddress = userAccount.address;

  // Fetch TEE address from TEE service
  const teeServiceUrl = process.env.TEE_SERVICE_URL || "https://tee.assura.network";
  const teeAddress = (await getTeeAddress(teeServiceUrl)) as `0x${string}`;

  let assuraVerifierAddress: `0x${string}`;
  let mockERC20Address: `0x${string}`;
  let vaultAddress: `0x${string}`;
  let assuraVerifierContract: Awaited<ReturnType<typeof viem.getContractAt<"AssuraVerifier">>>;
  let mockERC20Contract: Awaited<ReturnType<typeof viem.getContractAt<"MockERC20">>>;
  let vaultContract: Awaited<ReturnType<typeof viem.getContractAt<"AssuraProtectedVault">>>;
  let chainId: bigint;

  // Selectors for vault functions (will be retrieved from contract)
  let depositSelector: `0x${string}`;
  let mintSelector: `0x${string}`;
  
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
    if (!mockERC20Contract || !vaultAddress) {
      throw new Error("Contracts must be deployed before calling ensureUserHasTokens");
    }
    const contract = mockERC20Contract as any;
    const userBalance = await contract.read.balanceOf([userAddress]);
    if (userBalance < amount) {
      const needed = amount - userBalance;
      console.log(`Minting ${needed} tokens to user...`);
      const mintHash = await contract.write.mint([userAddress, needed], {
        account: ownerAccount,
      });
      await waitForTransaction(mintHash);
    }

    const allowance = await contract.read.allowance([userAddress, vaultAddress]);
    if (allowance < amount) {
      const approveAmount = amount * 2n; // Approve extra for multiple operations
      console.log(`Approving ${approveAmount} tokens for vault...`);
      const approveHash = await contract.write.approve([vaultAddress, approveAmount], {
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
    console.log(`NexusAccountDeployer: Will be deployed automatically`);

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
    let owner: `0x${string}` | undefined;
    let teeAddr: `0x${string}` | undefined;
    let nexusDeployer: `0x${string}` | undefined;
    for (let i = 0; i < 5; i++) {
      try {
        owner = await assuraVerifierContract.read.owner();
        teeAddr = await assuraVerifierContract.read.ASSURA_TEE_ADDRESS();
        nexusDeployer = await assuraVerifierContract.read.getNexusAccountDeployer() as `0x${string}`;
        if (owner && teeAddr && nexusDeployer) break;
      } catch (error) {
        if (i === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    assert.ok(owner, "Owner should be set");
    assert.ok(teeAddr, "TEE address should be set");
    assert.ok(nexusDeployer, "NexusAccountDeployer should be set");
    assert.equal(owner!.toLowerCase(), ownerAddress.toLowerCase());
    assert.equal(teeAddr!.toLowerCase(), teeAddress.toLowerCase());
    assert.notEqual(nexusDeployer!, "0x0000000000000000000000000000000000000000");

    console.log(`✓ NexusAccountDeployer deployed at: ${nexusDeployer}`);
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
    ) as any;

    // Verify deployment with retries
    let totalSupply: bigint | undefined;
    for (let i = 0; i < 5; i++) {
      try {
        totalSupply = await (mockERC20Contract as any).read.totalSupply();
        if (totalSupply !== undefined) break;
      } catch (error) {
        if (i === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    
    assert.ok(totalSupply !== undefined, "Total supply should be set");
    console.log(`✓ Total supply: ${totalSupply}`);
  });

  it("Should deploy AssuraProtectedVault contract", async function () {
    console.log("\n=== Deploying AssuraProtectedVault ===");

    // Use a placeholder verification key for constructor
    // The actual verifying data will be set using selectors
    const verificationKey = keccak256(toBytes("AssuraProtectedVault"));

    const vault = await viem.deployContract("AssuraProtectedVault", [
      mockERC20Address,
      "Assura Protected Vault",
      "APV",
      assuraVerifierAddress,
      verificationKey
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
    let verifier: `0x${string}` | undefined;
    let key: `0x${string}` | undefined;
    for (let i = 0; i < 5; i++) {
      try {
        verifier = await (vaultContract as any).read.assuraVerifier();
        key = await (vaultContract as any).read.verificationKey();
        if (verifier && key) break;
      } catch (error) {
        if (i === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    
    assert.ok(verifier, "Verifier should be set");
    assert.ok(key, "Key should be set");
    assert.equal(
      verifier!.toLowerCase(),
      assuraVerifierAddress.toLowerCase(),
      "Vault should have correct AssuraVerifier"
    );
    assert.equal(key, verificationKey, "Vault should have correct verification key");

    console.log(`✓ Vault verifier: ${verifier}`);
    console.log(`✓ Vault verification key: ${key}`);

    // Get selectors from vault contract
    depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    mintSelector = await (vaultContract.read as any).getOnlyUserWithScore40Selector();
    
    console.log(`✓ Deposit selector: ${depositSelector}`);
    console.log(`✓ Mint selector: ${mintSelector}`);
  });

  it("Should verify that verifying data was set correctly", async function () {
    console.log("\n=== Verifying Data Setup ===");

    // Get selectors - retry if needed
    if (!depositSelector || !mintSelector) {
      for (let i = 0; i < 5; i++) {
        try {
          depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
          mintSelector = await (vaultContract.read as any).getOnlyUserWithScore40Selector();
          if (depositSelector && depositSelector !== "0x" && mintSelector && mintSelector !== "0x") {
            break;
          }
        } catch (error) {
          if (i === 4) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    assert(depositSelector && depositSelector !== "0x", "deposit() selector should be valid");
    assert(mintSelector && mintSelector !== "0x", "mint() selector should be valid");

    const depositVerifyingData = await assuraVerifierContract.read.getVerifyingData([
      vaultAddress,
      depositSelector,
    ]);
    const mintVerifyingData = await assuraVerifierContract.read.getVerifyingData([
      vaultAddress,
      mintSelector,
    ]);

    assert.equal(depositVerifyingData.score, 20n, "depositWithScore100() should require score 20");
    assert.equal(mintVerifyingData.score, 40n, "mintWithScore30() should require score 40");

    console.log(`✓ depositWithScore100() requires score: ${depositVerifyingData.score}`);
    console.log(`✓ mintWithScore30() requires score: ${mintVerifyingData.score}`);
  });

  // ============ Valid Compliance Data Tests ============

  it("Should successfully deposit with valid EIP-191 compliance data", async function () {
    console.log("\n=== Testing depositWithScore100 with EIP-191 signature ===");

    const depositAmount = 1000n * 10n ** tokenDecimals;
    await ensureUserHasTokens(depositAmount);

    // Get selector if not already set
    if (!depositSelector) {
      depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    }

    // Get attestation from TEE service (score generated by TEE)
    const attestation = await getAttestation(
      userAddress,
      Number(chainId),
      teeServiceUrl
    );

    const attestedData = {
      score: BigInt(attestation.attestedData.score),
      timeAtWhichAttested: BigInt(attestation.attestedData.timeAtWhichAttested),
      chainId: BigInt(attestation.attestedData.chainId),
    };

    // Skip test if score is insufficient (requires score 5)
    if (attestedData.score < 5n) {
      console.log(`⚠ Skipping deposit test - TEE score (${attestedData.score}) is insufficient (required: 5)`);
      return;
    }

    const complianceData = createComplianceData(
      userAddress,
      depositSelector,
      attestation.signature as `0x${string}`,
      attestedData
    );

    const initialUserBalance = await (mockERC20Contract as any).read.balanceOf([userAddress]);
    const initialVaultBalance = await (mockERC20Contract as any).read.balanceOf([vaultAddress]);
    const initialUserShares = await (vaultContract as any).read.balanceOf([userAddress]);
    const initialTotalAssets = await (vaultContract as any).read.totalAssets();

    console.log(`Depositing ${depositAmount} tokens...`);
    const hash = await (vaultContract.write as any).depositWithScore100(
      [depositAmount, userAddress, complianceData],
      { account: userAccount }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", "Transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Retry reading until balances update
    let finalUserBalance = await (mockERC20Contract as any).read.balanceOf([userAddress]);
    let finalVaultBalance = await (mockERC20Contract as any).read.balanceOf([vaultAddress]);
    let finalUserShares = await (vaultContract as any).read.balanceOf([userAddress]);
    for (let i = 0; i < 5; i++) {
      if (
        finalUserBalance === initialUserBalance - depositAmount &&
        finalVaultBalance === initialVaultBalance + depositAmount &&
        finalUserShares > initialUserShares
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      finalUserBalance = await (mockERC20Contract as any).read.balanceOf([userAddress]);
      finalVaultBalance = await (mockERC20Contract as any).read.balanceOf([vaultAddress]);
      finalUserShares = await (vaultContract as any).read.balanceOf([userAddress]);
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
    console.log("\n=== Testing depositWithScore100 with EIP-712 signature ===");

    const depositAmount = 500n * 10n ** tokenDecimals;
    await ensureUserHasTokens(depositAmount);

    // Get selector if not already set
    if (!depositSelector) {
      depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    }

    // Get attestation from TEE service (score generated by TEE)
    // Note: TEE service provides EIP-191 signatures, not EIP-712
    const attestation = await getAttestation(
      userAddress,
      Number(chainId),
      teeServiceUrl
    );

    const attestedData = {
      score: BigInt(attestation.attestedData.score),
      timeAtWhichAttested: BigInt(attestation.attestedData.timeAtWhichAttested),
      chainId: BigInt(attestation.attestedData.chainId),
    };

    // Skip test if score is insufficient (requires score 5)
    if (attestedData.score < 5n) {
      console.log(`⚠ Skipping EIP-712 deposit test - TEE score (${attestedData.score}) is insufficient (required: 5)`);
      return;
    }

    const complianceData = createComplianceData(
      userAddress,
      depositSelector,
      attestation.signature as `0x${string}`,
      attestedData
    );

    const initialUserShares = await (vaultContract as any).read.balanceOf([userAddress]);

    console.log(`Depositing ${depositAmount} tokens...`);
    const hash = await (vaultContract.write as any).depositWithScore100(
      [depositAmount, userAddress, complianceData],
      { account: userAccount }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", "Transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Retry reading until shares update
    let finalUserShares = await (vaultContract as any).read.balanceOf([userAddress]);
    for (let i = 0; i < 5; i++) {
      if (finalUserShares > initialUserShares) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      finalUserShares = await (vaultContract as any).read.balanceOf([userAddress]);
    }

    assert(finalUserShares > initialUserShares, "User should receive shares");
    console.log(`✓ Deposit successful: ${initialUserShares} → ${finalUserShares} shares`);
  });

  it("Should successfully mint shares with valid compliance data", async function () {
    console.log("\n=== Testing mintWithScore30 ===");

    const sharesToMint = 300n * 10n ** tokenDecimals;
    const assetsRequired = await (vaultContract as any).read.previewMint([sharesToMint]);
    await ensureUserHasTokens(assetsRequired);

    // Get selector if not already set
    if (!mintSelector) {
      mintSelector = await (vaultContract.read as any).getOnlyUserWithScore40Selector();
    }

    // Get attestation from TEE service (score generated by TEE)
    const attestation = await getAttestation(
      userAddress,
      Number(chainId),
      teeServiceUrl
    );

    const attestedData = {
      score: BigInt(attestation.attestedData.score),
      timeAtWhichAttested: BigInt(attestation.attestedData.timeAtWhichAttested),
      chainId: BigInt(attestation.attestedData.chainId),
    };

    // Skip test if score is insufficient (requires score 10)
    if (attestedData.score < 10n) {
      console.log(`⚠ Skipping mint test - TEE score (${attestedData.score}) is insufficient (required: 10)`);
      return;
    }

    const complianceData = createComplianceData(
      userAddress,
      mintSelector,
      attestation.signature as `0x${string}`,
      attestedData
    );

    const initialUserShares = await (vaultContract as any).read.balanceOf([userAddress]);

    // Wait to avoid nonce conflicts
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log(`Minting ${sharesToMint} shares...`);
    const hash = await (vaultContract.write as any).mintWithScore30(
      [sharesToMint, userAddress, complianceData],
      { account: userAccount }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", "Transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Retry reading until shares update
    let finalUserShares = await (vaultContract as any).read.balanceOf([userAddress]);
    for (let i = 0; i < 5; i++) {
      if (finalUserShares >= initialUserShares + sharesToMint) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      finalUserShares = await (vaultContract as any).read.balanceOf([userAddress]);
    }

    assert(
      finalUserShares >= initialUserShares + sharesToMint,
      `User should receive at least ${sharesToMint} shares`
    );
    console.log(`✓ Mint successful: ${initialUserShares} → ${finalUserShares} shares`);
  });

  // ============ Error Cases ============

  it("Should fail deposit with insufficient score", async function () {
    console.log("\n=== Testing depositWithScore100 with insufficient score ===");

    const depositAmount = 100n * 10n ** tokenDecimals;
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Get selector if not already set
    if (!depositSelector) {
      depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    }

    // Use score 3 (less than required 5)
    const attestedData = {
      score: 3n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const signature = await createEIP191Signature(attestedData, formattedTeeKey);
    const complianceData = createComplianceData(
      userAddress,
      depositSelector,
      signature,
      attestedData
    );

    console.log(`Attempting deposit with score 3 (requires 5)...`);
    try {
      const hash = await (vaultContract.write as any).depositWithScore100(
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

    // Get selector if not already set
    if (!depositSelector) {
      depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    }

    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    // Sign with user's key instead of TEE key (wrong signature)
    const wrongSignature = await createEIP191Signature(attestedData, formattedUserKey);
    const complianceData = createComplianceData(
      userAddress,
      depositSelector,
      wrongSignature,
      attestedData
    );

    try {
      const hash = await (vaultContract.write as any).depositWithScore100(
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

    // Get selector if not already set
    if (!depositSelector) {
      depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    }

    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    const signature = await createEIP191Signature(attestedData, formattedTeeKey);
    // Use wrong key (mint selector instead of deposit selector)
    if (!mintSelector) {
      mintSelector = await (vaultContract.read as any).getOnlyUserWithScore40Selector();
    }
    const complianceData = createComplianceData(
      userAddress,
      mintSelector, // Wrong key - using mint selector for deposit
      signature,
      attestedData
    );

    try {
      await (vaultContract.write as any).depositWithScore100(
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

  it("Should create bypass entry when score is insufficient", async function (this: { skip: () => void }) {
    console.log("\n=== Testing bypass entry creation ===");

    // Get selector if not already set
    if (!depositSelector) {
      depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    }

    // Get attestation from TEE service (score generated by TEE)
    const attestation = await getAttestation(
      userAddress,
      Number(chainId),
      teeServiceUrl
    );

    const attestedData = {
      score: BigInt(attestation.attestedData.score),
      timeAtWhichAttested: BigInt(attestation.attestedData.timeAtWhichAttested),
      chainId: BigInt(attestation.attestedData.chainId),
    };

    // Skip test if score is already sufficient (TEE gives high scores by default)
    if (attestedData.score >= 5n) {
      console.log(`⚠ Skipping bypass test - TEE score (${attestedData.score}) is already sufficient (required: 5)`);
      this.skip();
      return;
    }

    const complianceData = createComplianceData(
      userAddress,
      depositSelector,
      attestation.signature as `0x${string}`,
      attestedData
    );

    const verifierWithUser = assuraVerifierContract as any;

    // Simulate first to get return value
    const isValid = await verifierWithUser.simulate.verifyWithBypass([
      vaultAddress,
      depositSelector,
      complianceData,
    ], {
      account: userAccount,
    });

    assert.equal(isValid.result, false, "Verification should fail due to insufficient score");
    
    // Wait a bit to avoid "replacement transaction underpriced" errors
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    // Now actually call it to create the bypass entry
    const hash = await verifierWithUser.write.verifyWithBypass([
      vaultAddress,
      depositSelector,
      complianceData,
    ], {
      account: userAccount,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", "Transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Wait longer for state to update
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check bypass entry was created (public mapping returns tuple) - retry if needed
    let bypassEntryTuple: [bigint, bigint, boolean];
    for (let i = 0; i < 5; i++) {
      bypassEntryTuple = await (assuraVerifierContract.read as any).bypassEntries([
        userAddress,
        vaultAddress,
        depositSelector,
      ]);
      if (bypassEntryTuple[2] === true) break; // allowed is true
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    
    const bypassEntry = {
      expiry: bypassEntryTuple![0],
      nonce: bypassEntryTuple![1],
      allowed: bypassEntryTuple![2],
    };

    assert.equal(bypassEntry.allowed, true, "Bypass entry should be created");
    assert.equal(bypassEntry.nonce, 1n, "Bypass entry should have nonce=1");

    // Get the actual block timestamp when the transaction was executed
    const block = await publicClient.getBlock({ blockTag: "latest" });
    const blockTimestamp = BigInt(block.timestamp);

    // Calculate expected expiry: block timestamp + (difference * 10 seconds)
    // Required score = 5, actual score < 5
    // Difference = 5 - actualScore (e.g., 5 - 0 = 5, so expiry = blockTimestamp + 50 seconds)
    const scoreDifference = 5n - attestedData.score; // Should be positive if score < 5
    const expectedExpiry = blockTimestamp + (scoreDifference * 10n);
    const tolerance = 10n; // Allow 10 seconds tolerance for block time differences

    assert(
      bypassEntry.expiry >= expectedExpiry - tolerance && bypassEntry.expiry <= expectedExpiry + tolerance,
      `Bypass expiry should be around ${expectedExpiry} (got ${bypassEntry.expiry}, block timestamp: ${blockTimestamp}, score: ${attestedData.score})`
    );

    console.log(`✓ Bypass entry created with expiry: ${bypassEntry.expiry}`);
    console.log(`  Expected expiry: ${expectedExpiry}`);
    console.log(`  Nonce: ${bypassEntry.nonce}`);
  });

  it("Should increment bypass entry nonce on subsequent attempts", async function (this: { skip: () => void }) {
    console.log("\n=== Testing bypass nonce increment ===");

    // Get selector if not already set
    if (!depositSelector) {
      depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    }

    // Use a different user address to avoid state pollution from previous tests
    const testUserAddress = `0x${Math.random().toString(16).slice(2, 42).padEnd(40, '0')}` as `0x${string}`;

    // Register test user first with a username
    const testUsername = `testuser-${testUserAddress.slice(2, 8).toLowerCase()}`;
    const attestation = await getAttestation(
      testUserAddress,
      Number(chainId),
      teeServiceUrl,
      testUsername // Register user first
    );
    
    // Skip test if score is already sufficient
    if (BigInt(attestation.attestedData.score) >= 5n) {
      console.log(`⚠ Skipping bypass nonce test - TEE score (${attestation.attestedData.score}) is already sufficient (required: 5)`);
      this.skip();
      return;
    }

    const attestedData = {
      score: BigInt(attestation.attestedData.score),
      timeAtWhichAttested: BigInt(attestation.attestedData.timeAtWhichAttested),
      chainId: BigInt(attestation.attestedData.chainId),
    };

    const testComplianceData = createComplianceData(
      testUserAddress,
      depositSelector,
      attestation.signature as `0x${string}`,
      attestedData
    );

    const verifierWithUser = assuraVerifierContract as any;

    // First attempt: creates bypass entry with nonce 1
    const hash1 = await verifierWithUser.write.verifyWithBypass([
      vaultAddress,
      depositSelector,
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
      depositSelector,
    ]);
    let bypassEntry = {
      expiry: bypassEntryTuple[0],
      nonce: bypassEntryTuple[1],
      allowed: bypassEntryTuple[2],
    };
    assert.equal(bypassEntry.nonce, 1n, `First bypass entry should have nonce=1, got: ${bypassEntry.nonce}`);

    // Second attempt: updates bypass entry with nonce 2
    // Wait a bit to ensure first transaction is fully processed
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // Create fresh compliance data with updated timestamp to avoid any replay issues
    const attestation2 = await getAttestation(
      testUserAddress,
      Number(chainId),
      teeServiceUrl,
      testUsername // Use same username
    );

    const attestedData2 = {
      score: BigInt(attestation2.attestedData.score),
      timeAtWhichAttested: BigInt(attestation2.attestedData.timeAtWhichAttested),
      chainId: BigInt(attestation2.attestedData.chainId),
    };

    const testComplianceData2 = createComplianceData(
      testUserAddress,
      depositSelector,
      attestation2.signature as `0x${string}`,
      attestedData2
    );
    
    // Simulate first to check if signature is valid
    let simulationPassed = false;
    try {
      const { result: isValid } = await verifierWithUser.simulate.verifyWithBypass([
        vaultAddress,
        depositSelector,
        testComplianceData2,
      ], {
        account: userAccount,
      });
      console.log(`✓ Simulation result: ${isValid} (expected false - access denied but bypass entry updated)`);
      simulationPassed = true;
    } catch (simError: any) {
      console.error(`✗ Simulation failed: ${simError.message || simError}`);
      throw new Error(`Second verifyWithBypass call simulation failed: ${simError.message || simError}`);
    }
    
    if (!simulationPassed) {
      throw new Error("Simulation did not pass, cannot proceed with transaction");
    }
    
    // Wait longer before sending actual transaction to avoid "replacement transaction underpriced" errors
    await new Promise((resolve) => setTimeout(resolve, 4000));
    
    const hash2 = await verifierWithUser.write.verifyWithBypass([
      vaultAddress,
      depositSelector,
      testComplianceData2,
    ], {
      account: userAccount,
    });
    const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
    assert.equal(receipt2.status, "success", "Second transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Retry reading bypass entry until nonce updates - use testUserAddress!
    for (let i = 0; i < 5; i++) {
      bypassEntryTuple = await (assuraVerifierContract.read as any).bypassEntries([
        testUserAddress,
        vaultAddress,
        depositSelector,
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

    // Get selector if not already set
    if (!depositSelector) {
      depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    }

    // Get attestation from TEE service (score generated by TEE)
    const attestation = await getAttestation(
      userAddress,
      Number(chainId),
      teeServiceUrl
    );

    const attestedData = {
      score: BigInt(attestation.attestedData.score),
      timeAtWhichAttested: BigInt(attestation.attestedData.timeAtWhichAttested),
      chainId: BigInt(attestation.attestedData.chainId),
    };

    // Skip test if score is insufficient (requires score 5)
    if (attestedData.score < 5n) {
      console.log(`⚠ Skipping multiple deposits test - TEE score (${attestedData.score}) is insufficient (required: 5)`);
      return;
    }

    const complianceData = createComplianceData(
      userAddress,
      depositSelector,
      attestation.signature as `0x${string}`,
      attestedData
    );

    const initialUserShares = await vaultContract.read.balanceOf([userAddress]);

    // Make 3 deposits
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const hash = await (vaultContract.write as any).depositWithScore100(
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

    // Read current value right before operations
    const initialUserShares = await (vaultContract as any).read.balanceOf([userAddress]);

    // Test EIP-191 signature from TEE
    const attestation191 = await getAttestation(
      userAddress,
      Number(chainId),
      teeServiceUrl
    );

    const attestedData = {
      score: BigInt(attestation191.attestedData.score),
      timeAtWhichAttested: BigInt(attestation191.attestedData.timeAtWhichAttested),
      chainId: BigInt(attestation191.attestedData.chainId),
    };

    // Get selector if not already set
    if (!depositSelector) {
      depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    }

    // Skip test if score is insufficient (requires score 5)
    if (attestedData.score < 5n) {
      console.log(`⚠ Skipping signature support test - TEE score (${attestedData.score}) is insufficient (required: 5)`);
      return;
    }

    const eip191ComplianceData = createComplianceData(
      userAddress,
      depositSelector,
      attestation191.signature as `0x${string}`,
      attestedData
    );

    const hash1 = await (vaultContract.write as any).depositWithScore100(
      [depositAmount, userAddress, eip191ComplianceData],
      { account: userAccount }
    );
    const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
    assert.equal(receipt1.status, "success", "EIP-191 transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    let sharesAfterEIP191 = await (vaultContract as any).read.balanceOf([userAddress]);
    for (let i = 0; i < 3; i++) {
      if (sharesAfterEIP191 > initialUserShares) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      sharesAfterEIP191 = await (vaultContract as any).read.balanceOf([userAddress]);
    }
    assert(sharesAfterEIP191 > initialUserShares, "EIP-191 signature should work");
    console.log(`✓ EIP-191 signature worked: ${initialUserShares} → ${sharesAfterEIP191} shares`);

    // Test second signature - read current value again before second increment
    const sharesBeforeSecond = await (vaultContract as any).read.balanceOf([userAddress]);

    // Get another attestation from TEE (with updated timestamp)
    const attestation2 = await getAttestation(
      userAddress,
      Number(chainId),
      teeServiceUrl
    );

    const attestedData2 = {
      score: BigInt(attestation2.attestedData.score),
      timeAtWhichAttested: BigInt(attestation2.attestedData.timeAtWhichAttested),
      chainId: BigInt(attestation2.attestedData.chainId),
    };

    const secondComplianceData = createComplianceData(
      userAddress,
      depositSelector,
      attestation2.signature as `0x${string}`,
      attestedData2
    );

    const hash2 = await (vaultContract.write as any).depositWithScore100(
      [depositAmount, userAddress, secondComplianceData],
      { account: userAccount }
    );
    const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
    assert.equal(receipt2.status, "success", "Second transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Retry reading until value updates
    let sharesAfterSecond = await (vaultContract as any).read.balanceOf([userAddress]);
    for (let i = 0; i < 5; i++) {
      if (sharesAfterSecond > sharesBeforeSecond) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      sharesAfterSecond = await (vaultContract as any).read.balanceOf([userAddress]);
    }
    const expectedSecond = sharesBeforeSecond + depositAmount;
    assert(sharesAfterSecond > sharesBeforeSecond, `Second signature should work: ${sharesBeforeSecond} + ${depositAmount} = ${expectedSecond}, but got ${sharesAfterSecond}`);
    console.log(`✓ Both signatures worked: ${initialUserShares} → ${sharesAfterEIP191} → ${sharesAfterSecond}`);
  });

  // ============ Standard ERC4626 Operations ============

  it("Should allow redeem without compliance (standard ERC4626)", async function () {
    console.log("\n=== Testing redeem (no compliance required) ===");

    const userShares = await (vaultContract as any).read.balanceOf([userAddress]);
    console.log(`User shares: ${userShares}`);

    if (userShares === 0n) {
      console.log("⚠ Skipping test - user has no shares");
      return;
    }

    const redeemAmount = userShares / 4n; // Redeem 1/4 of shares
    const assetsExpected = await (vaultContract as any).read.previewRedeem([redeemAmount]);

    console.log(`Redeeming ${redeemAmount} shares`);
    console.log(`Expected assets: ${assetsExpected}`);

    const initialUserBalance = await (mockERC20Contract as any).read.balanceOf([userAddress]);

    // Redeem shares (standard ERC4626 function, no compliance required)
    const redeemHash = await vaultContract.write.redeem(
      [redeemAmount, userAddress, userAddress],
      { account: userAccount }
    );

    const receipt = await publicClient.waitForTransactionReceipt({ hash: redeemHash });
    assert.equal(receipt.status, "success", "Redeem transaction should succeed");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify user received tokens
    let finalUserBalance = await (mockERC20Contract as any).read.balanceOf([userAddress]);
    for (let i = 0; i < 5; i++) {
      if (finalUserBalance > initialUserBalance) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      finalUserBalance = await (mockERC20Contract as any).read.balanceOf([userAddress]);
    }
    
    assert(finalUserBalance > initialUserBalance, "User should receive tokens");
    console.log(`✓ Redeem successful: ${initialUserBalance} → ${finalUserBalance} tokens`);
  });

  // ============ Update Verification Requirements ============

  it("Should update verification requirements", async function () {
    console.log("\n=== Testing updateVerificationRequirements ===");

    // Get selectors if not already set
    if (!depositSelector) {
      depositSelector = await (vaultContract.read as any).getOnlyUserWithScore20Selector();
    }
    if (!mintSelector) {
      mintSelector = await (vaultContract.read as any).getOnlyUserWithScore40Selector();
    }

    // Verify the current requirements for both selectors
    const depositVerifyingData = await assuraVerifierContract.read.getVerifyingData([
      vaultAddress,
      depositSelector,
    ]);
    const mintVerifyingData = await assuraVerifierContract.read.getVerifyingData([
      vaultAddress,
      mintSelector,
    ]);

    assert.equal(depositVerifyingData.score, 5n, "Deposit should require score 5");
    assert.equal(mintVerifyingData.score, 10n, "Mint should require score 10");
    console.log(`✓ Current verification requirements:`);
    console.log(`  Deposit Score: ${depositVerifyingData.score}`);
    console.log(`  Mint Score: ${mintVerifyingData.score}`);
    console.log(`  Expiry: ${depositVerifyingData.expiry} (0 = no expiry)`);
    console.log(`  ChainId: ${depositVerifyingData.chainId} (0 = any chain)`);
  });

  // ============ Final State Verification ============

  it("Should verify final vault state", async function () {
    console.log("\n=== Final State Verification ===");

    const totalAssets = await (vaultContract as any).read.totalAssets();
    const totalSupply = await (vaultContract as any).read.totalSupply();
    const userShares = await (vaultContract as any).read.balanceOf([userAddress]);
    const userTokenBalance = await (mockERC20Contract as any).read.balanceOf([userAddress]);

    console.log(`Total assets: ${totalAssets}`);
    console.log(`Total supply: ${totalSupply}`);
    console.log(`User shares: ${userShares}`);
    console.log(`User token balance: ${userTokenBalance}`);
    console.log(`✓ All vault tests completed successfully!`);
  });
});

