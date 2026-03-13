#!/bin/bash
# Script to launch Artillery load tests
# Usage: ./scripts/load-test.sh

SERVER="http://localhost:3001"
EMAIL="$(head -c 10 /dev/random | md5sum | cut -d' ' -f1)@loadtest.com"
PASSWORD="Password1234!"

echo "=== Load Test — Music Room API ==="
echo ""

# Verify the server is running
if ! curl -s "$SERVER/health" > /dev/null 2>&1; then
  echo "Error: server is not running on $SERVER"
  echo "Run 'make dev' in another terminal first."
  exit 1
fi
echo "Server OK on $SERVER"

# Try to login with the test account
echo "Logging in with test account..."
RESPONSE=$(curl -s -X POST "$SERVER/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log(r.data?.accessToken||'')})")

# If login fails, create the account
if [ -z "$TOKEN" ]; then
  echo "Account does not exist, creating..."
  RESPONSE=$(curl -s -X POST "$SERVER/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Load Tester\"}")

  TOKEN=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log(r.data?.accessToken||'')})")
fi

if [ -z "$TOKEN" ]; then
  echo "Error: could not retrieve token"
  echo "Response: $RESPONSE"
  exit 1
fi
echo "Token OK"
echo ""

# Launch Artillery
echo "Running Artillery (~1 minute)..."
echo "---"
AUTH_TOKEN="$TOKEN" npx artillery run artillery.yml
