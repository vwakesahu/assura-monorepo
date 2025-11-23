// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAssuraVerifier} from "../IAssuraVerifier.sol";
import {AssuraTypes} from "../types/AssuraTypes.sol";
import {AssuraVerifierLib} from "../libraries/AssuraVerifierLib.sol";
import {IVaultDepositHook} from "../hooks/IVaultDepositHook.sol";

/**
 * @title AssuraProtectedVaultWithHooks
 * @notice Enhanced ERC-4626 vault with Assura compliance and modular deposit hooks
 * @dev Supports delayed deposits through hook mechanism for users with compliance delays
 */
contract AssuraProtectedVaultWithHooks is ERC4626 {
    using SafeERC20 for IERC20;

    /// @dev The Assura verifier contract
    IAssuraVerifier public immutable assuraVerifier;

    /// @dev The verification key for this vault
    bytes32 public immutable verificationKey;

    /// @dev Optional hook for deposit flow management
    IVaultDepositHook public depositHook;

    /// @dev Emitted when compliance is verified
    event ComplianceVerified(address indexed user, uint256 score);

    /// @dev Emitted when deposit hook is updated
    event DepositHookUpdated(address indexed oldHook, address indexed newHook);

    /// @dev Emitted when deposit is delayed via hook
    event DepositDelayed(address indexed user, uint256 assets, uint256 bypassExpiry);

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
     * @param _depositHook Optional deposit hook address (can be zero)
     */
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        IAssuraVerifier _assuraVerifier,
        bytes32 _verificationKey,
        address _depositHook
    ) ERC4626(asset_) ERC20(name_, symbol_) {
        require(address(_assuraVerifier) != address(0), "Vault: verifier cannot be zero");

        assuraVerifier = _assuraVerifier;
        verificationKey = _verificationKey;
        depositHook = IVaultDepositHook(_depositHook);

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
     * @notice Enhanced modifier that checks compliance and handles hooks
     * @dev Calls hook if bypass is created, allowing delayed deposit handling
     */
    modifier onlyCompliantWithHook(bytes32 key, bytes calldata attestedComplianceData) {
        // Decode compliance data
        AssuraTypes.ComplianceData memory complianceData =
            AssuraVerifierLib.decodeComplianceData(attestedComplianceData);

        require(
            complianceData.userAddress == msg.sender,
            "Vault: Compliance data must be for caller"
        );

        // Store bypass state before verification
        AssuraTypes.BypassData memory bypassBefore =
            assuraVerifier.getBypassEntry(msg.sender, address(this), key);
        uint256 nonceBefore = bypassBefore.nonce;

        // Verify compliance (may create bypass entry)
        bool isValid = assuraVerifier.verifyWithBypass(address(this), key, attestedComplianceData);
        require(isValid, "Vault: Compliance verification failed");

        // Check if a new bypass was created
        AssuraTypes.BypassData memory bypassAfter =
            assuraVerifier.getBypassEntry(msg.sender, address(this), key);

        bool bypassWasCreated = bypassAfter.nonce > nonceBefore;
        uint256 bypassExpiry = bypassWasCreated ? bypassAfter.expiry : 0;

        emit ComplianceVerified(msg.sender, complianceData.actualAttestedData.score);

        // Store for use in function
        _currentBypassExpiry = bypassExpiry;
        _;
        _currentBypassExpiry = 0; // Clean up
    }

    /// @dev Temporary storage for bypass expiry during transaction
    uint256 private _currentBypassExpiry;

    /**
     * @notice Deposit assets with compliance verification and hook support
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive shares
     * @param attestedComplianceData The compliance attestation data
     * @return shares Amount of shares minted (0 if delayed)
     */
    function depositWithCompliance(
        uint256 assets,
        address receiver,
        bytes calldata attestedComplianceData
    ) external onlyCompliantWithHook(verificationKey, attestedComplianceData) returns (uint256 shares) {
        return _depositWithHook(assets, receiver);
    }

    /**
     * @notice Deposit with score 100 selector and hook support
     */
    function depositWithScore100(
        uint256 assets,
        address receiver,
        bytes calldata attestedComplianceData
    ) external onlyCompliantWithHook(getOnlyUserWithScore100Selector(), attestedComplianceData) returns (uint256 shares) {
        return _depositWithHook(assets, receiver);
    }

    /**
     * @notice Mint shares with score 30 selector and hook support
     */
    function mintWithScore30(
        uint256 shares,
        address receiver,
        bytes calldata attestedComplianceData
    ) external onlyCompliantWithHook(getOnlyUserWithScore30Selector(), attestedComplianceData) returns (uint256 assets) {
        return _mintWithHook(shares, receiver);
    }

    /**
     * @notice Mint shares with compliance verification and hook support
     */
    function mintWithCompliance(
        uint256 shares,
        address receiver,
        bytes calldata attestedComplianceData
    ) external onlyCompliantWithHook(verificationKey, attestedComplianceData) returns (uint256 assets) {
        return _mintWithHook(shares, receiver);
    }

    /**
     * @notice Internal deposit function with hook logic
     */
    function _depositWithHook(
        uint256 assets,
        address receiver
    ) internal returns (uint256 shares) {
        // If no hook or no bypass, proceed normally
        if (address(depositHook) == address(0) || _currentBypassExpiry == 0) {
            return deposit(assets, receiver);
        }

        // Call hook beforeDeposit
        (bool shouldProceed, bytes memory hookData) = depositHook.beforeDeposit(
            msg.sender,
            asset(),
            assets,
            receiver,
            _currentBypassExpiry
        );

        if (shouldProceed) {
            // Hook says proceed with immediate deposit
            shares = deposit(assets, receiver);

            // Call hook afterDeposit
            depositHook.afterDeposit(
                msg.sender,
                asset(),
                assets,
                shares,
                receiver,
                hookData
            );

            return shares;
        } else {
            // Hook handled the deposit (delayed)
            emit DepositDelayed(msg.sender, assets, _currentBypassExpiry);

            // Call hook afterDeposit with 0 shares (deposit delayed)
            depositHook.afterDeposit(
                msg.sender,
                asset(),
                assets,
                0,
                receiver,
                hookData
            );

            return 0;
        }
    }

    /**
     * @notice Internal mint function with hook logic
     */
    function _mintWithHook(
        uint256 shares,
        address receiver
    ) internal returns (uint256 assets) {
        // If no hook or no bypass, proceed normally
        if (address(depositHook) == address(0) || _currentBypassExpiry == 0) {
            return mint(shares, receiver);
        }

        // For mint, we need to convert shares to assets first
        assets = previewMint(shares);

        // Call hook beforeDeposit
        (bool shouldProceed, bytes memory hookData) = depositHook.beforeDeposit(
            msg.sender,
            asset(),
            assets,
            receiver,
            _currentBypassExpiry
        );

        if (shouldProceed) {
            // Hook says proceed with immediate mint
            assets = mint(shares, receiver);

            // Call hook afterDeposit
            depositHook.afterDeposit(
                msg.sender,
                asset(),
                assets,
                shares,
                receiver,
                hookData
            );

            return assets;
        } else {
            // Hook handled the deposit (delayed)
            emit DepositDelayed(msg.sender, assets, _currentBypassExpiry);

            // Call hook afterDeposit
            depositHook.afterDeposit(
                msg.sender,
                asset(),
                assets,
                0,
                receiver,
                hookData
            );

            return assets;
        }
    }

    /**
     * @notice Update verification requirements
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

    /**
     * @notice Update deposit hook (owner only in production, public for demo)
     * @param newHook New hook address (can be zero to disable)
     */
    function setDepositHook(address newHook) external {
        address oldHook = address(depositHook);
        depositHook = IVaultDepositHook(newHook);
        emit DepositHookUpdated(oldHook, newHook);
    }

    /**
     * @notice Get current deposit hook
     */
    function getDepositHook() external view returns (address) {
        return address(depositHook);
    }
}
