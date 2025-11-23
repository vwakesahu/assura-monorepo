// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IVaultDepositHook
 * @notice Minimal SDK-like interface for vault deposit hooks
 * @dev Enables modular handling of deposits, especially for users with compliance delays
 */
interface IVaultDepositHook {
    /**
     * @notice Called before a deposit when user may have compliance delay
     * @param user The address attempting to deposit
     * @param asset The ERC20 token being deposited
     * @param assets Amount of assets to deposit
     * @param receiver Intended receiver of vault shares
     * @param bypassExpiry The timestamp when bypass expires (0 if no delay)
     * @return shouldProceed Whether to continue with immediate deposit
     * @return hookData Optional data to pass to afterDeposit
     */
    function beforeDeposit(
        address user,
        address asset,
        uint256 assets,
        address receiver,
        uint256 bypassExpiry
    ) external returns (bool shouldProceed, bytes memory hookData);

    /**
     * @notice Called after deposit execution or when deposit is delayed
     * @param user The address that deposited
     * @param asset The ERC20 token deposited
     * @param assets Amount of assets deposited
     * @param shares Amount of vault shares minted (0 if delayed)
     * @param receiver Receiver of vault shares
     * @param hookData Data returned from beforeDeposit
     */
    function afterDeposit(
        address user,
        address asset,
        uint256 assets,
        uint256 shares,
        address receiver,
        bytes memory hookData
    ) external;

    /**
     * @notice Check if a delayed deposit can be claimed
     * @param user The user address
     * @param depositId Unique identifier for the deposit
     * @return canClaim Whether the deposit can be claimed
     * @return nexusAccount The nexus account address
     * @return assets Amount of assets held
     */
    function canClaim(
        address user,
        bytes32 depositId
    ) external view returns (bool canClaim, address nexusAccount, uint256 assets);

    /**
     * @notice Claim a delayed deposit after bypass expires
     * @param user The user address
     * @param depositId Unique identifier for the deposit
     * @return shares Amount of vault shares minted
     */
    function claimDelayedDeposit(
        address user,
        bytes32 depositId
    ) external returns (uint256 shares);

    /**
     * @notice Get all deposit IDs for a user
     * @param user The user address
     * @return depositIds Array of deposit IDs
     */
    function getUserDeposits(address user) external view returns (bytes32[] memory depositIds);

    /**
     * @notice Get detailed information about a deposit
     * @param depositId The deposit ID
     * @return user The user who made the deposit
     * @return asset The asset token address
     * @return assets Amount of assets deposited
     * @return receiver Intended receiver of shares
     * @return expiry Timestamp when deposit becomes claimable
     * @return nexusAccount The associated nexus account
     * @return claimed Whether the deposit has been claimed
     * @return canClaimNow Whether the deposit can be claimed now
     */
    function getDepositInfo(bytes32 depositId) external view returns (
        address user,
        address asset,
        uint256 assets,
        address receiver,
        uint256 expiry,
        address nexusAccount,
        bool claimed,
        bool canClaimNow
    );
}
