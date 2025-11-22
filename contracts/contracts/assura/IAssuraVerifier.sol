// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

struct VerifyingData {
    uint256 score;
    uint256 expiry;
    uint256 chainId;
}
interface IAssuraVerifier {

    function setVerifyingData(address app, bytes32 key, VerifyingData memory verifyingData) external;

    function getVerifyingData(address app, bytes32 key) external view returns (VerifyingData memory);

    function verify(address app, bytes32 key, bytes calldata attestedData) external view returns (bool);
}