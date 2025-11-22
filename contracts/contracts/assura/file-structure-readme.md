# Assura Compliance Verification System

A production-ready compliance verification system for Ethereum smart contracts, providing confidence scoring, time-based locks, and chain-specific verification.

## Overview

The Assura system allows smart contracts to verify user compliance before allowing certain operations. It uses a Trusted Execution Environment (TEE) to generate signed attestations that can be verified on-chain.

## Architecture

```
assura/
├── types/
│   └── AssuraTypes.sol          # Type definitions
├── libraries/
│   └── AssuraVerifierLib.sol    # Verification logic library
├── IAssuraVerifier.sol          # Interface
├── AssuraVerifier.sol           # Main verification contract
└── examples/
    └── AssuraProtectedVault.sol # Example integration
```

## Components

### Types (`types/AssuraTypes.sol`)

Defines the core data structures:

- **`AttestedData`**: Data structure for TEE-signed attestations
  - `score`: Confidence score (0-1000)
  - `timeAtWhichAttested`: Timestamp of attestation
  - `chainId`: Chain ID where attestation is valid

- **`VerifyingData`**: Requirements for verification
  - `score`: Minimum required score
  - `expiry`: Expiry timestamp (0 = no expiry)
  - `chainId`: Required chain ID (0 = any chain)

- **`ComplianceData`**: Complete compliance data structure
  - `userAddress`: Address being verified
  - `key`: Verification key identifier
  - `signedAttestedDataWithTEESignature`: TEE signature
  - `actualAttestedData`: Decoded attestation data

### Library (`libraries/AssuraVerifierLib.sol`)

Provides reusable verification functions:

- `verifySignature()`: Verifies TEE signatures (supports EIP-712 and EIP-191)
- `checkRequirements()`: Validates compliance against requirements
- `decodeComplianceData()`: Decodes compliance data from bytes
- `requireCompliance()`: **Helper function for modifiers** - Verifies compliance and reverts if failed

### Main Contract (`AssuraVerifier.sol`)

The central verification contract that:

- Stores verification requirements per app/key
- Verifies compliance attestations
- Manages TEE address (updatable by owner)

## Usage

### 1. Deploy AssuraVerifier

```solidity
address owner = msg.sender;
address teeAddress = 0x...; // Your TEE address

AssuraVerifier verifier = new AssuraVerifier(owner, teeAddress);
```

### 2. Set Verification Requirements

In your contract's constructor or setup function:

```solidity
import {IAssuraVerifier} from "./assura/IAssuraVerifier.sol";
import {AssuraTypes} from "./assura/types/AssuraTypes.sol";

contract MyContract {
    IAssuraVerifier public immutable assuraVerifier;
    bytes32 public immutable verificationKey;
    
    constructor(IAssuraVerifier _verifier, bytes32 _key) {
        assuraVerifier = _verifier;
        verificationKey = _key;
        
        // Set requirements: min score 500, no expiry, any chain
        AssuraTypes.VerifyingData memory req = AssuraTypes.VerifyingData({
            score: 500,
            expiry: 0,
            chainId: 0
        });
        
        assuraVerifier.setVerifyingData(address(this), _key, req);
    }
}
```

### 3. Verify Compliance

#### Option A: Using the Library Modifier Helper (Recommended)

Create a modifier using `AssuraVerifierLib.requireCompliance()`:

```solidity
import {AssuraVerifierLib} from "./assura/libraries/AssuraVerifierLib.sol";

contract MyContract {
    IAssuraVerifier public immutable assuraVerifier;
    bytes32 public immutable verificationKey;
    
    modifier onlyCompliant(bytes calldata complianceData) {
        AssuraVerifierLib.requireCompliance(
            assuraVerifier,
            address(this),
            verificationKey,
            complianceData
        );
        _;
    }
    
    function deposit(uint256 amount, bytes calldata complianceData) 
        external 
        onlyCompliant(complianceData) 
    {
        // Compliance is already verified by the modifier!
        // Proceed with deposit
        // ...
    }
}
```

#### Option B: Manual Verification

If you need more control, verify manually:

```solidity
function deposit(uint256 amount, bytes calldata complianceData) external {
    // Verify compliance
    require(
        assuraVerifier.verify(address(this), verificationKey, complianceData),
        "Compliance check failed"
    );
    
    // Decode to get user info
    AssuraTypes.ComplianceData memory data = 
        AssuraVerifierLib.decodeComplianceData(complianceData);
    
    require(data.userAddress == msg.sender, "Invalid user");
    
    // Proceed with deposit
    // ...
}
```

## Example Integration

See `examples/AssuraProtectedVault.sol` for a complete example of integrating Assura into an ERC-4626 vault.

Key features:
- Compliance-gated deposits
- Configurable score requirements
- Time-based expiry support
- Chain-specific verification

## Security Considerations

1. **TEE Address**: Ensure the TEE address is correct and secure
2. **Key Management**: Use unique keys per app/feature
3. **Score Requirements**: Set appropriate minimum scores
4. **Expiry**: Consider setting expiry times for time-sensitive operations
5. **Chain ID**: Verify chain ID matches your deployment

## Events

- `AssuraTeeAddressUpdated`: Emitted when TEE address is updated
- `VerifyingDataSet`: Emitted when verification requirements are set

## License

MIT

