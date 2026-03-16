"""
Haystack Hybrid Search Server
Web search + Qdrant RAG, served via FastAPI.
"""

import os
import logging
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from haystack import Pipeline, Document
from haystack.components.joiners import DocumentJoiner
from haystack.components.embedders import (
    SentenceTransformersTextEmbedder,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("haystack-search")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_INDEX = os.getenv("QDRANT_INDEX", "dart_filings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "jhgan/ko-sroberta-multitask")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "768"))
SERPER_API_KEY = os.getenv("SERPERDEV_API_KEY", "")
PORT = int(os.getenv("HAYSTACK_PORT", "7700"))


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class SearchRequest(BaseModel):
    query: str
    mode: str = "hybrid"  # "web" | "rag" | "hybrid"
    top_k: int = 8


class SearchFactItem(BaseModel):
    query: str
    title: str
    url: str
    snippet: str
    source: str
    publishedAt: Optional[str] = None


class SearchResponse(BaseModel):
    results: list[SearchFactItem]


# ---------------------------------------------------------------------------
# Pipeline builders
# ---------------------------------------------------------------------------
rag_pipeline: Optional[Pipeline] = None
web_pipeline: Optional[Pipeline] = None


def build_rag_pipeline() -> Optional[Pipeline]:
    """Build RAG pipeline with Qdrant retriever."""
    try:
        from haystack_integrations.document_stores.qdrant import QdrantDocumentStore
        from haystack_integrations.components.retrievers.qdrant import (
            QdrantEmbeddingRetriever,
        )

        doc_store = QdrantDocumentStore(
            url=QDRANT_URL,
            index=QDRANT_INDEX,
            embedding_dim=EMBEDDING_DIM,
            return_embedding=False,
            wait_result_from_api=True,
        )

        pipe = Pipeline()
        pipe.add_component(
            "text_embedder",
            SentenceTransformersTextEmbedder(
                model=EMBEDDING_MODEL,
                device=None,  # auto-detect
            ),
        )
        pipe.add_component(
            "retriever",
            QdrantEmbeddingRetriever(
                document_store=doc_store,
                top_k=10,
            ),
        )
        pipe.connect("text_embedder.embedding", "retriever.query_embedding")

        # Warm up embedder
        pipe.warm_up()
        logger.info(
            "RAG pipeline ready (Qdrant: %s, index: %s)", QDRANT_URL, QDRANT_INDEX
        )
        return pipe
    except Exception as e:
        logger.warning("RAG pipeline unavailable: %s", e)
        return None


def build_web_pipeline() -> Optional[Pipeline]:
    """Build web search pipeline."""
    if SERPER_API_KEY:
        try:
            from haystack.components.websearch import SerperDevWebSearch
            from haystack.utils import Secret

            pipe = Pipeline()
            pipe.add_component(
                "web_search",
                SerperDevWebSearch(
                    top_k=8,
                    api_key=Secret.from_token(SERPER_API_KEY),
                    search_params={"gl": "kr", "hl": "ko"},
                ),
            )
            logger.info("Web search pipeline ready (SerperDev)")
            return pipe
        except Exception as e:
            logger.warning("SerperDev unavailable: %s", e)
            return None
    else:
        logger.info("No SERPERDEV_API_KEY set — web search disabled")
        return None


# ---------------------------------------------------------------------------
# Result normalization
# ---------------------------------------------------------------------------
def doc_to_search_fact(doc: Document, query: str, source_label: str) -> SearchFactItem:
    """Convert Haystack Document to SearchFact-compatible item."""
    meta = doc.meta or {}
    return SearchFactItem(
        query=query,
        title=meta.get("title", meta.get("corp_name", query)),
        url=meta.get("url", meta.get("link", "")),
        snippet=(doc.content or "")[:500],
        source=source_label,
        publishedAt=meta.get("date", meta.get("rcept_dt", None)),
    )


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag_pipeline, web_pipeline
    rag_pipeline = build_rag_pipeline()
    web_pipeline = build_web_pipeline()
    yield
    logger.info("Shutting down")


app = FastAPI(title="Haystack Search Server", lifespan=lifespan)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "rag_available": rag_pipeline is not None,
        "web_available": web_pipeline is not None,
    }


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest):
    results: list[SearchFactItem] = []
    mode = req.mode.lower()

    if mode not in ("web", "rag", "hybrid"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode: {mode}. Use 'web', 'rag', or 'hybrid'.",
        )

    # --- Web search ---
    if mode in ("web", "hybrid") and web_pipeline:
        try:
            web_result = web_pipeline.run({"web_search": {"query": req.query}})
            web_docs = web_result.get("web_search", {}).get("documents", [])
            for doc in web_docs[: req.top_k]:
                results.append(doc_to_search_fact(doc, req.query, "Haystack Web"))
        except Exception as e:
            logger.error("Web search error: %s", e)

    # --- RAG search ---
    if mode in ("rag", "hybrid") and rag_pipeline:
        try:
            rag_result = rag_pipeline.run(
                {
                    "text_embedder": {"text": req.query},
                }
            )
            rag_docs = rag_result.get("retriever", {}).get("documents", [])
            for doc in rag_docs[: req.top_k]:
                results.append(doc_to_search_fact(doc, req.query, "Haystack RAG"))
        except Exception as e:
            logger.error("RAG search error: %s", e)

    # Deduplicate by URL
    seen_urls: set[str] = set()
    deduped: list[SearchFactItem] = []
    for item in results:
        if item.url and item.url in seen_urls:
            continue
        if item.url:
            seen_urls.add(item.url)
        deduped.append(item)

    return SearchResponse(results=deduped[: req.top_k])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
