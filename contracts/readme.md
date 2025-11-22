# Assura - Trusted Execution Environment (TEE) Based Compliance Verification

Assura is a smart contract system that enables on-chain compliance verification using attestations signed by a Trusted Execution Environment (TEE). It allows applications to enforce compliance requirements (such as minimum scores, expiry times, and chain-specific rules) while maintaining privacy and security through cryptographic signatures.

## Overview

The Assura system consists of two main components:

1. **AssuraVerifier**: A central verification contract that validates compliance attestations
2. **Application Contracts**: Smart contracts (like `Counter`) that use AssuraVerifier to enforce compliance requirements

## Architecture

### How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   TEE       │         │ AssuraVerifier│        │ Application │
│  (Signer)   │────────▶│   Contract   │◀───────│  Contract   │
└─────────────┘         └──────────────┘         └─────────────┘
     │                         │                         │
     │ Signs                   │ Verifies                │ Enforces
     │ Attestations            │ Signatures              │ Compliance
     │                         │                         │
     └─────────────────────────┴─────────────────────────┘
                    User submits compliance data
```

### Key Components

#### 1. AssuraVerifier Contract

The `AssuraVerifier` contract is the core verification system that:

- **Stores Verification Requirements**: Each application contract can register verification requirements (score thresholds, expiry times, chain IDs) for specific functions
- **Validates TEE Signatures**: Verifies that compliance attestations are signed by the authorized TEE address
- **Checks Compliance**: Validates that user attestations meet the required criteria

**Key Functions:**
- `setVerifyingData()`: Allows application contracts to set their verification requirements
- `verify()`: Validates compliance data and TEE signatures
- `updateAssuraTeeAddress()`: Allows owner to update the TEE address

#### 2. ComplianceData Structure

When a user wants to interact with a compliance-protected function, they must provide:

```solidity
struct ComplianceData {
    address userAddress;                    // The user's address
    bytes32 key;                            // Function selector (e.g., inc.selector)
    bytes signedAttestedDataWithTEESignature; // TEE signature over ActualAttestedData
    ActualAttestedData actualAttestedData;   // The attested data (score, timestamp, chainId)
}
```

#### 3. ActualAttestedData Structure

The data that the TEE signs:

```solidity
struct ActualAttestedData {
    uint256 score;              // User's compliance score
    uint256 timeAtWhichAttested; // Timestamp when attestation was created
    uint256 chainId;            // Chain ID where attestation is valid
}
```

#### 4. VerifyingData Structure

Requirements set by application contracts:

```solidity
struct VerifyingData {
    uint256 score;    // Minimum required score (0 = no requirement)
    uint256 expiry;   // Expiry timestamp (0 = no expiry)
    uint256 chainId;  // Required chain ID (0 = any chain)
}
```

## Verification Flow

### Step-by-Step Process

1. **TEE Attestation**:
   - User requests compliance attestation from TEE
   - TEE evaluates user's compliance status and generates `ActualAttestedData`
   - TEE signs the data using EIP-191 format: `keccak256("\x19Ethereum Signed Message:\n32" || keccak256(abi.encode(actualAttestedData)))`
   - TEE returns signature to user

2. **User Prepares Compliance Data**:
   - User creates `ComplianceData` struct with:
     - Their address
     - Function selector (key)
     - TEE signature
     - The attested data
   - Encodes it: `bytes complianceData = abi.encode(complianceData)`

3. **User Calls Application Function**:
   - User calls the application function (e.g., `counter.inc(complianceData)`)
   - Function uses `onlyComplianceUser` modifier

4. **Verification Process**:
   - Modifier calls `assuraVerifier.verify(app, key, complianceData)`
   - AssuraVerifier:
     - Decodes `ComplianceData` from bytes
     - Verifies key matches function selector
     - Recovers signer from TEE signature using `ecrecover`
     - Validates signer matches `ASSURA_TEE_ADDRESS`
     - Checks expiry (if set)
     - Checks chainId (if set)
     - Validates score meets requirement
   - Returns `true` if all checks pass

5. **Function Execution**:
   - If verification passes, function executes
   - If verification fails, transaction reverts

## Example: Counter Contract

The `Counter` contract demonstrates how to use AssuraVerifier:

### Setup

```solidity
constructor(address _assuraVerifier) {
    assuraVerifier = IAssuraVerifier(_assuraVerifier);
    
    // Set requirements: inc() requires score >= 100
    assuraVerifier.setVerifyingData(
        address(this),
        this.inc.selector,
        VerifyingData({score: 100, expiry: 0, chainId: 0})
    );
    
    // Set requirements: incBy() requires score >= 30
    assuraVerifier.setVerifyingData(
        address(this),
        this.incBy.selector,
        VerifyingData({score: 30, expiry: 0, chainId: 0})
    );
}
```

### Usage

```solidity
// User must provide valid compliance data
function inc(bytes calldata attestedData) 
    public 
    onlyComplianceUser(this.inc.selector, attestedData) 
{
    x++;
    emit Increment(1);
}
```

## Security Features

1. **TEE Signature Verification**: Only attestations signed by the authorized TEE address are accepted
2. **Key Matching**: Ensures compliance data is for the correct function
3. **Score Validation**: Enforces minimum compliance scores
4. **Expiry Checks**: Supports time-limited attestations
5. **Chain Validation**: Can enforce chain-specific requirements
6. **Access Control**: Only application contracts can set their own verification data

## Setup

### Prerequisites

- Node.js (v18 or higher)
- pnpm (or npm/yarn)

### Installation

```bash
# Install dependencies
pnpm install
```

### Dependencies

The project uses:
- **Hardhat 3**: Development environment and testing framework
- **forge-std**: Solidity testing utilities (for assertion libraries like `Test.sol`)
- **Solidity ^0.8.28**: Smart contract language

The tests use `forge-std/Test.sol` for better assertion messages and testing utilities, which is compatible with Hardhat 3's Solidity testing.

## Testing

The project includes comprehensive Solidity tests in `contracts/test/Counter.t.sol` (following Hardhat 3's `.t.sol` convention) that demonstrate:

- Contract deployment
- Valid compliance attestations
- Invalid signatures (wrong signer)
- Insufficient scores
- Wrong function keys
- Multiple increments

### Running Tests

In Hardhat 3, Solidity test files are located in:
- `test/` directory, OR
- `contracts/` directory with `.t.sol` extension (as used in this project)

To run tests:

```bash
# Run all tests (both Solidity and TypeScript)
npx hardhat test

# Run only Solidity tests (recommended for this project)
npx hardhat test solidity

# Run only TypeScript tests
npx hardhat test nodejs

# Run a specific test file
npx hardhat test solidity contracts/test/Counter.t.sol
```

**Note**: If you encounter compilation errors related to OpenZeppelin dependencies in `node_modules`, make sure you're running `npx hardhat test solidity` which will only compile and test your Solidity files, not the entire `node_modules` directory.

For more information on Hardhat 3 Solidity testing, see the [official documentation](https://hardhat.org/docs/guides/testing/using-solidity).

## Deployment

### Deploy AssuraVerifier

1. Deploy `AssuraVerifier` with:
   - Owner address (can update TEE address)
   - TEE address (signs attestations)

```solidity
AssuraVerifier verifier = new AssuraVerifier(owner, teeAddress);
```

### Deploy Application Contract

1. Deploy your application contract with AssuraVerifier address:

```solidity
Counter counter = new Counter(address(verifier));
```

2. The constructor automatically sets verification requirements

## Integration Guide

To integrate Assura into your smart contract:

1. **Import IAssuraVerifier**:
   ```solidity
   import {IAssuraVerifier, VerifyingData} from "./assura/IAssuraVerifier.sol";
   ```

2. **Store Verifier Reference**:
   ```solidity
   IAssuraVerifier public assuraVerifier;
   ```

3. **Set Requirements in Constructor**:
   ```solidity
   constructor(address _assuraVerifier) {
       assuraVerifier = IAssuraVerifier(_assuraVerifier);
       assuraVerifier.setVerifyingData(
           address(this),
           this.myFunction.selector,
           VerifyingData({score: 50, expiry: 0, chainId: 0})
       );
   }
   ```

4. **Add Compliance Modifier**:
   ```solidity
   modifier onlyComplianceUser(bytes32 key, bytes calldata attestedData) {
       require(
           assuraVerifier.verify(address(this), key, attestedData),
           "Not a compliance user"
       );
       _;
   }
   ```

5. **Protect Functions**:
   ```solidity
   function myFunction(bytes calldata attestedData) 
       public 
       onlyComplianceUser(this.myFunction.selector, attestedData) 
   {
       // Your function logic
   }
   ```

## Data Structures Reference

### ComplianceData
- `userAddress`: Address of the user requesting access
- `key`: Function selector (bytes32)
- `signedAttestedDataWithTEESignature`: 65-byte ECDSA signature from TEE
- `actualAttestedData`: The attested compliance data

### ActualAttestedData
- `score`: User's compliance score (uint256)
- `timeAtWhichAttested`: Block timestamp when attestation was created
- `chainId`: Chain ID where attestation is valid

### VerifyingData
- `score`: Minimum required score (0 = no requirement)
- `expiry`: Expiry timestamp (0 = no expiry)
- `chainId`: Required chain ID (0 = any chain)

## Signature Format

The TEE signs using EIP-191 standard:

```
hash = keccak256(
    abi.encodePacked(
        "\x19Ethereum Signed Message:\n32",
        keccak256(abi.encode(actualAttestedData))
    )
)
```

Signature is 65 bytes: `r` (32 bytes) + `s` (32 bytes) + `v` (1 byte)

## Project Structure

```
contracts/
├── contracts/
│   ├── assura/
│   │   ├── AssuraVerifier.sol    # Main verification contract
│   │   └── IAssuraVerifier.sol   # Interface
│   ├── Counter.sol               # Example application contract
│   └── test/
│       └── Counter.t.sol         # Comprehensive test suite
└── README.md                      # This file
```

## Future Enhancements

- Support for multiple TEE addresses
- Revocation mechanisms for attestations
- Batch verification for multiple functions
- Gas optimization improvements
- Additional compliance criteria types

## License

UNLICENSED
