// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../hooks/IVaultDepositHook.sol";

/**
 * @title DelayedDepositManager
 * @notice User-friendly SDK-like interface for managing delayed deposits
 * @dev Provides simplified methods for checking and claiming delayed deposits
 */
contract DelayedDepositManager {
    struct PendingDeposit {
        bytes32 depositId;
        address nexusAccount;
        uint256 assets;
        uint256 expiry;
        bool canClaim;
        uint256 timeRemaining;
    }

    /**
     * @notice Get all pending deposits for a user
     * @param hook The deposit hook address
     * @param user The user address
     * @return deposits Array of pending deposit info
     */
    function getPendingDeposits(
        address hook,
        address user
    ) external view returns (PendingDeposit[] memory deposits) {
        IVaultDepositHook depositHook = IVaultDepositHook(hook);

        // Get all deposit IDs for user
        bytes32[] memory depositIds = depositHook.getUserDeposits(user);

        // Count unclaimed deposits
        uint256 pendingCount = 0;
        for (uint256 i = 0; i < depositIds.length; i++) {
            (
                ,
                ,
                ,
                ,
                ,
                ,
                bool claimed,
            ) = depositHook.getDepositInfo(depositIds[i]);

            if (!claimed) {
                pendingCount++;
            }
        }

        // Build pending deposits array
        deposits = new PendingDeposit[](pendingCount);
        uint256 index = 0;

        for (uint256 i = 0; i < depositIds.length; i++) {
            (
                ,
                ,
                uint256 assets,
                ,
                uint256 expiry,
                address nexusAccount,
                bool claimed,
                bool canClaimNow
            ) = depositHook.getDepositInfo(depositIds[i]);

            if (!claimed) {
                uint256 timeRemaining = block.timestamp >= expiry
                    ? 0
                    : expiry - block.timestamp;

                deposits[index] = PendingDeposit({
                    depositId: depositIds[i],
                    nexusAccount: nexusAccount,
                    assets: assets,
                    expiry: expiry,
                    canClaim: canClaimNow,
                    timeRemaining: timeRemaining
                });

                index++;
            }
        }

        return deposits;
    }

    /**
     * @notice Get claimable deposits for a user (expiry has passed)
     * @param hook The deposit hook address
     * @param user The user address
     * @return claimableIds Array of deposit IDs that can be claimed
     */
    function getClaimableDeposits(
        address hook,
        address user
    ) external view returns (bytes32[] memory claimableIds) {
        IVaultDepositHook depositHook = IVaultDepositHook(hook);
        bytes32[] memory depositIds = depositHook.getUserDeposits(user);

        // Count claimable
        uint256 claimableCount = 0;
        for (uint256 i = 0; i < depositIds.length; i++) {
            (bool canClaim, , ) = depositHook.canClaim(user, depositIds[i]);
            if (canClaim) {
                claimableCount++;
            }
        }

        // Build claimable array
        claimableIds = new bytes32[](claimableCount);
        uint256 index = 0;

        for (uint256 i = 0; i < depositIds.length; i++) {
            (bool canClaim, , ) = depositHook.canClaim(user, depositIds[i]);
            if (canClaim) {
                claimableIds[index] = depositIds[i];
                index++;
            }
        }

        return claimableIds;
    }

    /**
     * @notice Claim a single deposit
     * @param hook The deposit hook address
     * @param depositId The deposit ID to claim
     * @return shares Amount of vault shares received
     */
    function claimDeposit(
        address hook,
        bytes32 depositId
    ) external returns (uint256 shares) {
        IVaultDepositHook depositHook = IVaultDepositHook(hook);
        return depositHook.claimDelayedDeposit(msg.sender, depositId);
    }

    /**
     * @notice Claim all available deposits for the caller
     * @param hook The deposit hook address
     * @return totalShares Total vault shares received
     * @return claimedCount Number of deposits claimed
     */
    function claimAllDeposits(
        address hook
    ) external returns (uint256 totalShares, uint256 claimedCount) {
        IVaultDepositHook depositHook = IVaultDepositHook(hook);
        bytes32[] memory depositIds = depositHook.getUserDeposits(msg.sender);

        totalShares = 0;
        claimedCount = 0;

        for (uint256 i = 0; i < depositIds.length; i++) {
            (bool canClaim, , ) = depositHook.canClaim(msg.sender, depositIds[i]);

            if (canClaim) {
                uint256 shares = depositHook.claimDelayedDeposit(msg.sender, depositIds[i]);
                totalShares += shares;
                claimedCount++;
            }
        }

        return (totalShares, claimedCount);
    }

    /**
     * @notice Check if user has any claimable deposits
     * @param hook The deposit hook address
     * @param user The user address
     * @return hasClaimable True if user has claimable deposits
     * @return count Number of claimable deposits
     */
    function hasClaimableDeposits(
        address hook,
        address user
    ) external view returns (bool hasClaimable, uint256 count) {
        IVaultDepositHook depositHook = IVaultDepositHook(hook);
        bytes32[] memory depositIds = depositHook.getUserDeposits(user);

        count = 0;
        for (uint256 i = 0; i < depositIds.length; i++) {
            (bool canClaim, , ) = depositHook.canClaim(user, depositIds[i]);
            if (canClaim) {
                count++;
            }
        }

        hasClaimable = count > 0;
        return (hasClaimable, count);
    }

    /**
     * @notice Get total locked assets for a user across all pending deposits
     * @param hook The deposit hook address
     * @param user The user address
     * @return totalLocked Total amount of assets locked
     * @return depositCount Number of pending deposits
     */
    function getTotalLockedAssets(
        address hook,
        address user
    ) external view returns (uint256 totalLocked, uint256 depositCount) {
        IVaultDepositHook depositHook = IVaultDepositHook(hook);
        bytes32[] memory depositIds = depositHook.getUserDeposits(user);

        totalLocked = 0;
        depositCount = 0;

        for (uint256 i = 0; i < depositIds.length; i++) {
            (
                ,
                ,
                uint256 assets,
                ,
                ,
                ,
                bool claimed,
            ) = depositHook.getDepositInfo(depositIds[i]);

            if (!claimed) {
                totalLocked += assets;
                depositCount++;
            }
        }

        return (totalLocked, depositCount);
    }

    /**
     * @notice Get next claimable deposit time for a user
     * @param hook The deposit hook address
     * @param user The user address
     * @return nextClaimTime Timestamp of next claimable deposit (0 if none or already claimable)
     * @return depositId ID of the next claimable deposit
     */
    function getNextClaimTime(
        address hook,
        address user
    ) external view returns (uint256 nextClaimTime, bytes32 depositId) {
        IVaultDepositHook depositHook = IVaultDepositHook(hook);
        bytes32[] memory depositIds = depositHook.getUserDeposits(user);

        nextClaimTime = type(uint256).max;
        depositId = bytes32(0);

        for (uint256 i = 0; i < depositIds.length; i++) {
            (
                ,
                ,
                ,
                ,
                uint256 expiry,
                ,
                bool claimed,
            ) = depositHook.getDepositInfo(depositIds[i]);

            if (!claimed && expiry < nextClaimTime) {
                nextClaimTime = expiry;
                depositId = depositIds[i];
            }
        }

        // Return 0 if already claimable
        if (nextClaimTime <= block.timestamp) {
            return (0, depositId);
        }

        return (nextClaimTime, depositId);
    }
}
