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
<img width="990" height="518" alt="telegram-cloud-document-5-6131949770849131872" src="https://github.com/user-attachments/assets/85f8fd8a-7398-4621-9d5d-d682db9016d1" />


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

## Making Your Application Compliant: Step-by-Step Guide

This section provides a comprehensive guide for integrating Assura compliance into your smart contracts. Follow these steps to make your application compliant in under an hour.

### Prerequisites

Before you begin, ensure you have:
- A smart contract project (Hardhat, Foundry, or similar)
- Access to the AssuraVerifier contract address on your target chain
- Understanding of your contract's function selectors

### Step 1: Install Assura Contracts

You can use Assura contracts in two ways:

**Option A: Install via npm (Recommended)**
```bash
npm install assura-sdk
# or
pnpm add assura-sdk
# or
yarn add assura-sdk
```

Then import in your contracts:
```solidity
import "assura-sdk/contracts/assura/IAssuraVerifier.sol";
import "assura-sdk/contracts/assura/types/AssuraTypes.sol";
import "assura-sdk/contracts/assura/libraries/AssuraVerifierLib.sol";
```

**Option B: Copy contracts directly**
Copy the contracts from `assura-sdk/contracts/assura/` into your project's contracts directory.

### Step 2: Add Required Imports

Add these imports at the top of your contract file:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAssuraVerifier} from "assura-sdk/contracts/assura/IAssuraVerifier.sol";
import {AssuraTypes} from "assura-sdk/contracts/assura/types/AssuraTypes.sol";
import {AssuraVerifierLib} from "assura-sdk/contracts/assura/libraries/AssuraVerifierLib.sol";
```

### Step 3: Store Verifier Reference

Add immutable state variables to store the verifier and verification key:

```solidity
contract YourContract {
    IAssuraVerifier public immutable assuraVerifier;
    bytes32 public immutable verificationKey;
    
    // Your other state variables...
}
```

### Step 4: Initialize in Constructor

Set up the verifier and configure your compliance requirements in the constructor:

```solidity
constructor(
    address _assuraVerifier,  // AssuraVerifier contract address
    bytes32 _verificationKey  // Function selector or custom key
) {
    require(_assuraVerifier != address(0), "Invalid verifier address");
    
    assuraVerifier = IAssuraVerifier(_assuraVerifier);
    verificationKey = _verificationKey;
    
    // Configure compliance requirements
    AssuraTypes.VerifyingData memory verifyingData = AssuraTypes.VerifyingData({
        score: 50,      // Minimum score required (0-1000)
        expiry: 0,      // Expiry timestamp (0 = no expiry)
        chainId: 0       // Required chain ID (0 = any chain)
    });
    
    // Register requirements with AssuraVerifier
    assuraVerifier.setVerifyingData(
        address(this),
        _verificationKey,
        verifyingData
    );
}
```

**Understanding VerifyingData:**
- `score`: Minimum compliance score required (0-1000). Set to 0 to disable score requirement.
- `expiry`: Timestamp when attestation expires (Unix timestamp). Set to 0 for no expiry.
- `chainId`: Required chain ID for attestation validity. Set to 0 to accept any chain.

### Step 5: Create Compliance Modifier

Create a modifier that enforces compliance:

```solidity
modifier onlyCompliant(bytes calldata attestedComplianceData) {
    // Verify compliance using AssuraVerifierLib
    AssuraVerifierLib.requireCompliance(
        assuraVerifier,
        address(this),
        verificationKey,
        attestedComplianceData
    );
    
    // Decode compliance data to verify user address matches
    AssuraTypes.ComplianceData memory complianceData = 
        AssuraVerifierLib.decodeComplianceData(attestedComplianceData);
    
    require(
        complianceData.userAddress == msg.sender,
        "Compliance data must be for caller"
    );
    
    _;
}
```

### Step 6: Protect Your Functions

Add the `onlyCompliant` modifier to any function that requires compliance:

```solidity
function deposit(uint256 amount, bytes calldata attestedComplianceData) 
    external 
    onlyCompliant(attestedComplianceData) 
{
    // Your deposit logic here
    // Compliance is automatically verified!
}
```

### Complete Example: Simple Token Transfer Contract

Here's a complete example of a token contract with compliance protection:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IAssuraVerifier} from "assura-sdk/contracts/assura/IAssuraVerifier.sol";
import {AssuraTypes} from "assura-sdk/contracts/assura/types/AssuraTypes.sol";
import {AssuraVerifierLib} from "assura-sdk/contracts/assura/libraries/AssuraVerifierLib.sol";

contract CompliantToken is ERC20 {
    IAssuraVerifier public immutable assuraVerifier;
    bytes32 public immutable verificationKey;
    
    constructor(
        address _assuraVerifier,
        bytes32 _verificationKey
    ) ERC20("Compliant Token", "CT") {
        require(_assuraVerifier != address(0), "Invalid verifier");
        
        assuraVerifier = IAssuraVerifier(_assuraVerifier);
        verificationKey = _verificationKey;
        
        // Set compliance requirements: minimum score 100, no expiry, any chain
        AssuraTypes.VerifyingData memory verifyingData = AssuraTypes.VerifyingData({
            score: 100,
            expiry: 0,
            chainId: 0
        });
        
        assuraVerifier.setVerifyingData(
            address(this),
            _verificationKey,
            verifyingData
        );
    }
    
    modifier onlyCompliant(bytes calldata attestedComplianceData) {
        AssuraVerifierLib.requireCompliance(
            assuraVerifier,
            address(this),
            verificationKey,
            attestedComplianceData
        );
        
        AssuraTypes.ComplianceData memory complianceData = 
            AssuraVerifierLib.decodeComplianceData(attestedComplianceData);
        
        require(
            complianceData.userAddress == msg.sender,
            "Compliance data must be for caller"
        );
        _;
    }
    
    function transferWithCompliance(
        address to,
        uint256 amount,
        bytes calldata attestedComplianceData
    ) external onlyCompliant(attestedComplianceData) {
        _transfer(msg.sender, to, amount);
    }
    
    function mintWithCompliance(
        address to,
        uint256 amount,
        bytes calldata attestedComplianceData
    ) external onlyCompliant(attestedComplianceData) {
        _mint(to, amount);
    }
}
```

### Advanced: Per-Function Requirements

You can set different compliance requirements for different functions by using different verification keys:

```solidity
contract AdvancedContract {
    IAssuraVerifier public immutable assuraVerifier;
    
    // Different keys for different functions
    bytes32 public constant DEPOSIT_KEY = bytes32(uint256(keccak256("deposit")));
    bytes32 public constant WITHDRAW_KEY = bytes32(uint256(keccak256("withdraw")));
    
    constructor(address _assuraVerifier) {
        assuraVerifier = IAssuraVerifier(_assuraVerifier);
        
        // Deposit requires score 50
        assuraVerifier.setVerifyingData(
            address(this),
            DEPOSIT_KEY,
            AssuraTypes.VerifyingData({score: 50, expiry: 0, chainId: 0})
        );
        
        // Withdraw requires score 100 (more strict)
        assuraVerifier.setVerifyingData(
            address(this),
            WITHDRAW_KEY,
            AssuraTypes.VerifyingData({score: 100, expiry: 0, chainId: 0})
        );
    }
    
    modifier onlyCompliantWithKey(bytes32 key, bytes calldata attestedComplianceData) {
        AssuraVerifierLib.requireCompliance(
            assuraVerifier,
            address(this),
            key,
            attestedComplianceData
        );
        
        AssuraTypes.ComplianceData memory complianceData = 
            AssuraVerifierLib.decodeComplianceData(attestedComplianceData);
        
        require(
            complianceData.userAddress == msg.sender,
            "Compliance data must be for caller"
        );
        _;
    }
    
    function deposit(bytes calldata attestedComplianceData) 
        external 
        onlyCompliantWithKey(DEPOSIT_KEY, attestedComplianceData) 
    {
        // Deposit logic
    }
    
    function withdraw(bytes calldata attestedComplianceData) 
        external 
        onlyCompliantWithKey(WITHDRAW_KEY, attestedComplianceData) 
    {
        // Withdraw logic
    }
}
```

### Using Function Selectors as Keys

You can use function selectors directly as verification keys:

```solidity
contract SelectorBasedContract {
    IAssuraVerifier public immutable assuraVerifier;
    
    constructor(address _assuraVerifier) {
        assuraVerifier = IAssuraVerifier(_assuraVerifier);
        
        // Use function selector as key
        bytes32 depositSelector = bytes32(bytes4(keccak256("deposit(uint256)")));
        
        assuraVerifier.setVerifyingData(
            address(this),
            depositSelector,
            AssuraTypes.VerifyingData({score: 75, expiry: 0, chainId: 0})
        );
    }
    
    function deposit(uint256 amount, bytes calldata attestedComplianceData) 
        external 
        onlyCompliant(bytes4(this.deposit.selector), attestedComplianceData) 
    {
        // Deposit logic
    }
}
```

### Updating Requirements After Deployment

You can update compliance requirements after deployment (useful for adjusting policies):

```solidity
function updateComplianceRequirements(
    uint256 newScore,
    uint256 newExpiry,
    uint256 newChainId
) external onlyOwner {
    AssuraTypes.VerifyingData memory verifyingData = AssuraTypes.VerifyingData({
        score: newScore,
        expiry: newExpiry,
        chainId: newChainId
    });
    
    assuraVerifier.setVerifyingData(
        address(this),
        verificationKey,
        verifyingData
    );
}
```

### Best Practices

1. **Always verify user address**: Always check that `complianceData.userAddress == msg.sender` to prevent users from using other users' attestations.

2. **Use appropriate score thresholds**: 
   - Score 0-100: Basic wallet checks
   - Score 100-500: Self-based KYC completed
   - Score 500-1000: Full KYC with video/passport verification

3. **Set expiry for time-sensitive operations**: For operations requiring recent verification, set an expiry timestamp.

4. **Use function selectors for clarity**: Using function selectors as keys makes it clear which function the compliance data is for.

5. **Handle time-based bypass**: Users with insufficient scores can still access after a time delay. Design your contract to handle this gracefully.

6. **Emit events**: Emit events when compliance is verified for transparency and debugging:

```solidity
event ComplianceVerified(address indexed user, uint256 score);

modifier onlyCompliant(bytes calldata attestedComplianceData) {
    // ... verification code ...
    
    emit ComplianceVerified(msg.sender, complianceData.actualAttestedData.score);
    _;
}
```

### Common Patterns

**Pattern 1: Single Requirement for All Functions**
```solidity
bytes32 public constant DEFAULT_KEY = bytes32(uint256(keccak256("default")));
```

**Pattern 2: Per-Function Requirements**
```solidity
mapping(bytes32 => bool) public functionRequirements;
```

**Pattern 3: Dynamic Requirements**
```solidity
function setRequirementForFunction(bytes32 functionSelector, uint256 score) external {
    // Update requirements dynamically
}
```

### Troubleshooting

**Issue: "Compliance data must be for caller" error**
- Ensure the user is passing their own attestation data
- Verify the `userAddress` in the compliance data matches `msg.sender`

**Issue: "Insufficient score" error**
- Check the user's score meets your requirement
- Consider using time-based bypass for users with lower scores

**Issue: "Signature verification failed"**
- Ensure the attestation is from the correct TEE service
- Verify the signature format (EIP-712 or EIP-191)

**Issue: "Attestation expired"**
- Check if expiry is set in VerifyingData
- User needs to get a fresh attestation from the TEE service

### Testing Your Integration

1. **Deploy AssuraVerifier** (or use existing deployment)
2. **Deploy your contract** with AssuraVerifier address
3. **Get attestation** from TEE service for a test user
4. **Call protected function** with attestation data
5. **Verify** function executes successfully

### Next Steps

- Check out the [AssuraProtectedVault example](#example-assuraprotectedvault) for a production-ready implementation
- Review the [SDK documentation](https://www.npmjs.com/package/assura-sdk) for client-side integration
- Join the [Assura community](https://github.com/assura-network/assura-monorepo) for support

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

