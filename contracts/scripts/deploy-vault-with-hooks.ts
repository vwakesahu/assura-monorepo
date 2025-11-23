import { ethers } from "hardhat";

/**
 * Deployment script for Assura Protected Vault with Delayed Deposit Hooks
 *
 * This script demonstrates:
 * 1. Deploying a vault with hook support
 * 2. Setting up the delayed deposit hook
 * 3. Configuring the system for new users with compliance delays
 */
async function main() {
  console.log("🚀 Deploying Assura Protected Vault with Hooks...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer address:", deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Step 1: Deploy or get existing AssuraVerifier
  console.log("📋 Step 1: Setting up AssuraVerifier...");

  // Replace with your actual TEE address
  const ASSURA_TEE_ADDRESS = process.env.ASSURA_TEE_ADDRESS || deployer.address;

  const AssuraVerifier = await ethers.getContractFactory("AssuraVerifier");
  const assuraVerifier = await AssuraVerifier.deploy(deployer.address, ASSURA_TEE_ADDRESS);
  await assuraVerifier.waitForDeployment();

  console.log("   ✅ AssuraVerifier deployed at:", await assuraVerifier.getAddress());

  // Get the NexusAccountDeployer that was auto-deployed by AssuraVerifier
  const nexusDeployerAddress = await assuraVerifier.nexusAccountDeployer();
  console.log("   ✅ NexusAccountDeployer at:", nexusDeployerAddress);
  console.log();

  // Step 2: Deploy or get underlying asset (mock USDC for demo)
  console.log("📋 Step 2: Setting up underlying asset...");

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const asset = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
  await asset.waitForDeployment();

  const assetAddress = await asset.getAddress();
  console.log("   ✅ Mock asset deployed at:", assetAddress);

  // Mint some tokens to deployer for testing
  await asset.mint(deployer.address, ethers.parseUnits("1000000", 6));
  console.log("   ✅ Minted 1,000,000 mUSDC to deployer");
  console.log();

  // Step 3: Deploy DelayedDepositHook
  console.log("📋 Step 3: Deploying DelayedDepositHook...");

  // We'll deploy vault first, then hook, then update vault
  // For now, deploy vault with zero hook address

  // Step 4: Deploy Vault with Hooks
  console.log("📋 Step 4: Deploying AssuraProtectedVaultWithHooks...");

  const verificationKey = ethers.id("DEFAULT_KEY");

  const VaultWithHooks = await ethers.getContractFactory("AssuraProtectedVaultWithHooks");
  const vault = await VaultWithHooks.deploy(
    assetAddress,
    "Assura Vault Shares",
    "aVaultS",
    await assuraVerifier.getAddress(),
    verificationKey,
    ethers.ZeroAddress // Hook will be set later
  );
  await vault.waitForDeployment();

  const vaultAddress = await vault.getAddress();
  console.log("   ✅ Vault deployed at:", vaultAddress);
  console.log();

  // Step 5: Deploy DelayedDepositHook
  console.log("📋 Step 5: Deploying DelayedDepositHook...");

  const DelayedDepositHook = await ethers.getContractFactory("DelayedDepositHook");
  const hook = await DelayedDepositHook.deploy(
    vaultAddress,
    nexusDeployerAddress
  );
  await hook.waitForDeployment();

  const hookAddress = await hook.getAddress();
  console.log("   ✅ DelayedDepositHook deployed at:", hookAddress);
  console.log();

  // Step 6: Set hook on vault
  console.log("📋 Step 6: Configuring vault with hook...");

  await vault.setDepositHook(hookAddress);
  console.log("   ✅ Hook configured on vault");
  console.log();

  // Step 7: Deploy DelayedDepositManager (helper contract)
  console.log("📋 Step 7: Deploying DelayedDepositManager helper...");

  const DelayedDepositManager = await ethers.getContractFactory("DelayedDepositManager");
  const manager = await DelayedDepositManager.deploy();
  await manager.waitForDeployment();

  console.log("   ✅ DelayedDepositManager deployed at:", await manager.getAddress());
  console.log();

  // Summary
  console.log("=" .repeat(80));
  console.log("📦 DEPLOYMENT SUMMARY");
  console.log("=" .repeat(80));
  console.log("AssuraVerifier:          ", await assuraVerifier.getAddress());
  console.log("NexusAccountDeployer:    ", nexusDeployerAddress);
  console.log("Mock Asset (mUSDC):      ", assetAddress);
  console.log("Vault with Hooks:        ", vaultAddress);
  console.log("DelayedDepositHook:      ", hookAddress);
  console.log("DelayedDepositManager:   ", await manager.getAddress());
  console.log("=" .repeat(80));
  console.log();

  // Example usage flow
  console.log("💡 EXAMPLE USAGE FLOW:");
  console.log("=" .repeat(80));
  console.log(`
1. User approves vault to spend tokens:
   await asset.approve("${vaultAddress}", amount);

2. User calls vault with compliance data (low score = delay):
   await vault.depositWithScore100(assets, receiver, attestedComplianceData);

   If user's score is insufficient:
   - Funds are transferred to DelayedDepositHook
   - Nexus account is deployed for the user
   - Bypass entry created with expiry time
   - Returns 0 shares (deposit delayed)

3. After delay expires, user claims their deposit:
   await manager.claimAllDeposits("${hookAddress}");

   This will:
   - Transfer assets from hook to vault
   - Mint vault shares to user's nexus account
   - User receives their shares after the delay period

4. Check pending deposits anytime:
   const pending = await manager.getPendingDeposits("${hookAddress}", userAddress);
   const claimable = await manager.getClaimableDeposits("${hookAddress}", userAddress);
  `);
  console.log("=" .repeat(80));
  console.log();

  // Save deployment addresses to file
  const fs = require("fs");
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    timestamp: new Date().toISOString(),
    contracts: {
      AssuraVerifier: await assuraVerifier.getAddress(),
      NexusAccountDeployer: nexusDeployerAddress,
      MockAsset: assetAddress,
      VaultWithHooks: vaultAddress,
      DelayedDepositHook: hookAddress,
      DelayedDepositManager: await manager.getAddress(),
    },
    config: {
      verificationKey: verificationKey,
      assuraTeeAddress: ASSURA_TEE_ADDRESS,
    }
  };

  const outputPath = "./deployments/vault-with-hooks.json";
  fs.mkdirSync("./deployments", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("✅ Deployment info saved to:", outputPath);
  console.log();
  console.log("🎉 Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
