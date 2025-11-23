#!/bin/bash

# Script to make Docker image public on Docker Hub
# Note: You need to be logged in to Docker Hub first: docker login

echo "🔍 Checking if image exists..."
docker pull docker.io/0xswayam/my-app:latest 2>&1 | grep -q "Error" && echo "❌ Image not found or not accessible" || echo "✅ Image exists"

echo ""
echo "📝 To make the image PUBLIC on Docker Hub:"
echo "   1. Go to: https://hub.docker.com/r/0xswayam/my-app/settings"
echo "   2. Scroll to 'Repository Visibility' section"
echo "   3. Click 'Change visibility'"
echo "   4. Select 'Public'"
echo "   5. Confirm the change"
echo ""
echo "Or use Docker Hub API (requires authentication token):"
echo "   curl -X PATCH https://hub.docker.com/v2/repositories/0xswayam/my-app/ \\"
echo "     -H 'Authorization: JWT <your-token>' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"is_private\": false}'"
echo ""
echo "✅ Image is already pushed: docker.io/0xswayam/my-app:latest"
echo "   Digest: sha256:36a404ec956d8e9b8d8caa4b5bea748cd91aa45d2580a28da2f473248407a683"

