// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IAssuraVerifier, VerifyingData} from "./IAssuraVerifier.sol";

struct ActualAttestedData {
    uint256 score;
    uint256 timeAtWhichAttested;
    uint256 chainId;
}

struct ComplianceData {
    address userAddress;
    bytes32 key;
    bytes signedAttestedDataWithSignature; // use ActualAttestedData struct to sign and decode onchain
    ActualAttestedData actualAttestedData;
}

contract AssuraVerifier is IAssuraVerifier {
    mapping(address appContractAddress => mapping(bytes32 key => VerifyingData))
        public verifyingData;

    address public owner;

    constructor(address _owner) {
        require(_owner != address(0), "Owner cannot be 0");
        owner = _owner;
    }

    function setVerifyingData(
        address appContractAddress,
        bytes32 key,
        VerifyingData memory data
    ) external override {
        require(msg.sender == appContractAddress, "Only app contract can set its verifying data");
        verifyingData[appContractAddress][key] = data;
    }

    function getVerifyingData(
        address appContractAddress,
        bytes32 key
    ) external view override returns (VerifyingData memory) {
        return verifyingData[appContractAddress][key];
    }

    function verify(
        address app,
        bytes32 key,
        bytes calldata attestedData
    ) external view override returns (bool) {
        VerifyingData memory vData = verifyingData[app][key];
        
        // Check expiry (0 means no expiry)
        if (vData.expiry != 0 && vData.expiry < block.timestamp) {
            return false;
        }
        
        // Check chainId (0 means any chain)
        if (vData.chainId != 0 && vData.chainId != block.chainid) {
            return false;
        }
        
        // Decode attestedData to get the score
        // Assuming attestedData is encoded ActualAttestedData struct
        require(attestedData.length >= 96, "Invalid attested data length");
        uint256 attestedScore;
        assembly {
            attestedScore := calldataload(add(attestedData.offset, 0))
        }
        
        // Check score requirement
        if (attestedScore < vData.score) {
            return false;
        }
        
        return true;
    }
}
