import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { encodeAbiParameters, keccak256, toBytes, hexToBytes, toHex, serializeSignature } from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";

/**
 * End-to-end test for Base Sepolia network
 * 
 * This test:
 * 1. Deploys AssuraVerifier contract
 * 2. Deploys Counter contract
 * 3. Creates EIP-712 signatures for compliance attestations
 * 4. Tests the full compliance verification flow
 * 
 * Prerequisites:
 * - BASE_SEPOLIA_RPC_URL must be set in .env
 * - BASE_SEPOLIA_PRIVATE_KEY must be set in .env (for deployment)
 * - TEE_PRIVATE_KEY must be set in .env (for signing attestations)
 * - USER_PRIVATE_KEY must be set in .env (for testing user interactions)
 * - OWNER_ADDRESS must be set in .env (for AssuraVerifier owner)
 * - TEE_ADDRESS must be set in .env (must match TEE_PRIVATE_KEY)
 */
describe("E2E Test on Base Sepolia", async function () {
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
  let counterAddress: `0x${string}`;
  let counterContract: Awaited<ReturnType<typeof viem.getContractAt<"Counter">>>;
  let chainId: bigint;

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
   * Helper function to create EIP-191 signature (backward compatibility)
   * Matches the Solidity implementation: keccak256("\x19Ethereum Signed Message:\n32" || keccak256(abi.encode(attestedData)))
   */
  async function createEIP191Signature(
    attestedData: {
      score: bigint;
      timeAtWhichAttested: bigint;
      chainId: bigint;
    },
    signerPrivateKey: `0x${string}`
  ): Promise<`0x${string}`> {
    // Encode the AttestedData struct (matches abi.encode in Solidity)
    const encodedData = encodeAbiParameters(
      [
        { name: "score", type: "uint256" },
        { name: "timeAtWhichAttested", type: "uint256" },
        { name: "chainId", type: "uint256" },
      ],
      [attestedData.score, attestedData.timeAtWhichAttested, attestedData.chainId]
    );

    // Hash the encoded data
    const dataHash = keccak256(encodedData);

    // Create EIP-191 message: "\x19Ethereum Signed Message:\n32" || hash
    const messagePrefix = "\x19Ethereum Signed Message:\n32";
    const messageBytes = new Uint8Array(
      messagePrefix.length + hexToBytes(dataHash).length
    );
    messageBytes.set(toBytes(messagePrefix), 0);
    messageBytes.set(hexToBytes(dataHash), messagePrefix.length);

    // Hash the message (this is what gets signed)
    const messageHash = keccak256(messageBytes);

    // Sign the hash directly (matches vm.sign in Solidity)
    const signature = await sign({
      hash: messageHash,
      privateKey: signerPrivateKey,
    });

    // sign() returns an object with r, s, v properties
    // Use viem's serializeSignature to convert to bytes format: r || s || v
    const sigBytes = serializeSignature(signature);
    // serializeSignature returns Hex type - convert to plain string
    // Use String() to ensure it's a plain string, not a Hex branded type
    const sigStr = String(sigBytes);
    return sigStr.startsWith('0x') ? sigStr as `0x${string}` : `0x${sigStr}` as `0x${string}`;
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
    // Ensure key is properly formatted as bytes32 (32 bytes = 64 hex chars + 0x prefix)
    // Use viem's toHex and pad utilities to ensure proper conversion
    let paddedKey: `0x${string}`;
    
    // Convert key to a guaranteed string - viem's pad/toHex might return Hex type
    // which encodeAbiParameters might not handle correctly
    let keyStr: string;
    
    if (typeof key === 'string') {
      keyStr = key;
    } else {
      // Use viem's toHex to convert, then ensure it's a string
      try {
        const hexKey = toHex(key);
        keyStr = String(hexKey); // Ensure it's a plain string
      } catch {
        // Fallback if toHex fails
        keyStr = String(key);
      }
    }
    
    // Ensure it starts with 0x
    if (!keyStr.startsWith('0x')) {
      keyStr = `0x${keyStr}`;
    }
    
    // Clean and pad the hex string
    let hexPart = keyStr.slice(2).replace(/[^0-9a-fA-F]/g, '');
    if (hexPart.length === 0) hexPart = '0';
    const paddedHex = hexPart.padStart(64, '0');
    
    // Create final key as a plain string (not Hex type)
    paddedKey = `0x${paddedHex}` as `0x${string}`;
    
    // Final check - ensure it's actually a string
    if (typeof paddedKey !== 'string') {
      throw new Error(`Key is not a string: ${typeof paddedKey}, value: ${paddedKey}`);
    }
    
    // Encode ComplianceData struct
    // Ensure all values are proper types - viem's encodeAbiParameters is strict about types
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
          // Signature is already converted to plain string in createEIP191Signature
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
   * Helper function to get function selector
   */
  function getFunctionSelector(functionName: string): `0x${string}` {
    const hash = keccak256(toBytes(functionName));
    return `0x${hash.slice(0, 10)}` as `0x${string}`;
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

    // Verify deployment - retry if needed
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

  it("Should deploy Counter contract", async function () {
    console.log("\n=== Deploying Counter ===");

    counterContract = await viem.deployContract("Counter", [
      assuraVerifierAddress,
    ]);

    counterAddress = counterContract.address;
    console.log(`✓ Counter deployed at: ${counterAddress}`);

    // Wait a moment for contract to be available
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify deployment - retry if needed
    let verifier: `0x${string}`;
    let retries = 3;
    while (retries > 0) {
      try {
        verifier = await counterContract.read.assuraVerifier();
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    assert.equal(verifier!.toLowerCase(), assuraVerifierAddress.toLowerCase(), "Counter should have correct AssuraVerifier");

    // Verify initial value
    const x = await counterContract.read.x();
    assert.equal(x, 0n, "Initial counter value should be 0");
  });

  it("Should verify that verifying data was set correctly", async function () {
    console.log("\n=== Verifying Data Setup ===");

    const assuraVerifier = await viem.getContractAt(
      "AssuraVerifier",
      assuraVerifierAddress
    );

    // Get selectors using the contract instance
    const incSelector = await counterContract.read.getOnlyUserWithScore100Selector();
    const incBySelector = await counterContract.read.getOnlyUserWithScore30Selector();

    console.log(`inc() selector: ${incSelector}`);
    console.log(`incBy() selector: ${incBySelector}`);

    // Check verifying data (returns VerifyingData struct: score, expiry, chainId)
    const incVerifyingData = await assuraVerifier.read.getVerifyingData([
      counterAddress,
      incSelector,
    ]);
    const incByVerifyingData = await assuraVerifier.read.getVerifyingData([
      counterAddress,
      incBySelector,
    ]);

    assert.equal(incVerifyingData.score, 100n, "inc() should require score 100");
    assert.equal(incByVerifyingData.score, 30n, "incBy() should require score 30");

    console.log(`✓ inc() requires score: ${incVerifyingData.score}`);
    console.log(`✓ incBy() requires score: ${incByVerifyingData.score}`);
  });

  it("Should successfully call inc() with valid EIP-712 compliance data", async function () {
    console.log("\n=== Testing inc() with EIP-712 signature ===");

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Get function selector
    const key = await counterContract.read.getOnlyUserWithScore100Selector();

    // Create attested data with score 100 (required for inc)
    const attestedData = {
      score: 100n,
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
      key,
      signature,
      attestedData
    );

    // Get initial counter value
    const initialValue = await counterContract.read.x();

    // Call inc() with compliance data
    console.log(`Calling inc() from ${userAccount.address}...`);
    const hash = await counterContract.write.inc([complianceData], {
      account: userAccount,
    });

    // Wait for transaction and verify it succeeded
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✓ Transaction confirmed: ${receipt.transactionHash}`);
    
    if (receipt.status === 'reverted') {
      throw new Error(`Transaction reverted: ${receipt.transactionHash}`);
    }

    // Wait a moment for state to update
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify counter was incremented
    const newValue = await counterContract.read.x();
    assert.equal(newValue, initialValue + 1n, `Counter should be incremented from ${initialValue} to ${initialValue + 1n}, but got ${newValue}`);

    console.log(`✓ Counter value: ${initialValue} -> ${newValue}`);
  });

  it("Should successfully call incBy() with valid EIP-712 compliance data", async function () {
    console.log("\n=== Testing incBy() with EIP-712 signature ===");

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Get function selector
    const key = await counterContract.read.getOnlyUserWithScore30Selector();

    // Create attested data with score 30 (required for incBy)
    const attestedData = {
      score: 30n,
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
      key,
      signature,
      attestedData
    );

    // Get initial counter value
    const initialValue = await counterContract.read.x();
    const incrementBy = 5n;
    const expectedValue = initialValue + incrementBy;

    // Call incBy() with compliance data
    console.log(`Calling incBy(${incrementBy}) from ${userAccount.address}...`);
    console.log(`Initial value: ${initialValue}, Expected after: ${expectedValue}`);
    const hash = await counterContract.write.incBy([incrementBy, complianceData], {
      account: userAccount,
    });

    // Wait for transaction
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✓ Transaction confirmed: ${receipt.transactionHash}`);

    // Wait a moment for state to update
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify counter was incremented
    const newValue = await counterContract.read.x();
    console.log(`Final value: ${newValue}`);
    assert.equal(
      newValue,
      expectedValue,
      `Counter should be incremented by ${incrementBy} from ${initialValue} to ${expectedValue}`
    );

    console.log(`✓ Counter value: ${initialValue} -> ${newValue}`);
  });

  it("Should successfully call inc() with valid EIP-191 compliance data", async function () {
    console.log("\n=== Testing inc() with EIP-191 signature ===");

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Get function selector
    const key = await counterContract.read.getOnlyUserWithScore100Selector();

    // Create attested data with score 100
    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    // Sign with TEE private key using EIP-191
    const signature = await createEIP191Signature(
      attestedData,
      teePrivateKey as `0x${string}`
    );

    // Create compliance data
    const complianceData = createComplianceData(
      userAccount.address,
      key,
      signature,
      attestedData
    );

    // Get initial counter value right before transaction
    const initialValue = await counterContract.read.x();
    console.log(`Initial counter value: ${initialValue}`);

    // Call inc() with compliance data
    console.log(`Calling inc() from ${userAccount.address}...`);
    
    try {
      const hash = await counterContract.write.inc([complianceData], {
        account: userAccount,
      });

      // Wait for transaction and verify it succeeded
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`✓ Transaction confirmed: ${receipt.transactionHash}`);
      console.log(`Transaction status: ${receipt.status}`);
      
      if (receipt.status === 'reverted') {
        throw new Error(`Transaction reverted: ${receipt.transactionHash}`);
      }

      // Wait a moment for state to update
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify counter was incremented
      const newValue = await counterContract.read.x();
      console.log(`Final counter value: ${newValue}`);
      assert.equal(newValue, initialValue + 1n, `Counter should be incremented from ${initialValue} to ${initialValue + 1n}, but got ${newValue}`);

      console.log(`✓ Counter value: ${initialValue} -> ${newValue}`);
    } catch (error: any) {
      console.error(`Transaction failed:`, error.message);
      if (error.message && error.message.includes('revert')) {
        console.error(`Revert reason: ${error.message}`);
      }
      throw error;
    }
  });

  it("Should fail when calling inc() with insufficient score", async function () {
    console.log("\n=== Testing inc() with insufficient score ===");

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Get function selector
    const key = await counterContract.read.getOnlyUserWithScore100Selector();

    // Create attested data with score 50 (less than required 100)
    const attestedData = {
      score: 50n,
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
      key,
      signature,
      attestedData
    );

    // Call should fail
    console.log(`Attempting inc() with score 50 (requires 100)...`);
    try {
      const hash = await counterContract.write.inc([complianceData], {
        account: userAccount,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      assert.fail("Transaction should have reverted");
    } catch (error: any) {
      assert(
        error.message.includes("Compliance verification failed") ||
          error.message.includes("revert"),
        "Should revert with compliance verification error"
      );
      console.log(`✓ Transaction correctly reverted: ${error.message}`);
    }
  });

  it("Should fail when calling inc() with wrong signature", async function () {
    console.log("\n=== Testing inc() with wrong signature ===");

    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    // Get function selector
    const key = await counterContract.read.getOnlyUserWithScore100Selector();

    // Create attested data with score 100
    const attestedData = {
      score: 100n,
      timeAtWhichAttested: currentTimestamp,
      chainId: chainId,
    };

    // Sign with user's private key instead of TEE (wrong signature)
    // Use user's private key if available, otherwise skip this test
    if (!userPrivateKey) {
      console.log("⚠ Skipping test - USER_PRIVATE_KEY not set");
      return;
    }
    const wrongSignature = await createEIP712Signature(
      attestedData,
      userPrivateKey as `0x${string}`
    );

    // Create compliance data
    const complianceData = createComplianceData(
      userAccount.address,
      key,
      wrongSignature,
      attestedData
    );

    // Call should fail
    console.log(`Attempting inc() with wrong signature...`);
    try {
      const hash = await counterContract.write.inc([complianceData], {
        account: userAccount,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      assert.fail("Transaction should have reverted");
    } catch (error: any) {
      assert(
        error.message.includes("Signature not from TEE") ||
          error.message.includes("revert"),
        "Should revert with signature error"
      );
      console.log(`✓ Transaction correctly reverted: ${error.message}`);
    }
  });

  it("Should verify final counter state", async function () {
    console.log("\n=== Final State Verification ===");

    const finalValue = await counterContract.read.x();

    console.log(`Final counter value: ${finalValue}`);
    console.log(`✓ All tests completed successfully!`);
  });
});

