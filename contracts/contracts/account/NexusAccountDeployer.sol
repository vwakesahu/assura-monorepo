// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { NexusAccountFactory } from "bcnmy-nexus/contracts/factory/NexusAccountFactory.sol";
import { NexusBootstrap, BootstrapConfig, BootstrapPreValidationHookConfig, RegistryConfig } from "bcnmy-nexus/contracts/utils/NexusBootstrap.sol";
import { IERC7484 } from "bcnmy-nexus/contracts/interfaces/IERC7484.sol";

/**
 * @title NexusAccountDeployer
 * @notice Simplified contract to deploy Nexus accounts on Base Sepolia
 * @dev Pre-configured with Base Sepolia factory address and default salt
 */
contract NexusAccountDeployer {
    /// @notice Base Sepolia NexusAccountFactory address
    address public constant FACTORY = 0x1edaD1eb62B6c1BF8dd3071f25412ceE2aD559a6;

    /// @notice Base Sepolia NexusBootstrap address
    address public constant BOOTSTRAP = 0x819fcB032237d5FaC99Af23Df6B92e5caa1E0853;

    /// @notice Base Sepolia K1Validator address (not directly used, but needed for reference)
    address public constant K1_VALIDATOR = 0xe98dfff8E98C672C6C83485B76df953aa9e10e6c;

    /// @notice Base Sepolia MockRegistry address
    address public constant REGISTRY = 0xdFE9F41D6ECA9cDB5C5bFbBcf930172416286875;

    /// @notice Default salt for account creation (can be overridden)
    bytes32 public constant DEFAULT_SALT = keccak256("nexus-account-deployer-v1");

    /// @notice Mapping to track deployed accounts: owner => account address
    mapping(address => address) public deployedAccounts;

    /// @notice Event emitted when a new account is deployed
    event AccountDeployed(address indexed owner, address indexed account, bytes32 salt);

    /**
     * @notice Predicts the account address for a given owner
     * @param owner The address that will own the Nexus account
     * @return predictedAddress The predicted address of the account
     */
    function predictAccountAddress(address owner) external view returns (address predictedAddress) {
        return predictAccountAddressWithSalt(owner, DEFAULT_SALT);
    }

    /**
     * @notice Predicts the account address for a given owner and salt
     * @param owner The address that will own the Nexus account
     * @param salt The salt to use for deployment
     * @return predictedAddress The predicted address of the account
     */
    function predictAccountAddressWithSalt(
        address owner,
        bytes32 salt
    ) public view returns (address predictedAddress) {
        bytes memory initData = _buildInitData(owner);
        return NexusAccountFactory(FACTORY).computeAccountAddress(initData, salt);
    }

    /**
     * @notice Deploys a Nexus account for the given owner
     * @param owner The address that will own the Nexus account
     * @return account The address of the deployed account
     */
    function deployAccount(address owner) external returns (address payable account) {
        return deployAccountWithSalt(owner, DEFAULT_SALT);
    }

    /**
     * @notice Deploys a Nexus account for the given owner with a custom salt
     * @param owner The address that will own the Nexus account
     * @param salt The salt to use for deployment
     * @return account The address of the deployed account
     */
    function deployAccountWithSalt(
        address owner,
        bytes32 salt
    ) public returns (address payable account) {
        require(owner != address(0), "Owner cannot be zero address");
        require(deployedAccounts[owner] == address(0), "Account already deployed for this owner");

        bytes memory initData = _buildInitData(owner);

        // Deploy the account via factory
        account = NexusAccountFactory(FACTORY).createAccount(initData, salt);

        // Store the deployed account
        deployedAccounts[owner] = account;

        emit AccountDeployed(owner, account, salt);

        return account;
    }

    /**
     * @notice Gets the deployed account address for an owner
     * @param owner The owner address
     * @return account The deployed account address, or address(0) if not deployed
     */
    function getDeployedAccount(address owner) external view returns (address account) {
        return deployedAccounts[owner];
    }

    /**
     * @notice Builds the initialization data for a Nexus account
     * @param owner The owner address
     * @return initData The encoded initialization data
     */
    function _buildInitData(address owner) internal pure returns (bytes memory initData) {
        // Prepare empty module configurations
        BootstrapConfig[] memory validators = new BootstrapConfig[](0);
        BootstrapConfig[] memory executors = new BootstrapConfig[](0);
        BootstrapConfig memory hook = BootstrapConfig({
            module: address(0),
            data: ""
        });
        BootstrapConfig[] memory fallbacks = new BootstrapConfig[](0);

        // Prepare registry configuration
        address[] memory attesters = new address[](1);
        attesters[0] = owner;

        RegistryConfig memory registryConfig = RegistryConfig({
            registry: IERC7484(REGISTRY),
            attesters: attesters,
            threshold: 1
        });

        // Encode the bootstrap initialization call
        bytes memory initCall = abi.encodeWithSelector(
            NexusBootstrap.initNexusWithDefaultValidatorAndOtherModules.selector,
            abi.encodePacked(owner), // defaultValidatorInitData
            validators,
            executors,
            hook,
            fallbacks,
            new BootstrapPreValidationHookConfig[](0),
            registryConfig
        );

        // Encode the full init data (bootstrap address + call)
        initData = abi.encode(BOOTSTRAP, initCall);

        return initData;
    }
}
