// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title AssuraTypes
 * @notice Type definitions for Assura compliance verification system
 */
library AssuraTypes {
    /**
     * @notice Data structure for attested compliance information from TEE
     * @param score The confidence score (0-1000)
     * @param timeAtWhichAttested Timestamp when the attestation was created
     * @param chainId The chain ID where the attestation is valid
     */
    struct AttestedData {
        uint256 score;
        uint256 timeAtWhichAttested;
        uint256 chainId;
    }

    /**
     * @notice Configuration data for verifying compliance requirements
     * @param score Minimum required confidence score
     * @param expiry Expiry timestamp (0 means no expiry)
     * @param chainId Required chain ID (0 means any chain)
     */
    struct VerifyingData {
        uint256 score;
        uint256 expiry;
        uint256 chainId;
    }

    /**
     * @notice Complete compliance data structure for verification
     * @param userAddress The address being verified
     * @param key The verification key identifier
     * @param signedAttestedDataWithTEESignature The signed attestation data from TEE
     * @param actualAttestedData The decoded attested data
     */
    struct ComplianceData {
        address userAddress;
        bytes32 key;
        bytes signedAttestedDataWithTEESignature;
        AttestedData actualAttestedData;
    }

    /**
     * @notice Bypass data structure for time-based access control
     * @param expiry Timestamp when the bypass expires and user can access
     * @param nonce Nonce for replay protection
     * @param allowed Always set to true when creation
     */
    struct BypassData {
        uint256 expiry;
        uint256 nonce;
        bool allowed;
    }
}

