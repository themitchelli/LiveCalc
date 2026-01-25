#!/bin/bash
# Test script for Cloud API

set -e

echo "=== LiveCalc Cloud API Test ==="
echo

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Check dependencies
echo "Checking dependencies..."
command -v python3 >/dev/null 2>&1 || { echo "Python 3 required"; exit 1; }
command -v redis-cli >/dev/null 2>&1 || { echo "redis-cli required for testing"; exit 1; }

# Test Redis connection
echo "Testing Redis connection..."
if redis-cli -u "$REDIS_URL" ping | grep -q PONG; then
    echo -e "${GREEN}✓ Redis is running${NC}"
else
    echo -e "${RED}✗ Redis is not accessible${NC}"
    echo "  Start Redis: docker run -d -p 6379:6379 redis:7-alpine"
    exit 1
fi

# Install Python dependencies
echo
echo "Installing Python dependencies..."
cd "$(dirname "$0")/../api"
pip install -q -r requirements.txt
pip install -q pytest pytest-asyncio httpx

# Run tests
echo
echo "Running API tests..."
if pytest tests/ -v; then
    echo -e "${GREEN}✓ All tests passed${NC}"
else
    echo -e "${RED}✗ Tests failed${NC}"
    exit 1
fi

# Start API in background
echo
echo "Starting API server..."
STORAGE_ROOT=/tmp/livecalc-packages \
REDIS_URL="$REDIS_URL" \
uvicorn main:app --host 0.0.0.0 --port 8000 --log-level warning &
API_PID=$!

# Wait for API to be ready
echo "Waiting for API to be ready..."
for i in {1..30}; do
    if curl -s "$API_URL/health" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Test health endpoint
echo
echo "Testing health endpoint..."
HEALTH=$(curl -s "$API_URL/health")
if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "  Response: $HEALTH"
else
    echo -e "${RED}✗ Health check failed${NC}"
    kill $API_PID
    exit 1
fi

# Test root endpoint
echo
echo "Testing root endpoint..."
ROOT=$(curl -s "$API_URL/")
if echo "$ROOT" | grep -q "LiveCalc Cloud API"; then
    echo -e "${GREEN}✓ Root endpoint passed${NC}"
else
    echo -e "${RED}✗ Root endpoint failed${NC}"
    kill $API_PID
    exit 1
fi

# Test unauthorized access
echo
echo "Testing unauthorized access..."
RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "$API_URL/v1/jobs/submit")
if [ "$RESPONSE" = "401" ]; then
    echo -e "${GREEN}✓ Authentication required${NC}"
else
    echo -e "${RED}✗ Expected 401, got $RESPONSE${NC}"
    kill $API_PID
    exit 1
fi

# Cleanup
echo
echo "Cleaning up..."
kill $API_PID 2>/dev/null || true
redis-cli -u "$REDIS_URL" FLUSHDB >/dev/null

echo
echo -e "${GREEN}=== All API tests passed ===${NC}"
echo
echo "API is ready for integration with cloud workers"
echo "Next: Implement US-BRIDGE-04 (Cloud Pipeline Reconstruction)"
