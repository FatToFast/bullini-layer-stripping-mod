"""
Index DART corporate disclosure documents into Qdrant.
Reads from ~/projects/dart_rag/ directory structure.
Usage:
    python index_dart.py [--limit N] [--batch-size N]
"""

import os
import sys
import json
import glob
import argparse
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("dart-indexer")

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_INDEX = os.getenv("QDRANT_INDEX", "dart_filings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "jhgan/ko-sroberta-multitask")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "768"))
DART_RAG_DIR = os.getenv("DART_RAG_DIR", os.path.expanduser("~/projects/dart_rag"))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "512"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "64"))


def find_dart_files(base_dir: str, limit: int | None = None) -> list[dict]:
    """Find all text files in DART RAG directory with metadata."""
    files = []

    # Try manifest first
    manifest_path = os.path.join(base_dir, "manifest.jsonl")
    if os.path.exists(manifest_path):
        logger.info("Using manifest: %s", manifest_path)
        with open(manifest_path, "r", encoding="utf-8") as f:
            for line in f:
                entry = json.loads(line.strip())
                file_path = os.path.join(base_dir, entry.get("file", ""))
                if os.path.exists(file_path):
                    files.append(
                        {
                            "path": file_path,
                            "corp_name": entry.get("corp_name", ""),
                            "corp_code": entry.get("corp_code", ""),
                            "rcept_no": entry.get("rcept_no", ""),
                            "report_nm": entry.get("report_nm", ""),
                            "rcept_dt": entry.get("rcept_dt", ""),
                        }
                    )
                if limit and len(files) >= limit:
                    break
        return files

    # Fallback: walk directory
    logger.info("No manifest found, walking directory: %s", base_dir)
    for txt_file in sorted(
        glob.glob(os.path.join(base_dir, "**/*.txt"), recursive=True)
    ):
        parts = Path(txt_file).relative_to(base_dir).parts
        corp_name = parts[0] if len(parts) > 1 else ""
        files.append(
            {
                "path": txt_file,
                "corp_name": corp_name,
                "corp_code": "",
                "rcept_no": "",
                "report_nm": Path(txt_file).stem,
                "rcept_dt": "",
            }
        )
        if limit and len(files) >= limit:
            break

    return files


def chunk_text(
    text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP
) -> list[str]:
    """Split text into overlapping chunks by character count."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return [c for c in chunks if len(c.strip()) > 50]


def main():
    parser = argparse.ArgumentParser(description="Index DART documents into Qdrant")
    parser.add_argument(
        "--limit", type=int, default=None, help="Limit number of files to index"
    )
    parser.add_argument(
        "--batch-size", type=int, default=32, help="Embedding batch size"
    )
    parser.add_argument(
        "--recreate", action="store_true", help="Recreate index from scratch"
    )
    args = parser.parse_args()

    from haystack import Document
    from haystack.components.embedders import SentenceTransformersDocumentEmbedder
    from haystack_integrations.document_stores.qdrant import QdrantDocumentStore

    # Setup document store
    doc_store = QdrantDocumentStore(
        url=QDRANT_URL,
        index=QDRANT_INDEX,
        embedding_dim=EMBEDDING_DIM,
        recreate_index=args.recreate,
        wait_result_from_api=True,
    )

    # Setup embedder
    embedder = SentenceTransformersDocumentEmbedder(
        model=EMBEDDING_MODEL,
        batch_size=args.batch_size,
        device=None,  # auto
    )
    embedder.warm_up()

    # Find files
    dart_files = find_dart_files(DART_RAG_DIR, limit=args.limit)
    logger.info("Found %d files to index", len(dart_files))

    total_chunks = 0
    total_indexed = 0

    for i, file_info in enumerate(dart_files):
        try:
            with open(file_info["path"], "r", encoding="utf-8") as f:
                text = f.read()

            if len(text.strip()) < 100:
                continue

            chunks = chunk_text(text)
            total_chunks += len(chunks)

            docs = [
                Document(
                    content=chunk,
                    meta={
                        "corp_name": file_info["corp_name"],
                        "corp_code": file_info["corp_code"],
                        "rcept_no": file_info["rcept_no"],
                        "report_nm": file_info["report_nm"],
                        "rcept_dt": file_info["rcept_dt"],
                        "file_path": file_info["path"],
                        "chunk_index": ci,
                        "source": "DART",
                    },
                )
                for ci, chunk in enumerate(chunks)
            ]

            # Embed
            embedded = embedder.run(documents=docs)
            embedded_docs = embedded["documents"]

            # Write to Qdrant
            doc_store.write_documents(embedded_docs)
            total_indexed += len(embedded_docs)

            if (i + 1) % 10 == 0:
                logger.info(
                    "Progress: %d/%d files, %d chunks indexed",
                    i + 1,
                    len(dart_files),
                    total_indexed,
                )

        except Exception as e:
            logger.error("Error indexing %s: %s", file_info["path"], e)

    logger.info(
        "Indexing complete: %d files, %d chunks, %d indexed",
        len(dart_files),
        total_chunks,
        total_indexed,
    )


if __name__ == "__main__":
    main()
