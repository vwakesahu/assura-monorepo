// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Vault} from "../Vault.sol";
import {MockERC20} from "./MockERC20.sol";
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VaultTest is Test {
    Vault vault;
    MockERC20 asset;
    address admin = address(0x999);
    address user1 = address(0x1);
    address user2 = address(0x2);
    address feeRecipient = address(0x3);

    function setUp() public {
        // Deploy mock ERC20 token
        asset = new MockERC20("Test Token", "TEST");
        
        // Deploy vault with the mock token as underlying asset
        vault = new Vault(
            IERC20(address(asset)),
            "Vault Token",
            "VAULT",
            admin
        );
        
        // Give users some tokens
        asset.mint(user1, 1000 * 10**18);
        asset.mint(user2, 1000 * 10**18);
        asset.mint(admin, 1000 * 10**18);
    }

    function test_Deposit() public {
        uint256 depositAmount = 100 * 10**18;
        
        // User1 approves vault to spend tokens
        vm.prank(user1);
        asset.approve(address(vault), depositAmount);
        
        // User1 deposits tokens
        vm.prank(user1);
        uint256 shares = vault.deposit(depositAmount, user1);
        
        // Check that shares were minted
        assertGt(shares, 0, "Shares should be greater than 0");
        assertEq(vault.balanceOf(user1), shares, "User1 should have the minted shares");
        assertEq(vault.totalAssets(), depositAmount, "Vault should have the deposited assets");
    }

    function test_DepositWithFee() public {
        // Set entry fee to 1% (100 basis points)
        vm.prank(admin);
        vault.setEntryFee(100);
        vm.prank(admin);
        vault.setEntryFeeRecipient(feeRecipient);
        
        uint256 depositAmount = 100 * 10**18;
        uint256 initialFeeBalance = asset.balanceOf(feeRecipient);
        
        // User1 approves and deposits
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, user1);
        vm.stopPrank();
        
        // Check that fee was collected (using approximate check due to rounding)
        uint256 feeCollected = asset.balanceOf(feeRecipient) - initialFeeBalance;
        uint256 expectedFeeMin = depositAmount * 100 / 10100; // Minimum expected fee
        assertGe(feeCollected, expectedFeeMin, "Fee recipient should receive at least expected fee");
        assertLe(feeCollected, expectedFeeMin + 1, "Fee should be within rounding tolerance");
        
        // Vault should have assets minus fee
        assertEq(vault.totalAssets(), depositAmount - feeCollected, "Vault should have assets minus fee");
        assertGt(shares, 0, "Shares should be minted");
    }

    function test_Withdraw() public {
        uint256 depositAmount = 100 * 10**18;
        
        // User1 deposits
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, user1);
        vm.stopPrank();
        
        // User1 withdraws
        vm.prank(user1);
        vault.withdraw(depositAmount, user1, user1);
        
        // Check withdrawal
        assertEq(asset.balanceOf(user1), 1000 * 10**18, "User1 should have their tokens back");
        assertEq(vault.totalAssets(), 0, "Vault should be empty");
        assertEq(vault.balanceOf(user1), 0, "User1 should have no shares");
    }

    function test_Mint() public {
        uint256 sharesToMint = 100 * 10**18;
        
        // User1 mints shares
        vm.startPrank(user1);
        asset.approve(address(vault), type(uint256).max);
        uint256 assets = vault.mint(sharesToMint, user1);
        vm.stopPrank();
        
        // Check that assets were deposited
        assertGt(assets, 0, "Assets should be greater than 0");
        assertEq(vault.balanceOf(user1), sharesToMint, "User1 should have the minted shares");
    }

    function test_Redeem() public {
        uint256 depositAmount = 100 * 10**18;
        
        // User1 deposits
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, user1);
        vm.stopPrank();
        
        // User1 redeems shares
        vm.prank(user1);
        uint256 assets = vault.redeem(shares, user1, user1);
        
        // Check redemption
        assertEq(assets, depositAmount, "Should redeem the same amount");
        assertEq(asset.balanceOf(user1), 1000 * 10**18, "User1 should have their tokens back");
        assertEq(vault.balanceOf(user1), 0, "User1 should have no shares");
    }

    function test_ExchangeRate() public {
        uint256 depositAmount = 100 * 10**18;
        
        // User1 deposits
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, user1);
        vm.stopPrank();
        
        // Check exchange rate functions
        uint256 assetsPerShare = vault.convertToAssets(shares);
        uint256 sharesFromAssets = vault.convertToShares(depositAmount);
        
        assertEq(assetsPerShare, depositAmount, "Assets per share should match deposit");
        assertEq(sharesFromAssets, shares, "Shares conversion should match");
    }

    function test_MultipleUsers() public {
        uint256 deposit1 = 100 * 10**18;
        uint256 deposit2 = 200 * 10**18;
        
        // User1 deposits
        vm.startPrank(user1);
        asset.approve(address(vault), deposit1);
        uint256 shares1 = vault.deposit(deposit1, user1);
        vm.stopPrank();
        
        // User2 deposits
        vm.startPrank(user2);
        asset.approve(address(vault), deposit2);
        uint256 shares2 = vault.deposit(deposit2, user2);
        vm.stopPrank();
        
        // Check balances
        assertEq(vault.totalAssets(), deposit1 + deposit2, "Total assets should be sum of deposits");
        assertEq(vault.balanceOf(user1), shares1, "User1 should have their shares");
        assertEq(vault.balanceOf(user2), shares2, "User2 should have their shares");
    }

    function test_WithdrawWithFee() public {
        uint256 depositAmount = 100 * 10**18;
        
        // Set exit fee to 1% (100 basis points) before deposit
        vm.prank(admin);
        vault.setExitFee(100);
        vm.prank(admin);
        vault.setExitFeeRecipient(feeRecipient);
        
        // User1 deposits first
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, user1);
        uint256 userBalanceBefore = asset.balanceOf(user1);
        vm.stopPrank();
        
        uint256 initialFeeBalance = asset.balanceOf(feeRecipient);
        uint256 vaultAssetsBefore = vault.totalAssets();
        
        // User1 withdraws - they can only withdraw what they have (less fee)
        // Calculate how much they can actually withdraw
        uint256 maxWithdrawable = vault.previewRedeem(shares);
        vm.prank(user1);
        vault.withdraw(maxWithdrawable, user1, user1);
        
        // Check that exit fee was collected
        uint256 feeCollected = asset.balanceOf(feeRecipient) - initialFeeBalance;
        assertGt(feeCollected, 0, "Exit fee should be collected");
        
        // User should receive less than depositAmount due to fee
        uint256 userReceived = asset.balanceOf(user1) - userBalanceBefore;
        assertLt(userReceived, depositAmount, "User should receive less than deposit due to fee");
        assertEq(userReceived, maxWithdrawable, "User should receive the previewed amount");
        
        // Vault should have less assets (withdrawn amount + fee)
        assertLt(vault.totalAssets(), vaultAssetsBefore, "Vault assets should decrease");
        // Allow for rounding - user should have 0 or at most 1 wei of shares left
        assertLe(vault.balanceOf(user1), 1, "User should have no shares left (or at most 1 wei due to rounding)");
    }

    function test_PauseUnpause() public {
        uint256 depositAmount = 100 * 10**18;
        
        // Pause the vault
        vm.prank(admin);
        vault.pause();
        
        // Try to deposit while paused - should fail
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vm.expectRevert();
        vault.deposit(depositAmount, user1);
        vm.stopPrank();
        
        // Unpause
        vm.prank(admin);
        vault.unpause();
        
        // Now deposit should work
        vm.startPrank(user1);
        vault.deposit(depositAmount, user1);
        vm.stopPrank();
        
        assertGt(vault.balanceOf(user1), 0, "Deposit should work after unpause");
    }

    function test_SetFees() public {
        assertEq(vault.entryFeeBps(), 0, "Initial entry fee should be 0");
        assertEq(vault.exitFeeBps(), 0, "Initial exit fee should be 0");
        
        // Set fees
        vm.prank(admin);
        vault.setEntryFee(50); // 0.5%
        vm.prank(admin);
        vault.setExitFee(75); // 0.75%
        
        assertEq(vault.entryFeeBps(), 50, "Entry fee should be set");
        assertEq(vault.exitFeeBps(), 75, "Exit fee should be set");
    }

    function test_SetFeesRevertOnMax() public {
        // Try to set fee above maximum (10%)
        vm.prank(admin);
        vm.expectRevert();
        vault.setEntryFee(1001); // Exceeds max of 1000
        
        vm.prank(admin);
        vm.expectRevert();
        vault.setExitFee(1001);
    }

    function test_SetFeeRecipients() public {
        assertEq(vault.entryFeeRecipient(), admin, "Initial entry fee recipient should be admin");
        assertEq(vault.exitFeeRecipient(), admin, "Initial exit fee recipient should be admin");
        
        // Set new recipients
        vm.prank(admin);
        vault.setEntryFeeRecipient(feeRecipient);
        vm.prank(admin);
        vault.setExitFeeRecipient(feeRecipient);
        
        assertEq(vault.entryFeeRecipient(), feeRecipient, "Entry fee recipient should be updated");
        assertEq(vault.exitFeeRecipient(), feeRecipient, "Exit fee recipient should be updated");
    }

    function test_OnlyAdminCanPause() public {
        // Non-admin cannot pause
        vm.prank(user1);
        vm.expectRevert();
        vault.pause();
        
        // Admin can pause
        vm.prank(admin);
        vault.pause();
    }

    function test_OnlyFeeManagerCanSetFees() public {
        // Non-admin cannot set fees
        vm.prank(user1);
        vm.expectRevert();
        vault.setEntryFee(100);
        
        // Admin can set fees
        vm.prank(admin);
        vault.setEntryFee(100);
    }
}

