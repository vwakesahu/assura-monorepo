import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { encodeAbiParameters, keccak256, toBytes, hexToBytes, toHex, serializeSignature } from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";

/**
 * End-to-end test for AssuraProtectedVault on Base Sepolia network
 * 
 * This test:
 * 1. Deploys AssuraVerifier contract
 * 2. Deploys MockERC20 token (vault asset)
 * 3. Deploys AssuraProtectedVault contract
 * 4. Creates EIP-712 signatures for compliance attestations
 * 5. Tests the full vault deposit/withdraw flow with compliance verification
 * 
 * Prerequisites:
 * - BASE_SEPOLIA_RPC_URL must be set in .env
 * - BASE_SEPOLIA_PRIVATE_KEY must be set in .env (for deployment)
 * - TEE_PRIVATE_KEY must be set in .env (for signing attestations)
 * - USER_PRIVATE_KEY must be set in .env (for testing user interactions)
 * - OWNER_ADDRESS must be set in .env (for AssuraVerifier owner)
 * - TEE_ADDRESS must be set in .env (must match TEE_PRIVATE_KEY)
 */
describe("E2E Test for AssuraProtectedVault on Base Sepolia", async function () {
  // Connect to Base Sepolia network
  const { viem } = await network.connect({ network: "baseSepolia" });
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  // Get addresses from environment
  const ownerAddress = process.env.OWNER_ADDRESS || deployer.account.address;
  const teeAddress = process.env.TEE_ADDRESS || "";
  let teePrivateKey = process.env.TEE_PRIVATE_KEY || "";

  if (!teeAddress || !teePrivateKey) {
    throw new Error(
      "Please set TEE_ADDRESS and TEE_PRIVATE_KEY environment variables"
    );
  }

  // Ensure private key starts with 0x
  if (!teePrivateKey.startsWith("0x")) {
    teePrivateKey = `0x${teePrivateKey}`;
  }

  // Verify TEE address matches private key
  const teeAccount = privateKeyToAccount(teePrivateKey as `0x${string}`);
  assert.equal(
    teeAccount.address.toLowerCase(),
    teeAddress.toLowerCase(),
    "TEE_ADDRESS must match TEE_PRIVATE_KEY"
  );

  // Get user account (can use deployer or separate user)
  let userPrivateKey =
    process.env.USER_PRIVATE_KEY || process.env.BASE_SEPOLIA_PRIVATE_KEY || "";
  
  // Ensure private key starts with 0x if provided
  if (userPrivateKey && !userPrivateKey.startsWith("0x")) {
    userPrivateKey = `0x${userPrivateKey}`;
  }
  
  const userAccount = userPrivateKey
    ? privateKeyToAccount(userPrivateKey as `0x${string}`)
    : deployer.account;

  let assuraVerifierAddress: `0x${string}`;
  let mockERC20Address: `0x${string}`;
  let vaultAddress: `0x${string}`;
  let vaultContract: Awaited<ReturnType<typeof viem.deployContract>>;
  let mockERC20Contract: Awaited<ReturnType<typeof viem.deployContract>>;
  let chainId: bigint;
  
  // Verification key for the vault (can be any bytes32)
  const verificationKey = keccak256(toBytes("AssuraProtectedVault"));
  const minScore = 50n; // Minimum score required for vault operations

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

    // EIP-712 Domain Separator
    const domain = {
      name: "AssuraVerifier",
      version: "1",
      chainId: Number(chainId),
      verifyingContract: assuraVerifierAddress,
    };

    // EIP-712 Type Hash
    const types = {
      AttestedData: [
        { name: "score", type: "uint256" },
        { name: "timeAtWhichAttested", type: "uint256" },
        { name: "chainId", type: "uint256" },
      ],
    };

    // Create signature using viem
    const signature = await signer.signTypedData({
      domain,
      types,
      primaryType: "AttestedData",
      message: attestedData,
    });

    return signature;
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
    let keyStr: string;
    
    if (typeof key === 'string') {
      keyStr = key;
    } else {
      try {
        const hexKey = toHex(key);
        keyStr = String(hexKey);
      } catch {
        keyStr = String(key);
      }
    }
    
    if (!keyStr.startsWith('0x')) {
      keyStr = `0x${keyStr}`;
    }
    
    let hexPart = keyStr.slice(2).replace(/[^0-9a-fA-F]/g, '');
    if (hexPart.length === 0) hexPart = '0';
    const paddedHex = hexPart.padStart(64, '0');
    const paddedKey = `0x${paddedHex}` as `0x${string}`;
    
    // Encode ComplianceData struct
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

  it("Should deploy AssuraVerifier contract", async function () {
    console.log("\n=== Deploying AssuraVerifier ===");
    console.log(`Owner: ${ownerAddress}`);
    console.log(`TEE Address: ${teeAddress}`);

    const assuraVerifier = await viem.deployContract("AssuraVerifier", [
      ownerAddress as `0x${string}`,
      teeAddress as `0x${string}`,
    ]);

    assuraVerifierAddress = assuraVerifier.address;
    chainId = BigInt(await publicClient.getChainId());

    console.log(`✓ AssuraVerifier deployed at: ${assuraVerifierAddress}`);
    console.log(`✓ Chain ID: ${chainId}`);

    // Wait a moment for contract to be available
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify deployment
    let owner: `0x${string}`;
    let teeAddr: `0x${string}`;
    let retries = 3;
    while (retries > 0) {
      try {
        owner = await assuraVerifier.read.owner();
        teeAddr = await assuraVerifier.read.ASSURA_TEE_ADDRESS();
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    assert.equal(owner!.toLowerCase(), ownerAddress.toLowerCase());
    assert.equal(teeAddr!.toLowerCase(), teeAddress.toLowerCase());
  });

  it("Should deploy MockERC20 token", async function () {
    console.log("\n=== Deploying MockERC20 ===");

    // Use fully qualified name to avoid ambiguity
    const deployedMockERC20 = await viem.deployContract("contracts/test/MockERC20.sol:MockERC20", [
      "Test Token",
      "TEST",
    ]);

    mockERC20Address = deployedMockERC20.address;
    console.log(`✓ MockERC20 deployed at: ${mockERC20Address}`);

    // Wait a moment for contract to be available
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get contract instance with proper typing
    mockERC20Contract = await viem.getContractAt("contracts/test/MockERC20.sol:MockERC20", mockERC20Address);

    // Verify deployment
    let retries = 3;
    while (retries > 0) {
      try {
        const totalSupply = await mockERC20Contract.read.totalSupply();
        console.log(`✓ Total supply: ${totalSupply}`);
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  });

  it("Should deploy AssuraProtectedVault", async function () {
    console.log("\n=== Deploying AssuraProtectedVault ===");
    console.log(`Verification Key: ${verificationKey}`);
    console.log(`Min Score: ${minScore}`);
    console.log(`MockERC20 Address: ${mockERC20Address}`);
    console.log(`AssuraVerifier Address: ${assuraVerifierAddress}`);

    // Ensure addresses are set
    if (!mockERC20Address || !assuraVerifierAddress) {
      throw new Error(`Missing required addresses: mockERC20=${mockERC20Address}, verifier=${assuraVerifierAddress}`);
    }

    const deployedVault = await viem.deployContract("AssuraProtectedVault", [
      mockERC20Address,
      "Assura Protected Vault",
      "APV",
      assuraVerifierAddress,
      verificationKey,
      minScore,
    ]);

    vaultAddress = deployedVault.address;
    console.log(`✓ AssuraProtectedVault deployed at: ${vaultAddress}`);

    // Wait a moment for contract to be available
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get contract instance with proper typing
    vaultContract = await viem.getContractAt("AssuraProtectedVault", vaultAddress);

    // Verify deployment
    let retries = 3;
    while (retries > 0) {
      try {
        const verifier = await vaultContract.read.assuraVerifier();
        const key = await vaultContract.read.verificationKey();
        const score = await vaultContract.read.minScore();
        
        assert.equal(verifier.toLowerCase(), assuraVerifierAddress.toLowerCase());
        assert.equal(key, verificationKey);
        assert.equal(score, minScore);
        
        console.log(`✓ Vault verifier: ${verifier}`);
        console.log(`✓ Vault verification key: ${key}`);
        console.log(`✓ Vault min score: ${score}`);
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  });

  it("Should verify that verifying data was set correctly", async function () {
    console.log("\n=== Verifying Data Setup ===");

    // Ensure vault is deployed
    if (!vaultAddress) {
      throw new Error("Vault not deployed. Previous test must have failed.");
    }

    const assuraVerifier = await viem.getContractAt(
      "AssuraVerifier",
      assuraVerifierAddress
    );

    // Check verifying data (returns VerifyingData struct: score, expiry, chainId)
    const verifyingData = await assuraVerifier.read.getVerifyingData([
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

  it("Should approve vault to spend user tokens", async function () {
    console.log("\n=== Approving Vault ===");

    const approveAmount = 1000000n * 10n ** 18n; // 1M tokens

    // Check user balance
    const userBalance = await mockERC20Contract.read.balanceOf([userAccount.address]);
    console.log(`User balance: ${userBalance}`);

    if (userBalance < approveAmount) {
      // Mint tokens to user if needed
      console.log(`Minting ${approveAmount} tokens to user...`);
      const mintHash = await mockERC20Contract.write.mint([userAccount.address, approveAmount], {
        account: deployer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash: mintHash });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Approve vault
    const approveHash = await mockERC20Contract.write.approve([vaultAddress, approveAmount], {
      account: userAccount,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const allowance = await mockERC20Contract.read.allowance([userAccount.address, vaultAddress]);
    console.log(`✓ Allowance: ${allowance}`);
    assert(allowance >= approveAmount, "Vault should be approved");
  });

  it("Should successfully deposit with compliance verification", async function () {
    console.log("\n=== Testing depositWithCompliance ===");

    // Ensure contracts are initialized
    if (!mockERC20Contract || !vaultContract) {
      throw new Error("Contracts not initialized. Previous tests must have failed.");
    }

    const depositAmount = 1000n * 10n ** 18n; // 1000 tokens
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Create attested data with sufficient score
    const attestedData = {
      score: 100n, // Higher than minScore (50)
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    // Sign with TEE private key using EIP-712
    const signature = await createEIP712Signature(
      attestedData,
      teePrivateKey as `0x${string}`
    );

    // Create compliance data
    const complianceData = createComplianceData(
      userAccount.address,
      verificationKey,
      signature,
      attestedData
    );

    // Get initial balances
    const initialUserBalance = await mockERC20Contract.read.balanceOf([userAccount.address]);
    const initialVaultBalance = await mockERC20Contract.read.balanceOf([vaultAddress]);
    const initialUserShares = await vaultContract.read.balanceOf([userAccount.address]);
    const initialTotalAssets = await vaultContract.read.totalAssets();

    console.log(`Initial user token balance: ${initialUserBalance}`);
    console.log(`Initial vault token balance: ${initialVaultBalance}`);
    console.log(`Initial user shares: ${initialUserShares}`);
    console.log(`Initial total assets: ${initialTotalAssets}`);

    // Deposit with compliance
    console.log(`Depositing ${depositAmount} tokens...`);
    const depositHash = await vaultContract.write.depositWithCompliance(
      [depositAmount, userAccount.address, complianceData],
      {
        account: userAccount,
      }
    );

    const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
    console.log(`✓ Transaction confirmed: ${receipt.transactionHash}`);
    
    if (receipt.status === 'reverted') {
      throw new Error(`Transaction reverted: ${receipt.transactionHash}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify balances changed correctly
    const finalUserBalance = await mockERC20Contract.read.balanceOf([userAccount.address]);
    const finalVaultBalance = await mockERC20Contract.read.balanceOf([vaultAddress]);
    const finalUserShares = await vaultContract.read.balanceOf([userAccount.address]);
    const finalTotalAssets = await vaultContract.read.totalAssets();

    console.log(`Final user token balance: ${finalUserBalance}`);
    console.log(`Final vault token balance: ${finalVaultBalance}`);
    console.log(`Final user shares: ${finalUserShares}`);
    console.log(`Final total assets: ${finalTotalAssets}`);

    // Verify token transfer
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

    // Verify shares were minted
    assert(finalUserShares > initialUserShares, "User should receive shares");
    assert(finalTotalAssets > initialTotalAssets, "Total assets should increase");
  });

  it("Should successfully mint shares with compliance verification", async function () {
    console.log("\n=== Testing mintWithCompliance ===");

    // Ensure contracts are initialized
    if (!mockERC20Contract || !vaultContract) {
      throw new Error("Contracts not initialized. Previous tests must have failed.");
    }

    const sharesToMint = 500n * 10n ** 18n; // 500 shares
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Create attested data with sufficient score
    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    // Sign with TEE private key
    const signature = await createEIP712Signature(
      attestedData,
      teePrivateKey as `0x${string}`
    );

    // Create compliance data
    const complianceData = createComplianceData(
      userAccount.address,
      verificationKey,
      signature,
      attestedData
    );

    // Get initial balances
    const initialUserBalance = await mockERC20Contract.read.balanceOf([userAccount.address]);
    const initialUserShares = await vaultContract.read.balanceOf([userAccount.address]);
    const assetsRequired = await vaultContract.read.previewMint([sharesToMint]);

    console.log(`Shares to mint: ${sharesToMint}`);
    console.log(`Assets required: ${assetsRequired}`);
    console.log(`Initial user token balance: ${initialUserBalance}`);

    // Ensure user has enough tokens
    if (initialUserBalance < assetsRequired) {
      const additionalNeeded = assetsRequired - initialUserBalance;
      console.log(`Minting ${additionalNeeded} additional tokens to user...`);
      const mintHash = await mockERC20Contract.write.mint([userAccount.address, additionalNeeded], {
        account: deployer.account,
      });
      await publicClient.waitForTransactionReceipt({ hash: mintHash });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Approve additional tokens
      const approveHash = await mockERC20Contract.write.approve([vaultAddress, additionalNeeded], {
        account: userAccount,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Mint shares with compliance
    console.log(`Minting ${sharesToMint} shares...`);
    const mintHash = await vaultContract.write.mintWithCompliance(
      [sharesToMint, userAccount.address, complianceData],
      {
        account: userAccount,
      }
    );

    const receipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
    console.log(`✓ Transaction confirmed: ${receipt.transactionHash}`);
    
    if (receipt.status === 'reverted') {
      throw new Error(`Transaction reverted: ${receipt.transactionHash}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify shares were minted
    const finalUserShares = await vaultContract.read.balanceOf([userAccount.address]);
    console.log(`Final user shares: ${finalUserShares}`);
    
    assert(finalUserShares >= initialUserShares + sharesToMint, "User should receive the minted shares");
  });

  it("Should fail deposit with insufficient score", async function () {
    console.log("\n=== Testing depositWithCompliance with insufficient score ===");

    // Ensure contracts are initialized
    if (!vaultContract) {
      throw new Error("Vault contract not initialized. Previous tests must have failed.");
    }

    const depositAmount = 100n * 10n ** 18n;
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Create attested data with insufficient score (less than minScore of 50)
    const attestedData = {
      score: 30n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    // Sign with TEE private key
    const signature = await createEIP712Signature(
      attestedData,
      teePrivateKey as `0x${string}`
    );

    // Create compliance data
    const complianceData = createComplianceData(
      userAccount.address,
      verificationKey,
      signature,
      attestedData
    );

    // Deposit should fail
    console.log(`Attempting deposit with score 30 (requires ${minScore})...`);
    try {
      const hash = await vaultContract.write.depositWithCompliance(
        [depositAmount, userAccount.address, complianceData],
        {
          account: userAccount,
        }
      );
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      // If transaction didn't revert, fail the test
      if (receipt.status !== 'reverted') {
        assert.fail("Transaction should have reverted but it succeeded");
      }
    } catch (error: any) {
      // Check if it's a revert error
      const isRevert = error.message.includes("Compliance verification failed") ||
        error.message.includes("revert") ||
        error.message.includes("Compliance") ||
        error.message.includes("score") ||
        error.message.includes("insufficient");
      
      if (!isRevert) {
        // Re-throw if it's not a revert error
        throw error;
      }
      
      console.log(`✓ Transaction correctly reverted: ${error.message}`);
    }
  });

  it("Should successfully withdraw without compliance (standard ERC4626)", async function () {
    console.log("\n=== Testing withdraw (no compliance required) ===");

    // Ensure contracts are initialized
    if (!vaultContract || !mockERC20Contract) {
      throw new Error("Contracts not initialized. Previous tests must have failed.");
    }

    const userShares = await vaultContract.read.balanceOf([userAccount.address]);
    console.log(`User shares: ${userShares}`);

    if (userShares === 0n) {
      console.log("⚠ Skipping test - user has no shares");
      return;
    }

    const withdrawAmount = userShares / 2n; // Withdraw half
    const assetsExpected = await vaultContract.read.previewRedeem([withdrawAmount]);

    console.log(`Redeeming ${withdrawAmount} shares`);
    console.log(`Expected assets: ${assetsExpected}`);

    const initialUserBalance = await mockERC20Contract.read.balanceOf([userAccount.address]);

    // Redeem shares (standard ERC4626 function, no compliance required)
    const redeemHash = await vaultContract.write.redeem(
      [withdrawAmount, userAccount.address, userAccount.address],
      {
        account: userAccount,
      }
    );

    const receipt = await publicClient.waitForTransactionReceipt({ hash: redeemHash });
    console.log(`✓ Transaction confirmed: ${receipt.transactionHash}`);
    
    if (receipt.status === 'reverted') {
      throw new Error(`Transaction reverted: ${receipt.transactionHash}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify user received tokens
    const finalUserBalance = await mockERC20Contract.read.balanceOf([userAccount.address]);
    console.log(`Final user token balance: ${finalUserBalance}`);
    
    assert(finalUserBalance > initialUserBalance, "User should receive tokens");
  });

  it("Should verify final vault state", async function () {
    console.log("\n=== Final State Verification ===");

    // Ensure contracts are initialized
    if (!vaultContract) {
      throw new Error("Vault contract not initialized. Previous tests must have failed.");
    }

    const totalAssets = await vaultContract.read.totalAssets();
    const totalSupply = await vaultContract.read.totalSupply();
    const userShares = await vaultContract.read.balanceOf([userAccount.address]);

    console.log(`Total assets: ${totalAssets}`);
    console.log(`Total supply: ${totalSupply}`);
    console.log(`User shares: ${userShares}`);
    console.log(`✓ All vault tests completed successfully!`);
  });
});

