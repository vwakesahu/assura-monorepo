// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAssuraVerifier} from "./IAssuraVerifier.sol";
import {AssuraTypes} from "./types/AssuraTypes.sol";
import {AssuraVerifierLib} from "./libraries/AssuraVerifierLib.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {NexusAccountDeployer} from "../account/NexusAccountDeployer.sol";

interface INexusAccountDeployer {
    function deployAccountWithSalt(address owner, bytes32 salt) external returns (address payable account);
    function predictAccountAddressWithSalt(address owner, bytes32 salt) external view returns (address predictedAddress);
}

/**
 * @title AssuraVerifier
 * @notice Main contract for verifying Assura compliance attestations
 * @dev Provides a centralized verification system for compliance requirements
 */
contract AssuraVerifier is IAssuraVerifier, EIP712, Ownable {

    /// @dev Mapping from app contract address => key => verifying data
    mapping(address appContractAddress => mapping(bytes32 key => AssuraTypes.VerifyingData))
        public verifyingData;

    /// @dev Mapping from user address => app contract address => function selector => bypass data
    mapping(address userAddress => mapping(address appContractAddress => mapping(bytes32 functionSelector => AssuraTypes.BypassData)))
        public bypassEntries;

    /// @dev Address of the Assura TEE that signs attestations
    address public ASSURA_TEE_ADDRESS;

    /// @dev Address of the NexusAccountDeployer contract
    INexusAccountDeployer public nexusAccountDeployer;

    /// @dev Emitted when TEE address is updated
    event AssuraTeeAddressUpdated(address oldAddress, address newAddress);

    /// @dev Emitted when NexusAccountDeployer address is updated
    event NexusAccountDeployerUpdated(address oldAddress, address newAddress);

    /// @dev Emitted when verifying data is set
    event VerifyingDataSet(
        address indexed appContractAddress,
        bytes32 indexed key,
        AssuraTypes.VerifyingData verifyingData
    );

    /// @dev Emitted when a bypass entry is created
    event BypassEntryCreated(
        address indexed userAddress,
        address indexed appContractAddress,
        bytes32 indexed functionSelector,
        uint256 expiry,
        uint256 nonce
    );

    /// @dev Emitted when a Nexus account is deployed during bypass
    event NexusAccountDeployedOnBypass(
        address indexed userAddress,
        address indexed nexusAccount,
        bytes32 salt,
        uint256 expiry
    );

    /**
     * @notice Constructor
     * @param _owner The owner of the contract
     * @param _ASSURA_TEE_ADDRESS The address of the Assura TEE
     * @dev Automatically deploys a NexusAccountDeployer for automatic account creation during bypass
     */
    constructor(
        address _owner,
        address _ASSURA_TEE_ADDRESS
    )
        EIP712("AssuraVerifier", "1")
        Ownable(_owner)
    {
        require(_ASSURA_TEE_ADDRESS != address(0), "AssuraVerifier: TEE address cannot be 0");
        ASSURA_TEE_ADDRESS = _ASSURA_TEE_ADDRESS;

        // Deploy NexusAccountDeployer for automatic account creation
        nexusAccountDeployer = INexusAccountDeployer(address(new NexusAccountDeployer()));
    }

    /**
     * @notice Set verification requirements for an app contract
     * @dev Only the app contract itself can set its verification data
     * @param appContractAddress The app contract address
     * @param key The verification key identifier
     * @param data The verification requirements
     */
    function setVerifyingData(
        address appContractAddress,
        bytes32 key,
        AssuraTypes.VerifyingData memory data
    ) external override {
        require(
            msg.sender == appContractAddress,
            "AssuraVerifier: Only app contract can set its verifying data"
        );
        verifyingData[appContractAddress][key] = data;
        emit VerifyingDataSet(appContractAddress, key, data);
    }

    /**
     * @notice Get verification requirements for an app contract
     * @param appContractAddress The app contract address
     * @param key The verification key identifier
     * @return The verification requirements
     */
    function getVerifyingData(
        address appContractAddress,
        bytes32 key
    ) external view override returns (AssuraTypes.VerifyingData memory) {
        return verifyingData[appContractAddress][key];
    }

    /**
     * @notice Get bypass entry for a user/app/key combination
     * @param user The user address
     * @param app The app contract address
     * @param key The verification key identifier
     * @return bypassData The bypass entry data
     */
    function getBypassEntry(
        address user,
        address app,
        bytes32 key
    ) external view override returns (AssuraTypes.BypassData memory) {
        return bypassEntries[user][app][key];
    }

    /**
     * @notice Internal function to check compliance with bypass logic
     * @param app The app contract address
     * @param key The verification key identifier
     * @param complianceData The decoded compliance data
     * @param createBypassIfNeeded Whether to create bypass entry if score is insufficient
     * @return isValid True if the compliance data meets all requirements or bypass is valid
     */
    function _checkCompliance(
        address app,
        bytes32 key,
        AssuraTypes.ComplianceData memory complianceData,
        bool createBypassIfNeeded
    ) internal returns (bool) {
        AssuraTypes.VerifyingData memory vData = verifyingData[app][key];
        
        // Always check bypass entry first
        AssuraTypes.BypassData memory bypass = bypassEntries[complianceData.userAddress][app][key];
        if (bypass.allowed && bypass.expiry > 0 && block.timestamp >= bypass.expiry) {
            // Bypass entry exists and expiry has passed, allow access
            return true;
        }
        
        // Check requirements normally
        bool meetsRequirements = AssuraVerifierLib.checkRequirements(
            vData,
            complianceData.actualAttestedData,
            block.chainid,
            block.timestamp
        );
        
        // If requirements are met, return true
        if (meetsRequirements) {
            return true;
        }
        
        // If score is insufficient and we should create bypass entry
        if (createBypassIfNeeded && complianceData.actualAttestedData.score < vData.score) {
            // Calculate score difference (0-100 scale)
            uint256 scoreDifference = vData.score - complianceData.actualAttestedData.score;

            // Calculate expiry: current time + (difference * 10 seconds)
            uint256 expiry = block.timestamp + (scoreDifference * 10 seconds);

            // Get current bypass entry to increment nonce
            uint256 newNonce = bypass.nonce + 1;

            // Create or update bypass entry
            bypassEntries[complianceData.userAddress][app][key] = AssuraTypes.BypassData({
                expiry: expiry,
                nonce: newNonce,
                allowed: true
            });

            emit BypassEntryCreated(
                complianceData.userAddress,
                app,
                key,
                expiry,
                newNonce
            );

            // Deploy Nexus account if NexusAccountDeployer is configured
            if (address(nexusAccountDeployer) != address(0)) {
                // Generate random salt using user address, timestamp, nonce, and app address
                bytes32 randomSalt = keccak256(
                    abi.encodePacked(
                        complianceData.userAddress,
                        block.timestamp,
                        newNonce,
                        app,
                        key
                    )
                );

                // Try to deploy the account (will revert if already deployed)
                try nexusAccountDeployer.deployAccountWithSalt(
                    complianceData.userAddress,
                    randomSalt
                ) returns (address payable nexusAccount) {
                    emit NexusAccountDeployedOnBypass(
                        complianceData.userAddress,
                        nexusAccount,
                        randomSalt,
                        expiry
                    );
                } catch {
                    // If deployment fails (e.g., account already exists), silently continue
                    // The bypass entry is still created successfully
                }
            }
        }
        
        return false;
    }

    /**
     * @notice Verify compliance data against requirements
     * @param app The app contract address
     * @param key The verification key identifier
     * @param attestedComplianceData The encoded compliance data to verify
     * @return isValid True if the compliance data meets all requirements
     */
    function verify(
        address app,
        bytes32 key,
        bytes calldata attestedComplianceData
    ) external view override returns (bool) {
        // Decode compliance data
        AssuraTypes.ComplianceData memory complianceData = 
            AssuraVerifierLib.decodeComplianceData(attestedComplianceData);
        
        // Verify the key matches
        require(complianceData.key == key, "AssuraVerifier: Key mismatch");
        
        // Verify signature
        bool isValidSignature = AssuraVerifierLib.verifySignature(
            ASSURA_TEE_ADDRESS,
            complianceData.actualAttestedData,
            complianceData.signedAttestedDataWithTEESignature,
            _domainSeparatorV4()
        );
        
        require(isValidSignature, "AssuraVerifier: Signature not from TEE");
        
        // Check bypass entry
        AssuraTypes.BypassData memory bypass = bypassEntries[complianceData.userAddress][app][key];
        if (bypass.allowed && bypass.expiry > 0 && block.timestamp >= bypass.expiry) {
            return true;
        }
        
        // Check requirements normally
        AssuraTypes.VerifyingData memory vData = verifyingData[app][key];
        return AssuraVerifierLib.checkRequirements(
            vData,
            complianceData.actualAttestedData,
            block.chainid,
            block.timestamp
        );
    }

    /**
     * @notice Verify compliance with automatic bypass entry creation
     * @param app The app contract address
     * @param key The verification key identifier
     * @param attestedComplianceData The encoded compliance data to verify
     * @return isValid True if the compliance data meets all requirements or bypass is valid
     */
    function verifyWithBypass(
        address app,
        bytes32 key,
        bytes calldata attestedComplianceData
    ) external override returns (bool) {
        // Decode compliance data
        AssuraTypes.ComplianceData memory complianceData = 
            AssuraVerifierLib.decodeComplianceData(attestedComplianceData);
        
        // Verify the key matches
        require(complianceData.key == key, "AssuraVerifier: Key mismatch");
        
        // Verify signature
        bool isValidSignature = AssuraVerifierLib.verifySignature(
            ASSURA_TEE_ADDRESS,
            complianceData.actualAttestedData,
            complianceData.signedAttestedDataWithTEESignature,
            _domainSeparatorV4()
        );
        
        require(isValidSignature, "AssuraVerifier: Signature not from TEE");
        
        // Check compliance with bypass creation enabled
        return _checkCompliance(app, key, complianceData, true);
    }

    /**
     * @notice Update the Assura TEE address
     * @dev Only the owner can update the TEE address
     * @param _ASSURA_TEE_ADDRESS The new TEE address
     */
    function updateAssuraTeeAddress(address _ASSURA_TEE_ADDRESS) external onlyOwner {
        require(_ASSURA_TEE_ADDRESS != address(0), "AssuraVerifier: TEE address cannot be 0");
        address oldAddress = ASSURA_TEE_ADDRESS;
        ASSURA_TEE_ADDRESS = _ASSURA_TEE_ADDRESS;
        emit AssuraTeeAddressUpdated(oldAddress, _ASSURA_TEE_ADDRESS);
    }

    /**
     * @notice Get the NexusAccountDeployer address
     * @return The address of the NexusAccountDeployer contract
     */
    function getNexusAccountDeployer() external view returns (address) {
        return address(nexusAccountDeployer);
    }

    /**
     * @notice Update the NexusAccountDeployer address
     * @dev Only the owner can update the deployer address
     * @param _nexusAccountDeployer The new NexusAccountDeployer address (can be address(0) to disable)
     */
    function updateNexusAccountDeployer(address _nexusAccountDeployer) external onlyOwner {
        address oldAddress = address(nexusAccountDeployer);
        nexusAccountDeployer = INexusAccountDeployer(_nexusAccountDeployer);
        emit NexusAccountDeployerUpdated(oldAddress, _nexusAccountDeployer);
    }
}
