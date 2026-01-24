#!/bin/bash
set -e

echo "=== LiveCalc Cloud Worker - Build and Test ==="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Build Docker image
echo "Building Docker image..."
docker build -f Dockerfile.worker -t livecalc-worker:test . || {
  echo -e "${RED}✗ Docker build failed${NC}"
  exit 1
}
echo -e "${GREEN}✓ Docker build successful${NC}"

# Start container
echo "Starting container..."
CONTAINER_ID=$(docker run -d -p 3000:3000 --memory=4g --cpus=2 livecalc-worker:test)
echo "Container ID: $CONTAINER_ID"

# Wait for container to be healthy
echo "Waiting for container to be ready..."
sleep 5

# Test health endpoint
echo "Testing /health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
  echo -e "${GREEN}✓ Health check passed${NC}"
else
  echo -e "${RED}✗ Health check failed${NC}"
  echo "Response: $HEALTH_RESPONSE"
  docker logs "$CONTAINER_ID"
  docker stop "$CONTAINER_ID"
  docker rm "$CONTAINER_ID"
  exit 1
fi

# Test capabilities endpoint
echo "Testing /capabilities endpoint..."
CAPABILITIES_RESPONSE=$(curl -s http://localhost:3000/capabilities)
if echo "$CAPABILITIES_RESPONSE" | grep -q "sharedArrayBuffer.*true"; then
  echo -e "${GREEN}✓ SharedArrayBuffer available${NC}"
else
  echo -e "${RED}✗ SharedArrayBuffer not available${NC}"
  echo "Response: $CAPABILITIES_RESPONSE"
fi

if echo "$CAPABILITIES_RESPONSE" | grep -q "atomics.*true"; then
  echo -e "${GREEN}✓ Atomics available${NC}"
else
  echo -e "${RED}✗ Atomics not available${NC}"
fi

if echo "$CAPABILITIES_RESPONSE" | grep -q "simd128.*true"; then
  echo -e "${GREEN}✓ SIMD128 enabled${NC}"
else
  echo -e "${RED}✗ SIMD128 not enabled${NC}"
fi

# Display full capabilities
echo ""
echo "Full capabilities response:"
echo "$CAPABILITIES_RESPONSE" | jq '.' || echo "$CAPABILITIES_RESPONSE"

# Cleanup
echo ""
echo "Stopping and removing container..."
docker stop "$CONTAINER_ID"
docker rm "$CONTAINER_ID"

echo -e "${GREEN}=== All tests passed ===${NC}"
