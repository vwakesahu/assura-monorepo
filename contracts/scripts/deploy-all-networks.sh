#!/bin/bash

# Multichain deployment script
# Deploys AssuraVerifier to both Sepolia and Base Sepolia networks
#
# Usage:
#   OWNER_ADDRESS=0x... TEE_ADDRESS=0x... ./scripts/deploy-all-networks.sh

set -e

echo "Starting multichain deployment..."
echo ""

# Check required environment variables
if [ -z "$OWNER_ADDRESS" ] || [ -z "$TEE_ADDRESS" ]; then
    echo "Error: Please set OWNER_ADDRESS and TEE_ADDRESS environment variables"
    echo ""
    echo "Example:"
    echo "  OWNER_ADDRESS=0x123... TEE_ADDRESS=0x456... ./scripts/deploy-all-networks.sh"
    exit 1
fi

echo "Configuration:"
echo "  Owner Address: $OWNER_ADDRESS"
echo "  TEE Address: $TEE_ADDRESS"
echo ""

# Deploy to Sepolia
echo "=== Deploying to Sepolia ==="
npx hardhat ignition deploy ignition/modules/AssuraVerifier.ts \
  --network sepolia \
  --parameters '{"AssuraVerifierModule":{"owner":"'$OWNER_ADDRESS'","teeAddress":"'$TEE_ADDRESS'"}}'

echo ""
echo "=== Deploying to Base Sepolia ==="
npx hardhat ignition deploy ignition/modules/AssuraVerifier.ts \
  --network baseSepolia \
  --parameters '{"AssuraVerifierModule":{"owner":"'$OWNER_ADDRESS'","teeAddress":"'$TEE_ADDRESS'"}}'

echo ""
echo "=== Deployment Complete ==="

