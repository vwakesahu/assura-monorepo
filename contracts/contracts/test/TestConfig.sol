// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";

/**
 * @title TestConfig
 * @notice Test-only configuration helper for chain IDs and contract addresses
 * @dev This library is ONLY for testing purposes and should never be used in production contracts
 */
library TestConfig {
    /// @notice Chain ID constants for different networks
    uint256 public constant CHAIN_ID_LOCAL = 31337; // Anvil default
    uint256 public constant CHAIN_ID_SEPOLIA = 11155111;
    uint256 public constant CHAIN_ID_BASE_SEPOLIA = 84532;
    uint256 public constant CHAIN_ID_BASE_MAINNET = 8453;
    uint256 public constant CHAIN_ID_MAINNET = 1;

    /// @notice Network enum for easy identification
    enum Network {
        LOCAL,
        SEPOLIA,
        BASE_SEPOLIA,
        BASE_MAINNET,
        MAINNET,
        UNKNOWN
    }

    /**
     * @notice Get the current network based on chain ID
     * @return network The current network enum
     */
    function getCurrentNetwork() internal view returns (Network) {
        uint256 chainId = block.chainid;
        
        if (chainId == CHAIN_ID_LOCAL) return Network.LOCAL;
        if (chainId == CHAIN_ID_SEPOLIA) return Network.SEPOLIA;
        if (chainId == CHAIN_ID_BASE_SEPOLIA) return Network.BASE_SEPOLIA;
        if (chainId == CHAIN_ID_BASE_MAINNET) return Network.BASE_MAINNET;
        if (chainId == CHAIN_ID_MAINNET) return Network.MAINNET;
        
        return Network.UNKNOWN;
    }

    /**
     * @notice Check if currently running on a fork
     * @return isFork True if running on a fork (not local Anvil)
     */
    function isFork() internal view returns (bool) {
        return block.chainid != CHAIN_ID_LOCAL;
    }

    /**
     * @notice Check if currently running on actual network (not fork, not local)
     * @return isActualNetwork True if running on actual network
     */
    function isActualNetwork() internal view returns (bool) {
        uint256 chainId = block.chainid;
        return chainId != CHAIN_ID_LOCAL && 
               (chainId == CHAIN_ID_SEPOLIA || 
                chainId == CHAIN_ID_BASE_SEPOLIA || 
                chainId == CHAIN_ID_BASE_MAINNET || 
                chainId == CHAIN_ID_MAINNET);
    }

    /**
     * @notice Check if currently running on Base Sepolia
     * @return isBaseSepolia True if running on Base Sepolia
     */
    function isBaseSepolia() internal view returns (bool) {
        return block.chainid == CHAIN_ID_BASE_SEPOLIA;
    }

    /**
     * @notice Check if currently running on Sepolia
     * @return isSepolia True if running on Sepolia
     */
    function isSepolia() internal view returns (bool) {
        return block.chainid == CHAIN_ID_SEPOLIA;
    }

    /**
     * @notice Get chain ID for a specific network
     * @param network The network enum
     * @return chainId The chain ID for the network
     */
    function getChainId(Network network) internal pure returns (uint256) {
        if (network == Network.LOCAL) return CHAIN_ID_LOCAL;
        if (network == Network.SEPOLIA) return CHAIN_ID_SEPOLIA;
        if (network == Network.BASE_SEPOLIA) return CHAIN_ID_BASE_SEPOLIA;
        if (network == Network.BASE_MAINNET) return CHAIN_ID_BASE_MAINNET;
        if (network == Network.MAINNET) return CHAIN_ID_MAINNET;
        
        revert("TestConfig: Unknown network");
    }

    /**
     * @notice Get RPC URL for a specific network (for reference in tests)
     * @param network The network enum
     * @return rpcUrl The RPC URL string (for documentation purposes)
     */
    function getRpcUrl(Network network) internal pure returns (string memory) {
        if (network == Network.SEPOLIA) return "https://sepolia.infura.io/v3/YOUR_KEY";
        if (network == Network.BASE_SEPOLIA) return "https://sepolia.base.org";
        if (network == Network.BASE_MAINNET) return "https://mainnet.base.org";
        if (network == Network.MAINNET) return "https://mainnet.infura.io/v3/YOUR_KEY";
        
        return "http://localhost:8545";
    }
}

/**
 * @title TestAddresses
 * @notice Test-only contract address mappings for different networks
 * @dev This contract is ONLY for testing purposes
 */
contract TestAddresses {
    using TestConfig for TestConfig.Network;

    /// @notice Mapping from network to contract addresses
    mapping(TestConfig.Network => mapping(string => address)) private addresses;

    /// @notice Emitted when an address is set
    event AddressSet(TestConfig.Network network, string name, address addr);

    /**
     * @notice Set an address for a specific network
     * @param network The network enum
     * @param name The name/identifier of the contract
     * @param addr The contract address
     */
    function setAddress(
        TestConfig.Network network,
        string memory name,
        address addr
    ) internal {
        addresses[network][name] = addr;
        emit AddressSet(network, name, addr);
    }

    /**
     * @notice Get an address for the current network
     * @param name The name/identifier of the contract
     * @return addr The contract address, or address(0) if not set
     */
    function getAddress(string memory name) internal view returns (address) {
        TestConfig.Network network = TestConfig.getCurrentNetwork();
        return addresses[network][name];
    }

    /**
     * @notice Get an address for a specific network
     * @param network The network enum
     * @param name The name/identifier of the contract
     * @return addr The contract address, or address(0) if not set
     */
    function getAddress(
        TestConfig.Network network,
        string memory name
    ) internal view returns (address) {
        return addresses[network][name];
    }

    /**
     * @notice Check if an address is set for the current network
     * @param name The name/identifier of the contract
     * @return isSet True if address is set
     */
    function hasAddress(string memory name) internal view returns (bool) {
        return getAddress(name) != address(0);
    }
}

/**
 * @title TestHelper
 * @notice Comprehensive test helper that combines TestConfig and TestAddresses
 * @dev This contract is ONLY for testing purposes
 */
contract TestHelper is Test, TestAddresses {
    using TestConfig for TestConfig.Network;

    /// @notice Current network being used
    TestConfig.Network public currentNetwork;

    /**
     * @notice Initialize the test helper
     */
    function _initializeTestHelper() internal {
        currentNetwork = TestConfig.getCurrentNetwork();
    }

    /**
     * @notice Get the current chain ID
     * @return chainId The current chain ID
     */
    function getCurrentChainId() internal view returns (uint256) {
        return block.chainid;
    }

    /**
     * @notice Setup addresses for a specific network
     * @param network The network enum
     * @param names Array of contract names
     * @param addrs Array of corresponding addresses
     */
    function setupNetworkAddresses(
        TestConfig.Network network,
        string[] memory names,
        address[] memory addrs
    ) internal {
        require(
            names.length == addrs.length,
            "TestHelper: Names and addresses length mismatch"
        );
        
        for (uint256 i = 0; i < names.length; i++) {
            setAddress(network, names[i], addrs[i]);
        }
    }

    /**
     * @notice Setup addresses for the current network
     * @param names Array of contract names
     * @param addrs Array of corresponding addresses
     */
    function setupCurrentNetworkAddresses(
        string[] memory names,
        address[] memory addrs
    ) internal {
        setupNetworkAddresses(currentNetwork, names, addrs);
    }

    /**
     * @notice Get a formatted network name for logging
     * @return networkName The network name as a string
     */
    function getNetworkName() internal view returns (string memory) {
        if (currentNetwork == TestConfig.Network.LOCAL) return "Local (Anvil)";
        if (currentNetwork == TestConfig.Network.SEPOLIA) return "Sepolia";
        if (currentNetwork == TestConfig.Network.BASE_SEPOLIA) return "Base Sepolia";
        if (currentNetwork == TestConfig.Network.BASE_MAINNET) return "Base Mainnet";
        if (currentNetwork == TestConfig.Network.MAINNET) return "Mainnet";
        
        return "Unknown";
    }

    /**
     * @notice Log current network information (useful for debugging)
     */
    function logNetworkInfo() internal view {
        console.log("=== Network Information ===");
        console.log("Network:", getNetworkName());
        console.log("Chain ID:", getCurrentChainId());
        console.log("Is Fork:", TestConfig.isFork());
        console.log("========================");
    }
}

