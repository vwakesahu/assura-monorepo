// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;
import {AssuraVerifier, VerifyingData} from "./assura/AssuraVerifier.sol";
contract Counter is AssuraVerifierLib {
    uint256 counterForKey;

    function onlyUserWithScore100() public pure returns (VerifyingData calldata) {
        return VerifyingData({score: 100, expiry: 0, chainId: 0});
    }

    function onlyUserWithScore30() public pure returns (VerifyingData calldata) {
        return VerifyingData({score: 30, expiry: 0, chainId: 0});
    }


    constructor() {
        assuraVerifier = AssuraVerifier(_assuraVerifier);
        AssuraInterface assuraInterface = AssuraInterface(_assuraVerifier);
        VerifyingData memory verifyingData = assuraInterface.setVerifyingData(onlyUserWithScore100.selector,onlyUserWithScore100());
        VerifyingData memory verifyingData = assuraInterface.setVerifyingData(onlyUserWithScore30.selector,onlyUserWithScore30());
    }

    modifier onlyComplianceUser(bytes32 key, bytes calldata attestedData) {
      require(assuraVerifier.verify(key, attestedData), "Not a compliance user");
      _;
    }
    uint public x;

    event Increment(uint by);

    function inc(
        bytes32 key,
        bytes calldata attestedData
    ) public onlyComplianceUser(onlyUserWithScore100.selector, attestedData) {
        x++;
        emit Increment(1);
    }

    function incBy(uint by, bytes calldata attestedData) public onlyComplianceUser(onlyUserWithScore30.selector, attestedData) {
        require(by > 0, "incBy: increment should be positive");
        x += by;
        emit Increment(by);
    }
}
