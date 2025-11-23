# Assura Network

## Short Description

A compliance layer enabling developers to easily integrate compliance into smart contracts in minutes.

## Description

Assura Network is a developer-friendly compliance layer that simplifies regulatory compliance for blockchain applications. Instead of building compliance infrastructure from scratch, developers can integrate Assura in under an hour and immediately enforce programmable compliance rules.

### For Developers: Easy Integration

Assura provides a simple, modular approach to compliance:

1. **Import the Assura contracts** - Add a few imports to your smart contract
2. **Set your requirements** - Define minimum scores, expiry times, and chain restrictions
3. **Add a modifier** - Protect your functions with a single modifier
4. **Done** - Compliance is now enforced automatically

No need to build KYC systems, manage user databases, or handle complex compliance logic. Assura handles all of this through its Oasis TEE (Trusted Execution Environment) infrastructure, which evaluates users off-chain and provides cryptographically signed attestations that are verified on-chain.

### Core Compliance Features

Assura Network enables three core programmable compliance values that are attested by the Oasis TEE and verified on-chain by your smart contract:

### 1. Confidence Score

A numeric score between 0–1000 that evaluates a user's wallet activity and identity level. Examples of factors included:
- Whether the user has completed self-based KYC
- Wallet age / when it was funded
- Interaction with privacy protocols
- Interaction with sanctioned addresses
- Optional full video + passport KYC (stored securely and encrypted inside the Oasis TEE, grants the maximum confidence score)

### 2. Time-Based Bypass

If an app requires a score higher than a user's confidence score and the user does not want to provide more information, Assura introduces a time-based interface where:
- The user's assets are temporarily held inside a smart account owned entirely by the user
- A time-based lock is applied depending on the app's required score
- During this period, funds remain in the user-owned smart account
- After time expires, the signed intent can be executed into the protocol
- Users can also force-withdraw if they choose
- This works with any protocol, since the smart account is fully user-owned and Assura only enforces timing rules based on the app's compliance configuration

### 3. Expiry

All attestations include an expiry. Once expired, the attestation is no longer valid on-chain and must be refreshed by the user.

### Programmable Configuration

All compliance parameters are configured directly in your smart contract, making your application fully programmable from deployment. Assura reads this configuration off-chain before issuing any attestations. You can define:
- Required app score (minimum confidence level)
- Allowed/blocked country codes (hex format)
- Minimum required time (for time-based bypass)
- Intermediate controlled account (with self custody)
- Other compliance rules

This means your compliance rules are part of your contract's immutable configuration, ensuring consistent enforcement and eliminating the need for centralized compliance management.

### Why Use Assura?

**For Developers:**
- **Fast Integration**: Add compliance to your app in under an hour
- **No Infrastructure**: No need to build KYC systems or manage user databases
- **Flexible**: Configure compliance rules per function or per contract
- **Secure**: Leverages Oasis TEE for secure, verifiable attestations
- **Gas Efficient**: Minimal on-chain overhead, most computation happens off-chain
- **Optimized Performance**: ENS subdomain system enables fast verification for returning compliant users
- **Future-Proof**: Compliance rules can be updated without redeploying contracts

**For Your Users:**
- **Privacy-Preserving**: Users don't need to share sensitive data on-chain
- **Flexible Options**: Can provide KYC for higher scores or use time-based bypass
- **Self-Custody**: Users maintain full control of their assets
- **Cross-App**: Single attestation can be used across multiple Assura-protected apps

### Customer Groups

**1. Institutions**
Institutions can use Assura to offer a verifiable interface for liquidity provision, tokenization of RWAs or stocks, and other financial activity ensuring that only compliant users can access or trade through their interface.

**2. App Builders**
App builders can instantly launch compliance-ready applications that only allow specific users to interact with their apps, preventing access from sanctioned regions, hacker groups, or other restricted categories. This removes the need for builders to handle compliance logic themselves.

**3. Users**
For users, Assura generates attested tax reports that summarize all activity performed with their wallets across both compliant and non-compliant apps, making legal and reporting processes significantly easier.

## How It's Made

### Architecture Overview

The Assura system consists of three main components:

1. **Oasis TEE (Trusted Execution Environment)**: Off-chain service running on Oasis that evaluates user compliance and signs attestations securely
2. **AssuraVerifier Contract**: On-chain verification contract that validates Oasis TEE signatures and enforces compliance rules
3. **Application Contracts**: Your smart contracts that integrate Assura for compliance protection

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ Oasis TEE   │         │ AssuraVerifier│        │ Application │
│  (Signer)   │────────▶│   Contract   │◀───────│  Contract   │
└─────────────┘         └──────────────┘         └─────────────┘
     │                         │                         │
     │ Signs                   │ Verifies                │ Enforces
     │ Attestations            │ Signatures              │ Compliance
     │                         │                         │
     └─────────────────────────┴─────────────────────────┘
                    User submits compliance data
```

### ENS Subdomain System for Compliant User Tracking

Assura uses **ENS subdomains with an off-chain resolver** to efficiently track users who have already interacted and meet compliance score criteria. This optimization reduces redundant verification and improves user experience.

**How It Works:**

1. **Subdomain Creation**: When a user successfully interacts with an Assura-protected application and meets the required score criteria, the Oasis TEE creates an ENS subdomain under `assuranet.eth` for that user
2. **Off-Chain Resolver**: The subdomain uses an off-chain resolver (via Namespace) to store compliance metadata without on-chain gas costs
3. **Fast Verification**: On subsequent interactions, the TEE can quickly check if a user already has a compliant subname, avoiding redundant verification
4. **Metadata Storage**: The subdomain can store text records containing:
   - User's compliance score
   - Last verification timestamp
   - Compliance status flags
   - Other relevant metadata

**Benefits:**

- **Performance**: Faster attestation for returning users who already meet score requirements
- **Cost Efficiency**: Off-chain storage reduces gas costs for compliance tracking
- **User Experience**: Returning compliant users get instant verification without re-evaluation
- **Decentralized**: Uses ENS infrastructure for decentralized identity and compliance tracking

**Example Flow:**

1. User `0x123...` interacts with an Assura-protected app with score 750
2. User meets the app's requirement (score ≥ 500)
3. Oasis TEE creates subname `0x123.assuranet.eth` with text records indicating compliance
4. On next interaction, TEE checks subname existence and metadata
5. If compliant and score still valid, attestation is issued immediately without full re-evaluation

### Core Smart Contracts

#### 1. AssuraVerifier Contract

The main verification contract (`AssuraVerifier.sol`) provides:

**Key Features:**
- **Verification Data Storage**: Each application contract can register verification requirements (score thresholds, expiry times, chain IDs) for specific functions
- **Oasis TEE Signature Validation**: Verifies that compliance attestations are signed by the authorized Oasis TEE address using EIP-712 or EIP-191 signatures
- **Compliance Checking**: Validates that user attestations meet the required criteria
- **Bypass Entry Management**: Automatically creates time-based bypass entries when users have insufficient scores

**Key Functions:**

```solidity
// Set verification requirements for an app contract
function setVerifyingData(
    address appContractAddress,
    bytes32 key,
    AssuraTypes.VerifyingData memory data
) external;

// Verify compliance data (view function, no state changes)
function verify(
    address app,
    bytes32 key,
    bytes calldata attestedComplianceData
) external view returns (bool);

// Verify compliance with automatic bypass entry creation
function verifyWithBypass(
    address app,
    bytes32 key,
    bytes calldata attestedComplianceData
) external returns (bool);
```

**Bypass Mechanism:**
When a user's score is insufficient, `verifyWithBypass` automatically creates a bypass entry:
- Calculates time lock: `expiry = block.timestamp + (scoreDifference * 10 seconds)`
- Stores bypass entry with expiry timestamp
- User can access after expiry time passes
- Each bypass entry has a nonce for replay protection

#### 2. Data Structures

**AttestedData** (signed by Oasis TEE):
```solidity
struct AttestedData {
    uint256 score;              // Confidence score (0-1000)
    uint256 timeAtWhichAttested; // Timestamp when attestation was created
    uint256 chainId;            // Chain ID where attestation is valid
}
```

**VerifyingData** (requirements set by app):
```solidity
struct VerifyingData {
    uint256 score;    // Minimum required score (0 = no requirement)
    uint256 expiry;   // Expiry timestamp (0 = no expiry)
    uint256 chainId;  // Required chain ID (0 = any chain)
}
```

**ComplianceData** (submitted by user):
```solidity
struct ComplianceData {
    address userAddress;                    // The user's address
    bytes32 key;                            // Function selector or verification key
    bytes signedAttestedDataWithTEESignature; // Oasis TEE signature over AttestedData
    AttestedData actualAttestedData;        // The attested data
}
```

**BypassData** (time-based access control):
```solidity
struct BypassData {
    uint256 expiry;  // Timestamp when bypass expires and user can access
    uint256 nonce;   // Nonce for replay protection
    bool allowed;    // Always set to true when created
}
```

#### 3. AssuraVerifierLib Library

The library (`AssuraVerifierLib.sol`) provides helper functions:

**Signature Verification:**
- Supports both EIP-712 and EIP-191 signature formats for backward compatibility
- Uses OpenZeppelin's `SignatureChecker` to support both EOA and smart contract wallets (EIP-1271)

**Compliance Checking:**
- Validates score requirements
- Checks expiry timestamps
- Verifies chain ID compatibility
- Returns boolean result for easy integration

**Helper Function:**
```solidity
function requireCompliance(
    IAssuraVerifier verifier,
    address app,
    bytes32 key,
    bytes calldata attestedComplianceData
) internal;
```

This function is designed to be used in modifiers, automatically calling `verifyWithBypass` and reverting if verification fails.

### Verification Flow

1. **User Requests Attestation from Oasis TEE**:
   - User submits wallet address and desired function/operation
   - Oasis TEE checks for existing ENS subdomain (`{address}.assuranet.eth`) via off-chain resolver
   - If subdomain exists and user meets score criteria, TEE can issue attestation immediately
   - Otherwise, TEE evaluates compliance factors (KYC status, wallet age, interactions, etc.)
   - Oasis TEE generates `AttestedData` with score, timestamp, and chain ID
   - If user meets score requirements, TEE may create/update ENS subdomain for future fast verification
   - Oasis TEE signs the data using EIP-712 or EIP-191 format

2. **User Prepares Compliance Data**:
   - User creates `ComplianceData` struct with:
     - Their address
     - Function selector (key)
     - TEE signature
     - The attested data
   - Encodes it: `bytes complianceData = abi.encode(complianceData)`

3. **User Calls Application Function**:
   - User calls the application function with compliance data
   - Function uses `onlyCompliant` modifier

4. **On-Chain Verification Process**:
   - Modifier calls `AssuraVerifierLib.requireCompliance()`
   - Library calls `assuraVerifier.verifyWithBypass()`
   - AssuraVerifier:
     - Decodes `ComplianceData` from bytes
     - Verifies key matches function selector
     - Validates Oasis TEE signature (supports EIP-712 and EIP-191)
     - Validates signer matches `ASSURA_TEE_ADDRESS` (Oasis TEE address)
     - Checks if bypass entry exists and is valid (expired)
     - If no valid bypass and score insufficient, creates new bypass entry
     - Checks expiry (if set in VerifyingData)
     - Checks chainId (if set in VerifyingData)
     - Validates score meets requirement
   - Returns `true` if all checks pass, otherwise reverts

5. **Function Execution**:
   - If verification passes, function executes
   - If verification fails, transaction reverts

### Integration Example

Here's how to integrate Assura into your smart contract:

```solidity
import {IAssuraVerifier} from "./assura/IAssuraVerifier.sol";
import {AssuraTypes} from "./assura/types/AssuraTypes.sol";
import {AssuraVerifierLib} from "./assura/libraries/AssuraVerifierLib.sol";

contract MyApp {
    IAssuraVerifier public immutable assuraVerifier;
    bytes32 public immutable verificationKey;
    
    constructor(address _assuraVerifier, bytes32 _key) {
        assuraVerifier = IAssuraVerifier(_assuraVerifier);
        verificationKey = _key;
        
        // Set verification requirements
        AssuraTypes.VerifyingData memory verifyingData = AssuraTypes.VerifyingData({
            score: 50,      // Minimum score required
            expiry: 0,      // No expiry
            chainId: 0       // Any chain
        });
        
        assuraVerifier.setVerifyingData(address(this), _key, verifyingData);
    }
    
    modifier onlyCompliant(bytes calldata attestedComplianceData) {
        AssuraVerifierLib.requireCompliance(
            assuraVerifier,
            address(this),
            verificationKey,
            attestedComplianceData
        );
        
        // Verify user address matches
        AssuraTypes.ComplianceData memory complianceData = 
            AssuraVerifierLib.decodeComplianceData(attestedComplianceData);
        require(
            complianceData.userAddress == msg.sender,
            "Compliance data must be for caller"
        );
        _;
    }
    
    function myProtectedFunction(bytes calldata attestedComplianceData) 
        external 
        onlyCompliant(attestedComplianceData) 
    {
        // Your function logic here
        // Compliance is already verified!
    }
}
```

### Security Features

1. **Oasis TEE Signature Verification**: Only attestations signed by the authorized Oasis TEE address are accepted
2. **Key Matching**: Ensures compliance data is for the correct function
3. **Score Validation**: Enforces minimum compliance scores
4. **Expiry Checks**: Supports time-limited attestations
5. **Chain Validation**: Can enforce chain-specific requirements
6. **Access Control**: Only application contracts can set their own verification data
7. **Bypass Protection**: Time-based bypass entries prevent immediate access with insufficient scores
8. **Replay Protection**: Bypass entries use nonces to prevent replay attacks
9. **Signature Format Support**: Supports both EIP-712 (modern) and EIP-191 (legacy) for maximum compatibility

### Technical Implementation Details

**Signature Formats Supported:**

1. **EIP-712 Format** (preferred):
```solidity
bytes32 eip712Hash = keccak256(
    abi.encodePacked(
        "\x19\x01",
        domainSeparator,
        keccak256(
            abi.encode(
                ATTESTED_DATA_TYPEHASH,
                attestedData.score,
                attestedData.timeAtWhichAttested,
                attestedData.chainId
            )
        )
    )
);
```

2. **EIP-191 Format** (backward compatibility):
```solidity
bytes32 eip191Hash = keccak256(
    abi.encodePacked(
        "\x19Ethereum Signed Message:\n32",
        keccak256(abi.encode(attestedData))
    )
);
```

**Bypass Time Calculation:**
```solidity
uint256 scoreDifference = requiredScore - userScore;
uint256 expiry = block.timestamp + (scoreDifference * 10 seconds);
```

For example:
- Required score: 100
- User score: 70
- Score difference: 30
- Lock time: 30 * 10 = 300 seconds (5 minutes)

**Storage Mappings:**
- `verifyingData[appContract][key]` → Stores verification requirements per app/function
- `bypassEntries[user][app][key]` → Stores time-based bypass entries per user/app/function

**ENS Subdomain Implementation:**
- Uses Namespace Offchain Manager for ENS subdomain management
- Parent domain: `assuranet.eth`
- Subdomain format: `{userAddress}.assuranet.eth` (normalized to lowercase hex)
- Text records stored off-chain via Namespace API:
  - `compliance.score` → User's compliance score
  - `compliance.verified` → Timestamp of last verification
  - `compliance.status` → Compliance status flags
- Managed by Oasis TEE service running off-chain
- Enables fast lookup for returning compliant users without full re-evaluation

### Example: AssuraProtectedVault

The codebase includes `AssuraProtectedVault.sol` as a complete example showing:
- ERC-4626 vault integration
- Compliance-protected deposit and mint functions
- Dynamic requirement updates
- Event emission for compliance verification

This demonstrates how to integrate Assura into a production-ready DeFi application.

### Deployment

The system is designed for multi-chain deployment:
- **AssuraVerifier**: Deployed once per chain
- **Application Contracts**: Deploy independently, reference the AssuraVerifier
- **Oasis TEE Address**: Configured during AssuraVerifier deployment, can be updated by owner

### Future Enhancements

Potential improvements include:
- Support for multiple TEE addresses
- Revocation mechanisms for attestations
- Batch verification for multiple functions
- Gas optimization improvements
- Additional compliance criteria types
- Country code filtering (mentioned in docs, not yet implemented in code)

