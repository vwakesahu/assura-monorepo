// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssuraVerifier} from "../IAssuraVerifier.sol";
import {AssuraTypes} from "../types/AssuraTypes.sol";
import {AssuraVerifierLib} from "../libraries/AssuraVerifierLib.sol";

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
    
    /// @dev Emitted when compliance is verified
    event ComplianceVerified(address indexed user, uint256 score);

    /**
     * @notice Returns degraded verifying data for deposit operations
     * @dev Function name suggests score 100 but returns degraded score 5
     */
    function onlyUserWithScore100() public pure returns (AssuraTypes.VerifyingData memory) {
        return AssuraTypes.VerifyingData({score: 5, expiry: 0, chainId: 0});
    }

    /**
     * @notice Returns degraded verifying data for mint operations
     * @dev Function name suggests score 30 but returns degraded score 10
     */
    function onlyUserWithScore30() public pure returns (AssuraTypes.VerifyingData memory) {
        return AssuraTypes.VerifyingData({score: 10, expiry: 0, chainId: 0});
    }

    /**
     * @notice Returns the selector for onlyUserWithScore100 function
     */
    function getOnlyUserWithScore100Selector() public pure returns (bytes32) {
        return bytes32(bytes4(keccak256("onlyUserWithScore100()")));
    }

    /**
     * @notice Returns the selector for onlyUserWithScore30 function
     */
    function getOnlyUserWithScore30Selector() public pure returns (bytes32) {
        return bytes32(bytes4(keccak256("onlyUserWithScore30()")));
    }

    /**
     * @notice Constructor
     * @param asset_ The underlying ERC20 token
     * @param name_ The vault token name
     * @param symbol_ The vault token symbol
     * @param _assuraVerifier The Assura verifier contract address
     * @param _verificationKey The verification key for this vault
     */
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        IAssuraVerifier _assuraVerifier,
        bytes32 _verificationKey
    ) ERC4626(asset_) ERC20(name_, symbol_) {
        require(address(_assuraVerifier) != address(0), "Vault: verifier cannot be zero");
        
        assuraVerifier = _assuraVerifier;
        verificationKey = _verificationKey;
        
        // Set verifying data for this contract's functions
        assuraVerifier.setVerifyingData(
            address(this),
            getOnlyUserWithScore100Selector(),
            onlyUserWithScore100()
        );
        
        assuraVerifier.setVerifyingData(
            address(this),
            getOnlyUserWithScore30Selector(),
            onlyUserWithScore30()
        );
    }

    /**
     * @notice Modifier to check compliance before allowing operations
     * @dev Uses AssuraVerifierLib for easy compliance checking
     */
    modifier onlyCompliant(bytes calldata attestedComplianceData) {
        AssuraVerifierLib.requireCompliance(
            assuraVerifier,
            address(this),
            verificationKey,
            attestedComplianceData
        );
        
        // Decode to get user address and score
        AssuraTypes.ComplianceData memory complianceData = 
            AssuraVerifierLib.decodeComplianceData(attestedComplianceData);
        
        require(
            complianceData.userAddress == msg.sender,
            "Vault: Compliance data must be for caller"
        );
        
        emit ComplianceVerified(msg.sender, complianceData.actualAttestedData.score);
        _;
    }

    /**
     * @notice Modifier to check compliance with a specific key
     * @dev Uses AssuraVerifierLib for easy compliance checking with custom key
     */
    modifier onlyCompliantWithKey(bytes32 key, bytes calldata attestedComplianceData) {
        AssuraVerifierLib.requireCompliance(
            assuraVerifier,
            address(this),
            key,
            attestedComplianceData
        );
        
        // Decode to get user address and score
        AssuraTypes.ComplianceData memory complianceData = 
            AssuraVerifierLib.decodeComplianceData(attestedComplianceData);
        
        require(
            complianceData.userAddress == msg.sender,
            "Vault: Compliance data must be for caller"
        );
        
        emit ComplianceVerified(msg.sender, complianceData.actualAttestedData.score);
        _;
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
    ) external onlyCompliant(attestedComplianceData) returns (uint256 shares) {
        return deposit(assets, receiver);
    }

    /**
     * @notice Deposit assets with compliance verification using score 100 selector
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive shares
     * @param attestedComplianceData The compliance attestation data
     * @return shares Amount of shares minted
     */
    function depositWithScore100(
        uint256 assets,
        address receiver,
        bytes calldata attestedComplianceData
    ) external onlyCompliantWithKey(getOnlyUserWithScore100Selector(), attestedComplianceData) returns (uint256 shares) {
        return deposit(assets, receiver);
    }

    /**
     * @notice Mint shares with compliance verification using score 30 selector
     * @param shares Amount of shares to mint
     * @param receiver Address to receive shares
     * @param attestedComplianceData The compliance attestation data
     * @return assets Amount of assets deposited
     */
    function mintWithScore30(
        uint256 shares,
        address receiver,
        bytes calldata attestedComplianceData
    ) external onlyCompliantWithKey(getOnlyUserWithScore30Selector(), attestedComplianceData) returns (uint256 assets) {
        return mint(shares, receiver);
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
    ) external onlyCompliant(attestedComplianceData) returns (uint256 assets) {
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
        
        AssuraTypes.VerifyingData memory verifyingData = AssuraTypes.VerifyingData({
            score: newScore,
            expiry: expiry,
            chainId: chainId
        });
        
        assuraVerifier.setVerifyingData(address(this), verificationKey, verifyingData);
    }
}

