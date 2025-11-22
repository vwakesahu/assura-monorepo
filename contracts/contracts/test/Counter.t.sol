// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Counter} from "../Counter.sol";
import {AssuraVerifier} from "../assura/AssuraVerifier.sol";
import {IAssuraVerifier, VerifyingData} from "../assura/IAssuraVerifier.sol";
import {Test} from "forge-std/Test.sol";

// Import structs from AssuraVerifier
struct ActualAttestedData {
    uint256 score;
    uint256 timeAtWhichAttested;
    uint256 chainId;
}

struct ComplianceData {
    address userAddress;
    bytes32 key;
    bytes signedAttestedDataWithTEESignature;
    ActualAttestedData actualAttestedData;
}

contract CounterTest is Test {
    Counter public counter;
    AssuraVerifier public assuraVerifier;
    
    address public owner;
    address public teeAddress;
    address public user;
    
    uint256 public ownerPrivateKey;
    uint256 public teePrivateKey;
    uint256 public userPrivateKey;

    function setUp() public {
        // Create wallets for owner, TEE, and user
        ownerPrivateKey = 0x1;
        teePrivateKey = 0x2;
        userPrivateKey = 0x3;
        
        owner = vm.addr(ownerPrivateKey);
        teeAddress = vm.addr(teePrivateKey);
        user = vm.addr(userPrivateKey);
        
        // Deploy AssuraVerifier with owner and TEE address
        assuraVerifier = new AssuraVerifier(owner, teeAddress);
        
        // Deploy Counter with AssuraVerifier address
        counter = new Counter(address(assuraVerifier));
    }

    function test_InitialValue() public view {
        assertEq(counter.x(), 0, "Initial value should be 0");
    }

    function test_Deployment() public view {
        assertEq(address(counter.assuraVerifier()), address(assuraVerifier), "Counter should have correct AssuraVerifier");
        assertEq(assuraVerifier.owner(), owner, "AssuraVerifier should have correct owner");
        assertEq(assuraVerifier.ASSURA_TEE_ADDRESS(), teeAddress, "AssuraVerifier should have correct TEE address");
    }

    function test_VerifyingDataSet() public view {
        // Check that verifying data was set correctly in constructor
        bytes4 incSelector = counter.inc.selector;
        bytes4 incBySelector = counter.incBy.selector;
        
        VerifyingData memory vData1 = assuraVerifier.getVerifyingData(address(counter), bytes32(incSelector));
        assertEq(vData1.score, 100, "inc() should require score 100");
        
        VerifyingData memory vData2 = assuraVerifier.getVerifyingData(address(counter), bytes32(incBySelector));
        assertEq(vData2.score, 30, "incBy() should require score 30");
    }

    function test_IncWithValidComplianceData() public {
        bytes4 selector = counter.inc.selector;
        bytes32 key = bytes32(selector);
        
        // Create ActualAttestedData with score 100 (required for inc)
        ActualAttestedData memory attestedData = ActualAttestedData({
            score: 100,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key
        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(attestedData))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teePrivateKey, hash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Create ComplianceData
        ComplianceData memory complianceData = ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call inc() with valid compliance data
        vm.prank(user);
        counter.inc(encodedComplianceData);
        
        // Verify counter was incremented
        assertEq(counter.x(), 1, "Counter should be incremented to 1");
    }

    function test_IncByWithValidComplianceData() public {
        bytes4 selector = counter.incBy.selector;
        bytes32 key = bytes32(selector);
        
        // Create ActualAttestedData with score 30 (required for incBy)
        ActualAttestedData memory attestedData = ActualAttestedData({
            score: 30,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key
        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(attestedData))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teePrivateKey, hash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Create ComplianceData
        ComplianceData memory complianceData = ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call incBy() with valid compliance data
        vm.prank(user);
        counter.incBy(5, encodedComplianceData);
        
        // Verify counter was incremented
        assertEq(counter.x(), 5, "Counter should be incremented to 5");
    }

    function test_IncFailsWithInsufficientScore() public {
        bytes4 selector = counter.inc.selector;
        bytes32 key = bytes32(selector);
        
        // Create ActualAttestedData with score 50 (less than required 100)
        ActualAttestedData memory attestedData = ActualAttestedData({
            score: 50,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key
        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(attestedData))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teePrivateKey, hash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Create ComplianceData
        ComplianceData memory complianceData = ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call inc() should fail due to insufficient score
        vm.prank(user);
        vm.expectRevert("Not a compliance user");
        counter.inc(encodedComplianceData);
    }

    function test_IncFailsWithWrongSignature() public {
        bytes4 selector = counter.inc.selector;
        bytes32 key = bytes32(selector);
        
        // Create ActualAttestedData with score 100
        ActualAttestedData memory attestedData = ActualAttestedData({
            score: 100,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with user's private key instead of TEE (wrong signature)
        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(attestedData))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, hash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Create ComplianceData
        ComplianceData memory complianceData = ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call inc() should fail due to wrong signature
        vm.prank(user);
        vm.expectRevert("Signature not from TEE");
        counter.inc(encodedComplianceData);
    }

    function test_IncFailsWithWrongKey() public {
        bytes4 selector = counter.incBy.selector; // Wrong selector for inc()
        bytes32 key = bytes32(selector);
        
        // Create ActualAttestedData with score 100
        ActualAttestedData memory attestedData = ActualAttestedData({
            score: 100,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key
        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(attestedData))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teePrivateKey, hash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Create ComplianceData with wrong key
        ComplianceData memory complianceData = ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call inc() should fail due to key mismatch
        vm.prank(user);
        vm.expectRevert("Key mismatch");
        counter.inc(encodedComplianceData);
    }

    function test_IncByZero() public {
        bytes4 selector = counter.incBy.selector;
        bytes32 key = bytes32(selector);
        
        // Create ActualAttestedData with score 30
        ActualAttestedData memory attestedData = ActualAttestedData({
            score: 30,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key
        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(attestedData))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teePrivateKey, hash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Create ComplianceData
        ComplianceData memory complianceData = ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call incBy(0) should fail
        vm.prank(user);
        vm.expectRevert("incBy: increment should be positive");
        counter.incBy(0, encodedComplianceData);
    }

    function test_MultipleIncrements() public {
        bytes4 selector = counter.inc.selector;
        bytes32 key = bytes32(selector);
        
        // Create ActualAttestedData with score 100
        ActualAttestedData memory attestedData = ActualAttestedData({
            score: 100,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key
        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(attestedData))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teePrivateKey, hash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Create ComplianceData
        ComplianceData memory complianceData = ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call inc() multiple times
        vm.prank(user);
        counter.inc(encodedComplianceData);
        vm.prank(user);
        counter.inc(encodedComplianceData);
        vm.prank(user);
        counter.inc(encodedComplianceData);
        
        // Verify counter was incremented 3 times
        assertEq(counter.x(), 3, "Counter should be incremented to 3");
    }
}
