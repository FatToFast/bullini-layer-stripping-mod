#!/bin/bash

# Haystack Search Server Deployment Script

set -e

echo "🚀 Starting Haystack Search Server deployment..."

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment
echo "✅ Activating virtual environment..."
source .venv/bin/activate

# Install dependencies
echo "📚 Installing dependencies..."
pip install -r requirements.txt

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env from .env.production.example..."
    cp .env.production.example .env
    echo "⚠️  Please edit .env file with your configuration before starting the server"
fi

# Check if Qdrant is running
echo "🔍 Checking Qdrant connection..."
if ! curl -s http://localhost:6333/ >/dev/null 2>&1; then
    echo "❌ Qdrant is not running on localhost:6333"
    echo "Please start Qdrant before deploying:"
    echo "  docker run -p 6333:6333 qdrant/qdrant"
    exit 1
fi
echo "✅ Qdrant is running"

# Kill existing server process if running
echo "🔄 Checking for existing server process..."
if lsof -ti:7700 >/dev/null 2>&1; then
    echo "⏹️  Stopping existing server..."
    lsof -ti:7700 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Start server in background
echo "🚀 Starting server..."
export HAYSTACK_PORT=7700
export LOG_LEVEL=INFO
python server.py &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Check if server is running
if curl -s http://localhost:7700/health >/dev/null 2>&1; then
    echo "✅ Server is running successfully!"
    echo "📊 Health check:"
    curl -s http://localhost:7700/health | jq .
    
    echo ""
    echo "🌐 API endpoints:"
    echo "  Health: http://localhost:7700/health"
    echo "  Docs:   http://localhost:7700/docs"
    echo ""
    echo "🔍 Test search:"
    curl -s -X POST http://localhost:7700/search \
      -H "Content-Type: application/json" \
      -d '{"query": "테스트", "mode": "web", "top_k": 3}' | jq '.results[0]'
    
    echo ""
    echo "📋 To stop the server: kill $SERVER_PID"
else
    echo "❌ Server failed to start"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi
