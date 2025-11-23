// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Counter} from "../Counter.sol";
import {AssuraVerifier} from "../assura/AssuraVerifier.sol";
import {IAssuraVerifier} from "../assura/IAssuraVerifier.sol";
import {AssuraTypes} from "../assura/types/AssuraTypes.sol";
import {Test} from "forge-std/Test.sol";

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
        assertEq(vData1.score, 100, "inc() should require score 100");
        
        AssuraTypes.VerifyingData memory vData2 = assuraVerifier.getVerifyingData(address(counter), incBySelector);
        assertEq(vData2.score, 30, "incBy() should require score 30");
    }

    function test_IncWithValidComplianceData() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 100 (required for inc)
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 100,
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
            score: 30,
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

    function test_IncFailsWithInsufficientScore() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 50 (less than required 100)
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 50,
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
        
        // Call inc() should fail due to insufficient score
        vm.prank(user);
        vm.expectRevert("AssuraVerifierLib: Compliance verification failed");
        counter.inc(encodedComplianceData);
    }

    function test_IncFailsWithWrongSignature() public {
        bytes32 key = counter.getOnlyUserWithScore100Selector();
        
        // Create ActualAttestedData with score 100
        AssuraTypes.AttestedData memory attestedData = AssuraTypes.AttestedData({
            score: 100,
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
            score: 100,
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
            score: 30,
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
            score: 100,
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
            score: 100,
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
            score: 30,
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
            score: 100,
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
            score: 100,
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
