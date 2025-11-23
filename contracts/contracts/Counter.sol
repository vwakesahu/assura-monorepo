// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IAssuraVerifier} from "./assura/IAssuraVerifier.sol";
import {AssuraTypes} from "./assura/types/AssuraTypes.sol";
import {AssuraVerifierLib} from "./assura/libraries/AssuraVerifierLib.sol";

contract Counter {
    IAssuraVerifier public assuraVerifier;
    uint public x;

    event Increment(uint by);

    function onlyUserWithScore100() public pure returns (AssuraTypes.VerifyingData memory) {
        return AssuraTypes.VerifyingData({score: 100, expiry: 0, chainId: 0});
    }

    function onlyUserWithScore30() public pure returns (AssuraTypes.VerifyingData memory) {
        return AssuraTypes.VerifyingData({score: 30, expiry: 0, chainId: 0});
    }

    function getOnlyUserWithScore100Selector() public pure returns (bytes32) {
        return bytes32(bytes4(keccak256("onlyUserWithScore100()")));
    }

    function getOnlyUserWithScore30Selector() public pure returns (bytes32) {
        return bytes32(bytes4(keccak256("onlyUserWithScore30()")));
    }

    constructor(address _assuraVerifier) {
        require(_assuraVerifier != address(0), "AssuraVerifier address cannot be zero");
        assuraVerifier = IAssuraVerifier(_assuraVerifier);
        
        // Set verifying data for this contract's functions
        assuraVerifier.setVerifyingData(
            address(this),
            getOnlyUserWithScore100Selector(),
            onlyUserWithScore100()
        );
        
        assuraVerifier.setVerifyingData(
            address(this),
            getOnlyUserWithScore30Selector(),
            onlyUserWithScore30()
        );
    }

    modifier onlyComplianceUser(bytes32 key, bytes calldata attestedData) {
        AssuraVerifierLib.requireCompliance(assuraVerifier, address(this), key, attestedData);
        _;
    }

    function inc(
        bytes calldata attestedData
    ) public onlyComplianceUser(getOnlyUserWithScore100Selector(), attestedData) {
        x++;
        emit Increment(1);
    }

    function incBy(
        uint by,
        bytes calldata attestedData
    ) public onlyComplianceUser(getOnlyUserWithScore30Selector(), attestedData) {
        require(by > 0, "incBy: increment should be positive");
        x += by;
        emit Increment(by);
    }
}
