// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AssuraTypes} from "../types/AssuraTypes.sol";
import {IAssuraVerifier} from "../IAssuraVerifier.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/**
 * @title AssuraVerifierLib
 * @notice Library for verifying Assura compliance attestations
 * @dev Provides signature verification and compliance checking logic
 */
library AssuraVerifierLib {
    /// @dev EIP-712 type hash for AttestedData
    bytes32 public constant ATTESTED_DATA_TYPEHASH =
        keccak256("AttestedData(uint256 score,uint256 timeAtWhichAttested,uint256 chainId)");

    /**
     * @notice Verify the signature on attested data
     * @param teeAddress The address of the TEE that signed the data
     * @param attestedData The attested data to verify
     * @param signature The signature to verify
     * @param domainSeparator The EIP-712 domain separator
     * @return isValid True if the signature is valid
     */
    function verifySignature(
        address teeAddress,
        AssuraTypes.AttestedData memory attestedData,
        bytes memory signature,
        bytes32 domainSeparator
    ) internal view returns (bool) {
        // Compute hash for EIP-712 format
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

        // Compute hash for EIP-191 format (backward compatibility)
        bytes32 eip191Hash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(attestedData))
            )
        );

        // Try EIP-712 first, then fall back to EIP-191
        // SignatureChecker handles both EIP-1271 (smart contract wallets) and ECDSA (EOAs)
        return SignatureChecker.isValidSignatureNow(teeAddress, eip712Hash, signature) ||
            SignatureChecker.isValidSignatureNow(teeAddress, eip191Hash, signature);
    }

    /**
     * @notice Check if the verifying data requirements are met
     * @param verifyingData The requirements to check against
     * @param attestedData The attested data to verify
     * @param currentChainId The current chain ID
     * @param currentTimestamp The current block timestamp
     * @return isValid True if all requirements are met
     */
    function checkRequirements(
        AssuraTypes.VerifyingData memory verifyingData,
        AssuraTypes.AttestedData memory attestedData,
        uint256 currentChainId,
        uint256 currentTimestamp
    ) internal pure returns (bool) {
        // Check expiry (0 means no expiry)
        if (verifyingData.expiry != 0 && verifyingData.expiry < currentTimestamp) {
            return false;
        }

        // Check chainId requirement (0 means any chain)
        if (verifyingData.chainId != 0 && verifyingData.chainId != currentChainId) {
            return false;
        }

        // Check chainId from attestedData (0 means any chain)
        if (verifyingData.chainId != 0 && attestedData.chainId != 0 && 
            attestedData.chainId != currentChainId) {
            return false;
        }

        // Check score requirement
        if (attestedData.score < verifyingData.score) {
            return false;
        }

        return true;
    }

    /**
     * @notice Decode compliance data from bytes
     * @param data The encoded compliance data
     * @return complianceData The decoded compliance data struct
     */
    function decodeComplianceData(
        bytes calldata data
    ) internal pure returns (AssuraTypes.ComplianceData memory) {
        return abi.decode(data, (AssuraTypes.ComplianceData));
    }

    /**
     * @notice Verify compliance and revert if verification fails
     * @dev Use this function in modifiers to check compliance
     * Automatically handles bypass entry creation for insufficient scores
     * @param verifier The AssuraVerifier contract instance
     * @param app The app contract address
     * @param key The verification key identifier
     * @param attestedComplianceData The encoded compliance data to verify
     * @custom:example
     * ```solidity
     * modifier onlyCompliant(bytes32 key, bytes calldata complianceData) {
     *     AssuraVerifierLib.requireCompliance(assuraVerifier, address(this), key, complianceData);
     *     _;
     * }
     * ```
     */
    function requireCompliance(
        IAssuraVerifier verifier,
        address app,
        bytes32 key,
        bytes calldata attestedComplianceData
    ) internal {
        bool isValid = verifier.verifyWithBypass(app, key, attestedComplianceData);
        require(isValid, "AssuraVerifierLib: Compliance verification failed");
    }
}

