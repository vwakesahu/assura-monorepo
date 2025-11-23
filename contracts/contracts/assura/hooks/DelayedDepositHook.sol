// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IVaultDepositHook.sol";
import "../../account/NexusAccountDeployer.sol";

/**
 * @title DelayedDepositHook
 * @notice Elegant hook implementation for handling delayed vault deposits
 * @dev Holds user funds during compliance delay, then deposits to vault via nexus account
 */
contract DelayedDepositHook is IVaultDepositHook, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct DelayedDeposit {
        address user;
        address asset;
        uint256 assets;
        address receiver;
        uint256 expiry;
        address nexusAccount;
        bool claimed;
    }

    // Vault this hook is attached to
    IERC4626 public immutable vault;

    // Nexus account deployer
    NexusAccountDeployer public immutable nexusDeployer;

    // Delayed deposits storage: depositId => DelayedDeposit
    mapping(bytes32 => DelayedDeposit) public delayedDeposits;

    // User => depositIds[]
    mapping(address => bytes32[]) public userDeposits;

    // Events
    event DepositDelayed(
        bytes32 indexed depositId,
        address indexed user,
        address indexed nexusAccount,
        uint256 assets,
        uint256 expiry
    );

    event DepositClaimed(
        bytes32 indexed depositId,
        address indexed user,
        address indexed nexusAccount,
        uint256 assets,
        uint256 shares
    );

    constructor(
        address _vault,
        address _nexusDeployer
    ) Ownable(msg.sender) {
        require(_vault != address(0), "Invalid vault");
        require(_nexusDeployer != address(0), "Invalid deployer");

        vault = IERC4626(_vault);
        nexusDeployer = NexusAccountDeployer(_nexusDeployer);
    }

    /**
     * @notice Hook called before deposit - handles delayed deposits
     * @dev If bypassExpiry > 0, deposit is delayed and funds are held
     * @dev Shares always go to nexus account, not the original receiver parameter
     */
    function beforeDeposit(
        address user,
        address asset,
        uint256 assets,
        address /* receiver */,
        uint256 bypassExpiry
    ) external override returns (bool shouldProceed, bytes memory hookData) {
        require(msg.sender == address(vault), "Only vault");

        // If no delay, proceed with normal deposit
        if (bypassExpiry == 0 || bypassExpiry <= block.timestamp) {
            return (true, "");
        }

        // User has delay - hold funds and deploy nexus account

        // Deploy or get nexus account
        address nexusAccount;
        try nexusDeployer.deployAccount(user) returns (address payable deployed) {
            nexusAccount = deployed;
        } catch {
            // Account already exists
            nexusAccount = nexusDeployer.getDeployedAccount(user);
        }

        require(nexusAccount != address(0), "Failed to get nexus account");

        // NOTE: Hook does NOT transfer tokens - vault will do that
        // Hook only tracks the deposit and deploys nexus account

        // Create delayed deposit entry
        bytes32 depositId = keccak256(
            abi.encodePacked(user, asset, assets, nexusAccount, block.timestamp, block.number)
        );

        // Always set receiver to nexusAccount - shares will go to the smart account, not user's EOA
        delayedDeposits[depositId] = DelayedDeposit({
            user: user,
            asset: asset,
            assets: assets,
            receiver: nexusAccount, // Shares always go to nexus account, not original receiver
            expiry: bypassExpiry,
            nexusAccount: nexusAccount,
            claimed: false
        });

        userDeposits[user].push(depositId);

        emit DepositDelayed(depositId, user, nexusAccount, assets, bypassExpiry);

        // Return false to prevent immediate deposit
        // Pass nexusAccount address so vault knows where to transfer tokens
        return (false, abi.encode(depositId, nexusAccount));
    }

    /**
     * @notice Hook called after deposit
     * @dev Can be used for logging or additional logic
     */
    function afterDeposit(
        address /* user */,
        address /* asset */,
        uint256 /* assets */,
        uint256 /* shares */,
        address /* receiver */,
        bytes memory /* hookData */
    ) external pure override {
        // Optional: Add any post-deposit logic here
    }

    /**
     * @notice Check if a delayed deposit can be claimed
     */
    function canClaim(
        address /* user */,
        bytes32 depositId
    ) external view override returns (bool, address, uint256) {
        DelayedDeposit storage deposit = delayedDeposits[depositId];

        if (deposit.user == address(0)) {
            return (false, address(0), 0);
        }

        if (deposit.claimed) {
            return (false, deposit.nexusAccount, 0);
        }

        bool claimable = block.timestamp >= deposit.expiry;
        return (claimable, deposit.nexusAccount, deposit.assets);
    }

    /**
     * @notice Claim delayed deposit after expiry
     * @dev Nexus account holds the funds during delay
     * @dev User must manually approve vault from nexus account and call this function
     * @dev Future: Can be automated via executeFromExecutor pattern
     *
     * Steps for claiming:
     * 1. User calls nexus.approve(vault, assets) from their nexus account
     * 2. User (or anyone) calls this function to deposit from nexus account to vault
     * 3. Vault shares are minted to nexus account
     */
    function claimDelayedDeposit(
        address user,
        bytes32 depositId
    ) external override nonReentrant returns (uint256 shares) {
        DelayedDeposit storage deposit = delayedDeposits[depositId];

        require(deposit.user == user, "Not deposit owner");
        require(!deposit.claimed, "Already claimed");
        require(block.timestamp >= deposit.expiry, "Deposit still locked");

        // Mark as claimed
        deposit.claimed = true;

        // Check if nexus account has approved vault
        uint256 allowance = IERC20(deposit.asset).allowance(deposit.nexusAccount, address(vault));
        require(allowance >= deposit.assets, "Nexus account must approve vault first");

        // Deposit from nexus account to vault - shares go back to nexus account
        // Note: This requires the nexus account to have approved the vault
        shares = vault.deposit(deposit.assets, deposit.nexusAccount);

        emit DepositClaimed(
            depositId,
            user,
            deposit.nexusAccount,
            deposit.assets,
            shares
        );

        return shares;
    }

    /**
     * @notice Get all deposit IDs for a user
     */
    function getUserDeposits(address user) external view returns (bytes32[] memory) {
        return userDeposits[user];
    }

    /**
     * @notice Get detailed deposit info
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
    ) {
        DelayedDeposit storage deposit = delayedDeposits[depositId];

        return (
            deposit.user,
            deposit.asset,
            deposit.assets,
            deposit.receiver,
            deposit.expiry,
            deposit.nexusAccount,
            deposit.claimed,
            !deposit.claimed && block.timestamp >= deposit.expiry
        );
    }

    /**
     * @notice Emergency withdraw for owner (safety mechanism)
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
