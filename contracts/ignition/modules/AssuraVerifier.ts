import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AssuraVerifierModule", (m) => {
  const owner = m.getParameter("owner");
  const teeAddress = m.getParameter("teeAddress");

  const assuraVerifier = m.contract("AssuraVerifier", [owner, teeAddress]);

  return { AssuraVerifier: assuraVerifier };
});

