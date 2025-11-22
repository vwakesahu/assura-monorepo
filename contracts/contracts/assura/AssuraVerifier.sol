// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract AssuraVerifier {
    struct VerifyingData {
        uint256 score;
        uint256 expiry;
        uint256 chainId;
    }

    struct ComplianceUser {
        address user;
        bytes32 key;
        bytes attestedData;
    }

    mapping(address appContractAddress => mapping(bytes32 key => VerifyingData))
        public verifyingData;

    constructor(address _owner, address _appContractAddress) {
        addres owner = _owner;
        require(_owner != address(0), "Owner cannot be 0");
        owner = _owner;
    }

    function setVerifyingData(
        address appContractAddress,
        bytes32 key,
        VerifyingData memory verifyingData
    ) public {
        require(msg.sender == appContractAddress, "Only owner can set verifying data");
        verifyingData[appContractAddress][key] = verifyingData;
    }

    function getVerifyingData(
        address appContractAddress,
        bytes32 key
    ) public view returns (VerifyingData memory) {
        return verifyingData[appContractAddress][key];
    }

    function verify(bytes32 key, bytes calldata attestedData) public view returns (bool) {
        address appContractAddress = msg.sender;
        return true;
    }

}
