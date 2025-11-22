import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("VaultModule", (m) => {
  // Option 1: Deploy with a mock token (for testing)
  // Uncomment the following lines if you want to deploy a mock token:
  // const mockToken = m.contract("MockERC20", ["Test Token", "TEST"]);
  // const admin = m.getAccount(0);
  // const vault = m.contract("Vault", [mockToken, "Vault Token", "VAULT", admin]);

  // Option 2: Deploy with an existing token address
  // Replace with your actual token address and admin address:
  const assetAddress = m.getParameter("assetAddress", "0x0000000000000000000000000000000000000000");
  const admin = m.getParameter("admin", m.getAccount(0));
  const vaultName = m.getParameter("vaultName", "Vault Token");
  const vaultSymbol = m.getParameter("vaultSymbol", "VAULT");
  
  const vault = m.contract("Vault", [assetAddress, vaultName, vaultSymbol, admin]);

  return { vault };
});

