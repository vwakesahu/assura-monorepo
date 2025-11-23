// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Counter} from "../Counter.sol";
import {AssuraVerifier} from "../assura/AssuraVerifier.sol";
import {IAssuraVerifier} from "../assura/IAssuraVerifier.sol";
import {AssuraTypes} from "../assura/types/AssuraTypes.sol";
import {Test} from "forge-std/Test.sol";
import {TestHelper, TestConfig} from "./TestConfig.sol";

contract CounterTest is TestHelper {
    Counter public counter;
    AssuraVerifier public assuraVerifier;
    
    address public owner;
    address public teeAddress;
    address public user;
    
    uint256 public ownerPrivateKey;
    uint256 public teePrivateKey;
    uint256 public userPrivateKey;

    function setUp() public {
        // Initialize test helper to detect network
        _initializeTestHelper();
        
        // Create wallets for owner, TEE, and user
        ownerPrivateKey = 0x1;
        teePrivateKey = 0x2;
        userPrivateKey = 0x3;
        
        owner = vm.addr(ownerPrivateKey);
        teeAddress = vm.addr(teePrivateKey);
        user = vm.addr(userPrivateKey);
        
        // When forking, ensure TEE address is treated as an EOA (not a contract)
        // This prevents SignatureChecker from trying to use EIP-1271 on a contract address
        if (TestConfig.isFork()) {
            // Clear any code at the TEE address to ensure it's treated as an EOA
            vm.etch(teeAddress, "");
            // Give it some ETH to ensure it's recognized as an EOA
            vm.deal(teeAddress, 1 ether);
        }
        
        // Deploy AssuraVerifier with owner and TEE address
        // NexusAccountDeployer is deployed automatically in constructor
        assuraVerifier = new AssuraVerifier(owner, teeAddress);
        
        // Deploy Counter with AssuraVerifier address
        counter = new Counter(address(assuraVerifier));
        
        // Store deployed addresses for current network (useful for forking scenarios)
        string[] memory names = new string[](2);
        address[] memory addrs = new address[](2);
        names[0] = "AssuraVerifier";
        names[1] = "Counter";
        addrs[0] = address(assuraVerifier);
        addrs[1] = address(counter);
        setupCurrentNetworkAddresses(names, addrs);
    }

    // Helper function to create EIP-191 signature
    function _createEIP191Signature(
        AssuraTypes.AttestedData memory attestedData,
        uint256 signerPrivateKey
    ) internal pure returns (bytes memory) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(attestedData))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, hash);
        return abi.encodePacked(r, s, v);
    }

    // Helper function to create EIP-712 signature
    function _createEIP712Signature(
        AssuraTypes.AttestedData memory attestedData,
        uint256 signerPrivateKey
    ) internal view returns (bytes memory) {
        // Compute domain separator manually (matches EIP712("AssuraVerifier", "1"))
        bytes32 eip712DomainHash = keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
        bytes32 nameHash = keccak256(bytes("AssuraVerifier"));
        bytes32 versionHash = keccak256(bytes("1"));
        bytes32 domainSeparator = keccak256(
            abi.encode(
                eip712DomainHash,
                nameHash,
                versionHash,
                block.chainid,
                address(assuraVerifier)
            )
        );
        
        // Create the struct hash
        bytes32 typeHash = keccak256(
            "AttestedData(uint256 score,uint256 timeAtWhichAttested,uint256 chainId)"
        );
        bytes32 structHash = keccak256(
            abi.encode(
                typeHash,
                attestedData.score,
                attestedData.timeAtWhichAttested,
                attestedData.chainId
            )
        );
        
        // Create the final digest
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
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
        bytes32 incSelector = counter.getOnlyUserWithScore100Selector();
        bytes32 incBySelector = counter.getOnlyUserWithScore30Selector();

        AssuraTypes.VerifyingData memory vData1 = assuraVerifier.getVerifyingData(address(counter), incSelector);
        assertEq(vData1.score, 5, "inc() should require score 5");

        AssuraTypes.VerifyingData memory vData2 = assuraVerifier.getVerifyingData(address(counter), incBySelector);
        assertEq(vData2.score, 10, "incBy() should require score 10");
    }

    function test_IncWithValidComplianceData() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 100 (required for inc)
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 5,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key (EIP-191 format)
        bytes memory signature = _createEIP191Signature(attestedData, teePrivateKey);
        
        // Create ComplianceData
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
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
        bytes32 key = counter.getOnlyUserWithScore30Selector();
        
        // Create ActualAttestedData with score 30 (required for incBy)
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 10,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key (EIP-191 format)
        bytes memory signature = _createEIP191Signature(attestedData, teePrivateKey);
        
        // Create ComplianceData
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
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

    function test_IncFailsWithInsufficientScore_CreatesBypassEntry() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 50 (less than required 100)
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 2,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key (EIP-191 format)
        bytes memory signature = _createEIP191Signature(attestedData, teePrivateKey);
        
        // Create ComplianceData
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        uint256 initialTimestamp = block.timestamp;
        
        // Call verifyWithBypass directly to create bypass entry (this persists)
        vm.prank(user);
        bool isValid = assuraVerifier.verifyWithBypass(address(counter), key, encodedComplianceData);
        assertFalse(isValid, "Verification should fail due to insufficient score");
        
        // Verify bypass entry was created
        // Public nested mapping getter returns struct fields as separate values
        (uint256 expiry, uint256 nonce, bool allowed) = assuraVerifier.bypassEntries(user, address(counter), key);
        assertTrue(allowed, "Bypass entry should be created with allowed=true");
        assertEq(nonce, 1, "Bypass entry should have nonce=1");
        
        // Calculate expected expiry: current time + (difference * 10 seconds)
        // Difference = 5 - 2 = 3
        // Expiry = initialTimestamp + (3 * 10 seconds) = initialTimestamp + 30 seconds
        uint256 expectedExpiry = initialTimestamp + (3 * 10);
        assertEq(expiry, expectedExpiry, "Bypass expiry should be calculated correctly");
        
        // Now calling inc() should still fail (bypass not expired yet)
        vm.prank(user);
        vm.expectRevert("AssuraVerifierLib: Compliance verification failed");
        counter.inc(encodedComplianceData);
    }

    function test_BypassEntryAllowsAccessAfterExpiry() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 50 (less than required 100)
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 2,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key (EIP-191 format)
        bytes memory signature = _createEIP191Signature(attestedData, teePrivateKey);
        
        // Create ComplianceData
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        uint256 initialTimestamp = block.timestamp;
        
        // Create bypass entry by calling verifyWithBypass directly
        vm.prank(user);
        bool isValid1 = assuraVerifier.verifyWithBypass(address(counter), key, encodedComplianceData);
        assertFalse(isValid1, "Verification should fail initially");
        
        // Verify bypass entry was created
        (uint256 expiry, , ) = assuraVerifier.bypassEntries(user, address(counter), key);
        uint256 expectedExpiry = initialTimestamp + (3 * 10); // 30 seconds (difference: 5 - 2 = 3)
        assertEq(expiry, expectedExpiry, "Bypass expiry should be set correctly");
        
        // Fast forward time to just before expiry (should still fail)
        vm.warp(expectedExpiry - 1);
        vm.prank(user);
        vm.expectRevert("AssuraVerifierLib: Compliance verification failed");
        counter.inc(encodedComplianceData);
        
        // Fast forward time to after expiry (should succeed)
        vm.warp(expectedExpiry);
        vm.prank(user);
        counter.inc(encodedComplianceData);
        
        // Verify counter was incremented
        assertEq(counter.x(), 1, "Counter should be incremented after bypass expiry");
    }

    function test_BypassEntryNonceIncrements() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 50
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 2,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        bytes memory signature = _createEIP191Signature(attestedData, teePrivateKey);
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // First attempt: creates bypass entry with nonce 1
        vm.prank(user);
        assertFalse(assuraVerifier.verifyWithBypass(address(counter), key, encodedComplianceData), "Verification should fail");
        
        (, uint256 nonce1, ) = assuraVerifier.bypassEntries(user, address(counter), key);
        assertEq(nonce1, 1, "First bypass entry should have nonce=1");
        
        // Second attempt: updates bypass entry with nonce 2
        vm.prank(user);
        assertFalse(assuraVerifier.verifyWithBypass(address(counter), key, encodedComplianceData), "Verification should still fail");
        
        (, uint256 nonce2, ) = assuraVerifier.bypassEntries(user, address(counter), key);
        assertEq(nonce2, 2, "Second bypass entry should have nonce=2");
    }

    function test_BypassEntryExpiryCalculation() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();

        // Test with score 3 (difference = 2, expiry = 20 seconds)
        uint256 timestamp1 = block.timestamp;
        AssuraTypes.AttestedData memory attestedData1 = AssuraTypes.AttestedData({
            score: 3,
            timeAtWhichAttested: timestamp1,
            chainId: block.chainid
        });

        vm.prank(user);
        assertFalse(assuraVerifier.verifyWithBypass(address(counter), key, abi.encode(AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: _createEIP191Signature(attestedData1, teePrivateKey),
            actualAttestedData: attestedData1
        }))), "Verification should fail");

        assertEq(_getBypassExpiry(user, key), timestamp1 + ((5 - 3) * 10), "Expiry should be 20 seconds for score difference of 2");

        // Test with score 1 (difference = 4, expiry = 40 seconds)
        address user2 = vm.addr(0x4);
        uint256 timestamp2 = block.timestamp;
        AssuraTypes.AttestedData memory attestedData2 = AssuraTypes.AttestedData({
            score: 1,
            timeAtWhichAttested: timestamp2,
            chainId: block.chainid
        });

        vm.prank(user2);
        assertFalse(assuraVerifier.verifyWithBypass(address(counter), key, abi.encode(AssuraTypes.ComplianceData({
            userAddress: user2,
            key: key,
            signedAttestedDataWithTEESignature: _createEIP191Signature(attestedData2, teePrivateKey),
            actualAttestedData: attestedData2
        }))), "Verification should fail");

        assertEq(_getBypassExpiry(user2, key), timestamp2 + ((5 - 1) * 10), "Expiry should be 40 seconds for score difference of 4");
    }

    function test_BypassEntryIsPerUserContractAndFunction() public {
        bytes32 key1 = counter.getOnlyUserWithScore100Selector();
        bytes32 key2 = counter.getOnlyUserWithScore30Selector();
        address user2 = vm.addr(0x4);
        uint256 timestamp = block.timestamp;
        
        // User 1, function 1 (score 50, needs 100)
        AssuraTypes.AttestedData memory attestedData1 = AssuraTypes.AttestedData({
            score: 2,
            timeAtWhichAttested: timestamp,
            chainId: block.chainid
        });
        bytes memory signature1 = _createEIP191Signature(attestedData1, teePrivateKey);
        
        vm.prank(user);
        assertFalse(assuraVerifier.verifyWithBypass(address(counter), key1, abi.encode(AssuraTypes.ComplianceData({
            userAddress: user,
            key: key1,
            signedAttestedDataWithTEESignature: signature1,
            actualAttestedData: attestedData1
        }))), "Verification should fail");
        
        // User 2, function 1 (score 50, needs 100)
        vm.prank(user2);
        assertFalse(assuraVerifier.verifyWithBypass(address(counter), key1, abi.encode(AssuraTypes.ComplianceData({
            userAddress: user2,
            key: key1,
            signedAttestedDataWithTEESignature: signature1,
            actualAttestedData: attestedData1
        }))), "Verification should fail");
        
        // User 1, function 2 (score 8, needs 10)
        AssuraTypes.AttestedData memory attestedData2 = AssuraTypes.AttestedData({
            score: 8,
            timeAtWhichAttested: timestamp,
            chainId: block.chainid
        });
        bytes memory signature2 = _createEIP191Signature(attestedData2, teePrivateKey);

        vm.prank(user);
        assertFalse(assuraVerifier.verifyWithBypass(address(counter), key2, abi.encode(AssuraTypes.ComplianceData({
            userAddress: user,
            key: key2,
            signedAttestedDataWithTEESignature: signature2,
            actualAttestedData: attestedData2
        }))), "Verification should fail");

        // Verify all bypass entries are separate - check one at a time to avoid stack too deep
        assertEq(_getBypassExpiry(user, key1), timestamp + (3 * 10), "Bypass 1 expiry should be 30 seconds (5-2=3)");
        assertEq(_getBypassExpiry(user2, key1), timestamp + (3 * 10), "Bypass 2 expiry should be 30 seconds (5-2=3)");
        assertEq(_getBypassExpiry(user, key2), timestamp + (2 * 10), "Bypass 3 expiry should be 20 seconds (10-8=2)");
    }
    
    function _getBypassExpiry(address userAddr, bytes32 key) internal view returns (uint256) {
        (uint256 expiry, , ) = assuraVerifier.bypassEntries(userAddr, address(counter), key);
        return expiry;
    }

    function test_IncFailsWithWrongSignature() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 100
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 5,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with user's private key instead of TEE (wrong signature)
        bytes memory signature = _createEIP191Signature(attestedData, userPrivateKey);
        
        // Create ComplianceData
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call inc() should fail due to wrong signature
        vm.prank(user);
        vm.expectRevert("AssuraVerifier: Signature not from TEE");
        counter.inc(encodedComplianceData);
    }

    function test_IncFailsWithWrongKey() public {
        bytes32 key = counter.getOnlyUserWithScore30Selector(); // Wrong selector for inc()
        
        // Create ActualAttestedData with score 100
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 5,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key (EIP-191 format)
        bytes memory signature = _createEIP191Signature(attestedData, teePrivateKey);
        
        // Create ComplianceData with wrong key
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call inc() should fail due to key mismatch
        vm.prank(user);
        vm.expectRevert("AssuraVerifier: Key mismatch");
        counter.inc(encodedComplianceData);
    }

    function test_IncByZero() public {
        bytes32 key = counter.getOnlyUserWithScore30Selector();
        
        // Create ActualAttestedData with score 30
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 10,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key (EIP-191 format)
        bytes memory signature = _createEIP191Signature(attestedData, teePrivateKey);
        
        // Create ComplianceData
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
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
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 100
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 5,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key (EIP-191 format)
        bytes memory signature = _createEIP191Signature(attestedData, teePrivateKey);
        
        // Create ComplianceData
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
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

    // ============ EIP-712 Signature Tests ============

    function test_IncWithEIP712Signature() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 100 (required for inc)
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 5,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key using EIP-712 format
        bytes memory signature = _createEIP712Signature(attestedData, teePrivateKey);
        
        // Create ComplianceData
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call inc() with valid EIP-712 compliance data
        vm.prank(user);
        counter.inc(encodedComplianceData);
        
        // Verify counter was incremented
        assertEq(counter.x(), 1, "Counter should be incremented to 1");
    }

    function test_IncByWithEIP712Signature() public {
        bytes32 key = counter.getOnlyUserWithScore30Selector();
        
        // Create ActualAttestedData with score 30 (required for incBy)
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 10,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with TEE private key using EIP-712 format
        bytes memory signature = _createEIP712Signature(attestedData, teePrivateKey);
        
        // Create ComplianceData
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call incBy() with valid EIP-712 compliance data
        vm.prank(user);
        counter.incBy(5, encodedComplianceData);
        
        // Verify counter was incremented
        assertEq(counter.x(), 5, "Counter should be incremented to 5");
    }

    function test_EIP712SignatureFailsWithWrongSigner() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 100
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 5,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Sign the data with user's private key instead of TEE (wrong signature)
        bytes memory signature = _createEIP712Signature(attestedData, userPrivateKey);
        
        // Create ComplianceData
        AssuraTypes.ComplianceData memory complianceData = AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: signature,
            actualAttestedData: attestedData
        });
        
        // Encode ComplianceData
        bytes memory encodedComplianceData = abi.encode(complianceData);
        
        // Call inc() should fail due to wrong signature
        vm.prank(user);
        vm.expectRevert("AssuraVerifier: Signature not from TEE");
        counter.inc(encodedComplianceData);
    }

    function test_BothEIP191AndEIP712Work() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 100
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 5,
            timeAtWhichAttested: block.timestamp,
            chainId: block.chainid
        });
        
        // Test EIP-191 signature
        bytes memory eip191Signature = _createEIP191Signature(attestedData, teePrivateKey);
        AssuraTypes.ComplianceData memory complianceData1 = AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: eip191Signature,
            actualAttestedData: attestedData
        });
        
        vm.prank(user);
        counter.inc(abi.encode(complianceData1));
        assertEq(counter.x(), 1, "EIP-191 signature should work");
        
        // Test EIP-712 signature
        bytes memory eip712Signature = _createEIP712Signature(attestedData, teePrivateKey);
        AssuraTypes.ComplianceData memory complianceData2 = AssuraTypes.ComplianceData({
            userAddress: user,
            key: key,
            signedAttestedDataWithTEESignature: eip712Signature,
            actualAttestedData: attestedData
        });
        
        vm.prank(user);
        counter.inc(abi.encode(complianceData2));
        assertEq(counter.x(), 2, "EIP-712 signature should work");
    }
}
