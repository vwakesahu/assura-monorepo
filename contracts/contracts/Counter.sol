// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IAssuraVerifier, VerifyingData} from "./assura/IAssuraVerifier.sol";

contract Counter {
    IAssuraVerifier public assuraVerifier;
    uint public x;

    event Increment(uint by);

    function onlyUserWithScore100() public pure returns (VerifyingData memory) {
        return VerifyingData({score: 100, expiry: 0, chainId: 0});
    }

    function onlyUserWithScore30() public pure returns (VerifyingData memory) {
        return VerifyingData({score: 30, expiry: 0, chainId: 0});
    }

    function _getIncSelector() internal pure returns (bytes32) {
        return bytes32(this.inc.selector);
    }

    function _getIncBySelector() internal pure returns (bytes32) {
        return bytes32(this.incBy.selector);
    }

    constructor(address _assuraVerifier) {
        require(_assuraVerifier != address(0), "AssuraVerifier address cannot be zero");
        assuraVerifier = IAssuraVerifier(_assuraVerifier);
        
        // Set verifying data for this contract's functions
        assuraVerifier.setVerifyingData(
            address(this),
            _getIncSelector(),
            onlyUserWithScore100()
        );
        
        assuraVerifier.setVerifyingData(
            address(this),
            _getIncBySelector(),
            onlyUserWithScore30()
        );
    }

    modifier onlyComplianceUser(bytes32 key, bytes calldata attestedData) {
        require(
            assuraVerifier.verify(address(this), key, attestedData),
            "Not a compliance user"
        );
        _;
    }

    function inc(
        bytes calldata attestedData
    ) public onlyComplianceUser(bytes32(this.inc.selector), attestedData) {
        x++;
        emit Increment(1);
    }

    function incBy(
        uint by,
        bytes calldata attestedData
    ) public onlyComplianceUser(bytes32(this.incBy.selector), attestedData) {
        require(by > 0, "incBy: increment should be positive");
        x += by;
        emit Increment(by);
    }
}
