#!/bin/sh
# Start upstream API in background on port 4000
PORT=4000 node apps/upstream/dist/index.js &

# Wait for upstream to be ready
sleep 1

# Start gateway on Railway's PORT (defaults to 3000)
export UPSTREAM_URL="http://localhost:4000"
export PORT="${PORT:-3000}"
node apps/gateway/dist/index.js
