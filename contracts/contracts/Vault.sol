// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Vault
 * @dev An ERC-4626 compliant vault with fees, access control, and pausable functionality.
 * 
 * Features:
 * - Entry and exit fees (configurable in basis points)
 * - Access control for admin functions
 * - Pausable deposits/withdrawals
 * - Fee recipient configuration
 * - Inflation attack protection (via OpenZeppelin's ERC4626)
 */
contract Vault is ERC4626, AccessControl, Pausable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /// @dev Role identifier for vault administrators
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    /// @dev Role identifier for fee managers
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");

    /// @dev Basis point scale (10000 = 100%)
    uint256 private constant _BASIS_POINT_SCALE = 10000;
    
    /// @dev Maximum fee allowed (10% = 1000 basis points)
    uint256 private constant _MAX_FEE_BPS = 1000;

    /// @dev Entry fee in basis points (e.g., 100 = 1%)
    uint256 private _entryFeeBps;
    
    /// @dev Exit fee in basis points (e.g., 100 = 1%)
    uint256 private _exitFeeBps;
    
    /// @dev Address that receives entry fees
    address private _entryFeeRecipient;
    
    /// @dev Address that receives exit fees
    address private _exitFeeRecipient;

    /// @dev Emitted when entry fee is updated
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    
    /// @dev Emitted when exit fee is updated
    event ExitFeeUpdated(uint256 oldFee, uint256 newFee);
    
    /// @dev Emitted when entry fee recipient is updated
    event EntryFeeRecipientUpdated(address oldRecipient, address newRecipient);
    
    /// @dev Emitted when exit fee recipient is updated
    event ExitFeeRecipientUpdated(address oldRecipient, address newRecipient);

    /**
     * @dev Sets the underlying asset token, vault name/symbol, and initial admin.
     * @param asset_ The ERC20 token that will be deposited into the vault
     * @param name_ The name of the vault token
     * @param symbol_ The symbol of the vault token
     * @param admin_ The address that will have admin privileges
     */
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address admin_
    ) ERC4626(asset_) ERC20(name_, symbol_) {
        if (admin_ == address(0)) {
            revert("Vault: admin cannot be zero address");
        }
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ADMIN_ROLE, admin_);
        _grantRole(FEE_MANAGER_ROLE, admin_);
        
        _entryFeeRecipient = admin_;
        _exitFeeRecipient = admin_;
    }

    // ============ ERC4626 Overrides with Fees ============

    /**
     * @dev Preview deposit accounting for entry fee.
     * @param assets Amount of assets to deposit
     * @return shares Amount of shares that would be minted
     */
    function previewDeposit(uint256 assets) public view virtual override returns (uint256) {
        uint256 fee = _calculateFeeOnTotal(assets, _entryFeeBps);
        return super.previewDeposit(assets - fee);
    }

    /**
     * @dev Preview mint accounting for entry fee.
     * @param shares Amount of shares to mint
     * @return assets Amount of assets required (including fee)
     */
    function previewMint(uint256 shares) public view virtual override returns (uint256) {
        uint256 assets = super.previewMint(shares);
        return assets + _calculateFeeOnRaw(assets, _entryFeeBps);
    }

    /**
     * @dev Preview withdraw accounting for exit fee.
     * @param assets Amount of assets to withdraw
     * @return shares Amount of shares that would be burned
     */
    function previewWithdraw(uint256 assets) public view virtual override returns (uint256) {
        uint256 fee = _calculateFeeOnRaw(assets, _exitFeeBps);
        return super.previewWithdraw(assets + fee);
    }

    /**
     * @dev Preview redeem accounting for exit fee.
     * @param shares Amount of shares to redeem
     * @return assets Amount of assets that would be received (after fee)
     */
    function previewRedeem(uint256 shares) public view virtual override returns (uint256) {
        uint256 assets = super.previewRedeem(shares);
        return assets - _calculateFeeOnTotal(assets, _exitFeeBps);
    }

    /**
     * @dev Deposit assets and collect entry fee.
     */
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal virtual override whenNotPaused {
        uint256 fee = _calculateFeeOnTotal(assets, _entryFeeBps);
        address recipient = _entryFeeRecipient;

        super._deposit(caller, receiver, assets, shares);

        if (fee > 0 && recipient != address(0) && recipient != address(this)) {
            IERC20(asset()).safeTransfer(recipient, fee);
        }
    }

    /**
     * @dev Withdraw assets and collect exit fee.
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal virtual override whenNotPaused {
        uint256 fee = _calculateFeeOnRaw(assets, _exitFeeBps);
        address recipient = _exitFeeRecipient;

        super._withdraw(caller, receiver, owner, assets, shares);

        if (fee > 0 && recipient != address(0) && recipient != address(this)) {
            IERC20(asset()).safeTransfer(recipient, fee);
        }
    }

    // ============ Admin Functions ============

    /**
     * @dev Set the entry fee (in basis points).
     * @param feeBps New entry fee in basis points (max 1000 = 10%)
     */
    function setEntryFee(uint256 feeBps) external onlyRole(FEE_MANAGER_ROLE) {
        if (feeBps > _MAX_FEE_BPS) {
            revert("Vault: fee exceeds maximum");
        }
        
        uint256 oldFee = _entryFeeBps;
        _entryFeeBps = feeBps;
        emit EntryFeeUpdated(oldFee, feeBps);
    }

    /**
     * @dev Set the exit fee (in basis points).
     * @param feeBps New exit fee in basis points (max 1000 = 10%)
     */
    function setExitFee(uint256 feeBps) external onlyRole(FEE_MANAGER_ROLE) {
        if (feeBps > _MAX_FEE_BPS) {
            revert("Vault: fee exceeds maximum");
        }
        
        uint256 oldFee = _exitFeeBps;
        _exitFeeBps = feeBps;
        emit ExitFeeUpdated(oldFee, feeBps);
    }

    /**
     * @dev Set the entry fee recipient address.
     * @param recipient Address that will receive entry fees
     */
    function setEntryFeeRecipient(address recipient) external onlyRole(FEE_MANAGER_ROLE) {
        if (recipient == address(0)) {
            revert("Vault: recipient cannot be zero address");
        }
        
        address oldRecipient = _entryFeeRecipient;
        _entryFeeRecipient = recipient;
        emit EntryFeeRecipientUpdated(oldRecipient, recipient);
    }

    /**
     * @dev Set the exit fee recipient address.
     * @param recipient Address that will receive exit fees
     */
    function setExitFeeRecipient(address recipient) external onlyRole(FEE_MANAGER_ROLE) {
        if (recipient == address(0)) {
            revert("Vault: recipient cannot be zero address");
        }
        
        address oldRecipient = _exitFeeRecipient;
        _exitFeeRecipient = recipient;
        emit ExitFeeRecipientUpdated(oldRecipient, recipient);
    }

    /**
     * @dev Pause all deposits and withdrawals.
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause deposits and withdrawals.
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============ View Functions ============

    /**
     * @dev Get the current entry fee in basis points.
     */
    function entryFeeBps() external view returns (uint256) {
        return _entryFeeBps;
    }

    /**
     * @dev Get the current exit fee in basis points.
     */
    function exitFeeBps() external view returns (uint256) {
        return _exitFeeBps;
    }

    /**
     * @dev Get the entry fee recipient address.
     */
    function entryFeeRecipient() external view returns (address) {
        return _entryFeeRecipient;
    }

    /**
     * @dev Get the exit fee recipient address.
     */
    function exitFeeRecipient() external view returns (address) {
        return _exitFeeRecipient;
    }

    // ============ Internal Fee Calculation ============

    /**
     * @dev Calculate fee on raw amount (fee added to amount).
     * Used for mint and withdraw operations.
     */
    function _calculateFeeOnRaw(uint256 amount, uint256 feeBps) private pure returns (uint256) {
        if (feeBps == 0) return 0;
        return amount.mulDiv(feeBps, _BASIS_POINT_SCALE, Math.Rounding.Ceil);
    }

    /**
     * @dev Calculate fee from total amount (fee included in amount).
     * Used for deposit and redeem operations.
     */
    function _calculateFeeOnTotal(uint256 amount, uint256 feeBps) private pure returns (uint256) {
        if (feeBps == 0) return 0;
        return amount.mulDiv(feeBps, feeBps + _BASIS_POINT_SCALE, Math.Rounding.Ceil);
    }
}

