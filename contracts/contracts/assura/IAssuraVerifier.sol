// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AssuraTypes} from "./types/AssuraTypes.sol";

/**
 * @title IAssuraVerifier
 * @notice Interface for Assura compliance verification system
 */
interface IAssuraVerifier {
    /**
     * @notice Set verification requirements for an app contract
     * @param app The app contract address
     * @param key The verification key identifier
     * @param verifyingData The verification requirements
     */
    function setVerifyingData(
        address app,
        bytes32 key,
        AssuraTypes.VerifyingData memory verifyingData
    ) external;

    /**
     * @notice Get verification requirements for an app contract
     * @param app The app contract address
     * @param key The verification key identifier
     * @return verifyingData The verification requirements
     */
    function getVerifyingData(
        address app,
        bytes32 key
    ) external view returns (AssuraTypes.VerifyingData memory);

    /**
     * @notice Verify compliance data against requirements
     * @param app The app contract address
     * @param key The verification key identifier
     * @param attestedComplianceData The encoded compliance data to verify
     * @return isValid True if the compliance data meets all requirements
     */
    function verify(
        address app,
        bytes32 key,
        bytes calldata attestedComplianceData
    ) external view returns (bool);

    /**
     * @notice Verify compliance with automatic bypass entry creation
     * @param app The app contract address
     * @param key The verification key identifier
     * @param attestedComplianceData The encoded compliance data to verify
     * @return isValid True if the compliance data meets all requirements or bypass is valid
     */
    function verifyWithBypass(
        address app,
        bytes32 key,
        bytes calldata attestedComplianceData
    ) external returns (bool);
}