# Haystack Search Server

Hybrid search server combining web search and RAG (Retrieval-Augmented Generation) using Haystack framework with Korean support.

## Features

- **Hybrid Search**: Combines web search and RAG search capabilities
- **Web Search**: Supports both SerperDev API (with API key) and DuckDuckGo (fallback)
- **RAG Search**: Indexes and searches Korean corporate documents from DART
- **FastAPI**: RESTful API with automatic documentation
- **Multi-language**: Optimized for Korean language processing

## Installation

### Prerequisites

- Python 3.10 or higher
- [Qdrant](https://qdrant.tech/) vector database running on `localhost:6333`
- (Optional) [Serper.dev API key](https://serper.dev/) for enhanced web search

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd haystack-search-server
```

2. Create and activate virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Configuration

### Environment Variables

Copy `.env.production.example` to `.env` and customize:

```bash
cp .env.production.example .env
```

Key configuration options:

- `HAYSTACK_PORT`: Server port (default: 7700)
- `QDRANT_URL`: Qdrant server URL
- `QDRANT_INDEX`: Qdrant collection name
- `EMBEDDING_MODEL`: Korean sentence transformer model
- `SERPERDEV_API_KEY`: Optional Serper.dev API key
- `DART_RAG_DIR`: Directory containing DART documents
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)

## Running the Server

### Development Server

Start the server with auto-reload:

```bash
source .venv/bin/activate
python server.py
```

The server will start on `http://localhost:7700`

### Production Deployment

For production deployment:

1. Set environment variables in `.env`:
```bash
export HAYSTACK_PORT=7700
export LOG_LEVEL=INFO
export SERPERDEV_API_KEY=your-api-key
```

2. Start the server:
```bash
source .venv/bin/activate
gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:7700
```

## API Documentation

### Health Check

Check if the server is running:

```bash
curl http://localhost:7700/health
```

Response:
```json
{
  "status": "ok",
  "rag_available": true,
  "web_available": true
}
```

### Search

Perform hybrid, web-only, or RAG-only search:

```bash
curl -X POST http://localhost:7701/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "삼성전자 실적",
    "mode": "hybrid",
    "top_k": 5
  }'
```

#### Request Parameters

- `query` (required): Search query string
- `mode` (optional): "hybrid", "web", or "rag" (default: "hybrid")
- `top_k` (optional): Maximum number of results (default: 8)

#### Modes

1. **hybrid**: Combines web search and RAG results
2. **web**: Web search only (uses DuckDuckGo or SerperDev)
3. **rag**: RAG search only (requires indexed documents)

#### Response Format

```json
{
  "results": [
    {
      "query": "search query",
      "title": "Result title",
      "url": "https://example.com",
      "snippet": "Content preview...",
      "source": "Haystack Web" or "Haystack RAG",
      "publishedAt": "2024-01-01"
    }
  ]
}
```

## Indexing Documents

To index DART corporate documents:

1. Prepare documents in `~/projects/dart_rag/` directory
2. Run the indexer:
```bash
source .venv/bin/activate
python index_dart.py --limit 100 --batch-size 32
```

### Indexing Options

- `--limit`: Maximum number of files to index
- `--batch-size`: Embedding batch size (default: 32)
- `--recreate`: Delete and recreate the index

## Monitoring

The server provides health check endpoints and logs at INFO level:

- Health status endpoint: `/health`
- Component availability: `rag_available`, `web_available`
- Startup/shutdown logs

## Troubleshooting

### Common Issues

1. **Port already in use**:
   - Change `HAYSTACK_PORT` in environment
   - Kill existing process: `lsof -ti:7700 | xargs kill -9`

2. **Qdrant connection failed**:
   - Ensure Qdrant is running on `localhost:6333`
   - Check network connectivity

3. **Web search fails**:
   - DuckDuckGo should work without API key
   - For better results, get Serper.dev API key

4. **Memory issues with large documents**:
   - Reduce `CHUNK_SIZE` and `CHUNK_OVERLAP` in environment
   - Process documents in smaller batches

## Development

### Adding New Features

1. Add new pipeline components in `server.py`
2. Update request/response models
3. Add appropriate error handling

### Testing

```bash
# Test server startup
curl http://localhost:7700/health

# Test search functionality
curl -X POST http://localhost:7700/search -H "Content-Type: application/json" -d '{"query": "test"}'

# Test web search mode
curl -X POST http://localhost:7700/search -H "Content-Type: application/json" -d '{"query": "test", "mode": "web"}'

# Test RAG mode
curl -X POST http://localhost:7700/search -H "Content-Type: application/json" -d '{"query": "test", "mode": "rag"}'
```

## License

This project is open source and available under the MIT License.
