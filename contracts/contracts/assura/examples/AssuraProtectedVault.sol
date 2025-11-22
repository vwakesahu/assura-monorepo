// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssuraVerifier} from "../IAssuraVerifier.sol";
import {AssuraTypes} from "../types/AssuraTypes.sol";

/**
 * @title AssuraProtectedVault
 * @notice Example ERC-4626 vault with Assura compliance protection
 * @dev Demonstrates how to integrate AssuraVerifier into your contracts
 */
contract AssuraProtectedVault is ERC4626 {
    /// @dev The Assura verifier contract
    IAssuraVerifier public immutable assuraVerifier;
    
    /// @dev The verification key for this vault
    bytes32 public immutable verificationKey;
    
    /// @dev Minimum required confidence score
    uint256 public immutable minScore;
    
    /// @dev Emitted when compliance is verified
    event ComplianceVerified(address indexed user, uint256 score);

    /**
     * @notice Constructor
     * @param asset_ The underlying ERC20 token
     * @param name_ The vault token name
     * @param symbol_ The vault token symbol
     * @param _assuraVerifier The Assura verifier contract address
     * @param _verificationKey The verification key for this vault
     * @param _minScore Minimum required confidence score
     */
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        IAssuraVerifier _assuraVerifier,
        bytes32 _verificationKey,
        uint256 _minScore
    ) ERC4626(asset_) ERC20(name_, symbol_) {
        require(address(_assuraVerifier) != address(0), "Vault: verifier cannot be zero");
        require(_minScore > 0, "Vault: min score must be > 0");
        
        assuraVerifier = _assuraVerifier;
        verificationKey = _verificationKey;
        minScore = _minScore;
        
        // Set initial verification requirements
        AssuraTypes.VerifyingData memory verifyingData = AssuraTypes.VerifyingData({
            score: _minScore,
            expiry: 0, // No expiry
            chainId: 0 // Any chain
        });
        
        assuraVerifier.setVerifyingData(address(this), _verificationKey, verifyingData);
    }

    /**
     * @notice Deposit assets with compliance verification
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive shares
     * @param attestedComplianceData The compliance attestation data
     * @return shares Amount of shares minted
     */
    function depositWithCompliance(
        uint256 assets,
        address receiver,
        bytes calldata attestedComplianceData
    ) external returns (uint256 shares) {
        // Verify compliance
        require(
            assuraVerifier.verify(address(this), verificationKey, attestedComplianceData),
            "Vault: Compliance verification failed"
        );
        
        // Decode to get user address and score
        AssuraTypes.ComplianceData memory complianceData = 
            abi.decode(attestedComplianceData, (AssuraTypes.ComplianceData));
        
        require(
            complianceData.userAddress == msg.sender,
            "Vault: Compliance data must be for caller"
        );
        
        emit ComplianceVerified(msg.sender, complianceData.actualAttestedData.score);
        
        // Proceed with deposit
        return deposit(assets, receiver);
    }

    /**
     * @notice Mint shares with compliance verification
     * @param shares Amount of shares to mint
     * @param receiver Address to receive shares
     * @param attestedComplianceData The compliance attestation data
     * @return assets Amount of assets deposited
     */
    function mintWithCompliance(
        uint256 shares,
        address receiver,
        bytes calldata attestedComplianceData
    ) external returns (uint256 assets) {
        // Verify compliance
        require(
            assuraVerifier.verify(address(this), verificationKey, attestedComplianceData),
            "Vault: Compliance verification failed"
        );
        
        // Decode to get user address
        AssuraTypes.ComplianceData memory complianceData = 
            abi.decode(attestedComplianceData, (AssuraTypes.ComplianceData));
        
        require(
            complianceData.userAddress == msg.sender,
            "Vault: Compliance data must be for caller"
        );
        
        emit ComplianceVerified(msg.sender, complianceData.actualAttestedData.score);
        
        // Proceed with mint
        return mint(shares, receiver);
    }

    /**
     * @notice Update verification requirements
     * @param newScore New minimum score requirement
     * @param expiry New expiry timestamp (0 for no expiry)
     * @param chainId Required chain ID (0 for any chain)
     */
    function updateVerificationRequirements(
        uint256 newScore,
        uint256 expiry,
        uint256 chainId
    ) external {
        require(newScore >= minScore, "Vault: Cannot lower below initial min score");
        
        AssuraTypes.VerifyingData memory verifyingData = AssuraTypes.VerifyingData({
            score: newScore,
            expiry: expiry,
            chainId: chainId
        });
        
        assuraVerifier.setVerifyingData(address(this), verificationKey, verifyingData);
    }
}

