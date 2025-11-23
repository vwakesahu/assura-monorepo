// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/**
 * @title BaseSepoliaTest
 * @notice Example test contract for running tests on actual Base Sepolia network
 * @dev This test contract demonstrates how to run tests on actual Base Sepolia using a private key
 * 
 * Usage:
 *   forge test --rpc-url https://sepolia.base.org --private-key $PRIVATE_KEY --chain-id 84532 --match-contract BaseSepoliaTest -vvv
 * 
 * Or use the script:
 *   ./scripts/run-tests-base-sepolia.sh $PRIVATE_KEY
 */
import {Counter} from "../Counter.sol";
import {AssuraVerifier} from "../assura/AssuraVerifier.sol";
import {TestHelper, TestConfig} from "./TestConfig.sol";
import {console} from "forge-std/Test.sol";

contract BaseSepoliaTest is TestHelper {
    Counter public counter;
    AssuraVerifier public assuraVerifier;
    
    address public owner;
    address public teeAddress;
    address public user;
    
    uint256 public ownerPrivateKey;
    uint256 public teePrivateKey;
    uint256 public userPrivateKey;

    function setUp() public {
        // Initialize test helper
        _initializeTestHelper();
        
        // Log network info
        logNetworkInfo();
        
        // Verify we're on Base Sepolia
        require(
            TestConfig.isBaseSepolia(),
            "BaseSepoliaTest: Must run on Base Sepolia network"
        );
        
        // Create wallets for owner, TEE, and user
        // Note: In actual network testing, you might want to use existing addresses
        // For this example, we'll use deterministic addresses
        ownerPrivateKey = 0x1;
        teePrivateKey = 0x2;
        userPrivateKey = 0x3;
        
        owner = vm.addr(ownerPrivateKey);
        teeAddress = vm.addr(teePrivateKey);
        user = vm.addr(userPrivateKey);
        
        // Ensure TEE address is an EOA
        vm.etch(teeAddress, "");
        vm.deal(teeAddress, 1 ether);
        
        // Deploy contracts
        // Note: These will be actual deployments on Base Sepolia
        vm.startBroadcast();
        
        assuraVerifier = new AssuraVerifier(owner, teeAddress);
        counter = new Counter(address(assuraVerifier));
        
        vm.stopBroadcast();
        
        // Store deployed addresses
        string[] memory names = new string[](2);
        address[] memory addrs = new address[](2);
        names[0] = "AssuraVerifier";
        names[1] = "Counter";
        addrs[0] = address(assuraVerifier);
        addrs[1] = address(counter);
        setupCurrentNetworkAddresses(names, addrs);
        
        console.log("AssuraVerifier deployed at:", address(assuraVerifier));
        console.log("Counter deployed at:", address(counter));
    }

    function test_NetworkDetection() public view {
        // Verify we're on Base Sepolia
        assertEq(block.chainid, TestConfig.CHAIN_ID_BASE_SEPOLIA, "Must be on Base Sepolia");
        assertTrue(TestConfig.isBaseSepolia(), "Must detect Base Sepolia");
        assertTrue(TestConfig.isActualNetwork(), "Must be actual network");
        assertTrue(TestConfig.isFork(), "Base Sepolia is a fork");
    }

    function test_ContractDeployment() public view {
        // Verify contracts are deployed
        assertNotEq(address(assuraVerifier), address(0), "AssuraVerifier not deployed");
        assertNotEq(address(counter), address(0), "Counter not deployed");
        
        // Verify AssuraVerifier configuration
        assertEq(assuraVerifier.ASSURA_TEE_ADDRESS(), teeAddress, "TEE address mismatch");
        assertEq(assuraVerifier.owner(), owner, "Owner mismatch");
    }

    function test_RetrieveStoredAddresses() public view {
        // Test address retrieval
        address verifierAddr = getAddress("AssuraVerifier");
        address counterAddr = getAddress("Counter");
        
        assertEq(verifierAddr, address(assuraVerifier), "AssuraVerifier address mismatch");
        assertEq(counterAddr, address(counter), "Counter address mismatch");
        assertTrue(hasAddress("AssuraVerifier"), "AssuraVerifier address not found");
        assertTrue(hasAddress("Counter"), "Counter address not found");
    }
}

