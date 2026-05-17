"""
ingestion.py — Document ingestion module for TrustNode
=======================================================
Responsibilities:
  1. Extract and chunk text from corporate PDFs (PyMuPDF).
  2. Generate local embeddings via Ollama (nomic-embed-text).
  3. Persist vectors and metadata in local ChromaDB.
  4. Query relevant evidence by keywords.

Dependencies: pymupdf, chromadb, requests
No LangChain. All calls are direct.
"""

import re
import os
from dataclasses import dataclass
import requests
import fitz  # PyMuPDF
import chromadb
from chromadb.config import Settings

# ──────────────────────────────────────────────
# Global configuration
# ──────────────────────────────────────────────
OLLAMA_URL   = "http://localhost:11434/api/embeddings"
OLLAMA_MODEL = "nomic-embed-text"
CHROMA_PATH  = "./chroma_db"


# ──────────────────────────────────────────────
# Internal type for chunk metadata
# ──────────────────────────────────────────────
@dataclass
class ChunkRecord:
    """Represents a text fragment with its source metadata."""
    text:      str
    page:      int
    source:    str
    chunk_idx: int


# ══════════════════════════════════════════════
# 1. PDF EXTRACTION AND CHUNKING
# ══════════════════════════════════════════════

def extract_text_chunks(
    file_path: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> list[str]:
    """
    Opens a PDF with PyMuPDF, extracts text page by page, cleans it,
    and splits it into chunks of `chunk_size` words with an overlap of
    `overlap` words to preserve context across chunk boundaries.

    Returns only the text strings (list[str]) to satisfy the module's
    public contract. When metadata (page, source, index) is needed,
    use `extract_text_chunks_with_metadata()`.

    Args:
        file_path:  Absolute or relative path to the PDF file.
        chunk_size: Number of words per chunk (default 500).
        overlap:    Words shared between consecutive chunks (default 50).

    Returns:
        List of strings; each element is a clean text fragment.

    Raises:
        FileNotFoundError: If the PDF does not exist at the given path.
        RuntimeError:      If PyMuPDF cannot open the file.
    """
    return [r.text for r in extract_text_chunks_with_metadata(file_path, chunk_size, overlap)]


def extract_text_chunks_with_metadata(
    file_path: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> list[ChunkRecord]:
    """
    Extended version of `extract_text_chunks` that includes metadata
    (page, source, chunk index). Used internally by
    `process_and_store_document` to build ChromaDB records.

    Args:
        file_path:  Absolute or relative path to the PDF file.
        chunk_size: Number of words per chunk (default 500).
        overlap:    Words shared between consecutive chunks (default 50).

    Returns:
        List of ChunkRecord with fields: text, page, source, chunk_idx.

    Raises:
        FileNotFoundError: If the PDF does not exist at the given path.
        RuntimeError:      If PyMuPDF cannot open the file.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"PDF not found: {file_path}")

    source_name = os.path.basename(file_path)
    records: list[ChunkRecord] = []
    chunk_idx = 0

    try:
        doc = fitz.open(file_path)
    except Exception as exc:
        raise RuntimeError(f"Could not open '{file_path}' with PyMuPDF: {exc}") from exc

    with doc:
        for page_num, page in enumerate(doc, start=1):
            raw_text = page.get_text("text")

            # ── Text cleaning ───────────────────────────────
            # Replace hyphenated line breaks before collapsing lines
            cleaned = raw_text.replace("-\n", "").replace("\n", " ")
            # Collapse multiple spaces into one
            cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()

            if not cleaned:
                continue  # Empty page (image without OCR text layer)

            # ── Sliding window over words ───────────────────
            # step = chunk_size - overlap ensures each chunk
            # shares `overlap` words with the next one.
            words = cleaned.split()
            step  = chunk_size - overlap

            for start in range(0, len(words), step):
                chunk_words = words[start : start + chunk_size]
                chunk_text  = " ".join(chunk_words).strip()

                if len(chunk_words) < 10:
                    # Discard residual fragments that are too small
                    continue

                records.append(ChunkRecord(
                    text=chunk_text,
                    page=page_num,
                    source=source_name,
                    chunk_idx=chunk_idx,
                ))
                chunk_idx += 1

    print(f"  [extract] '{source_name}' → {chunk_idx} chunks extracted.")
    return records


# ══════════════════════════════════════════════
# 2. EMBEDDING GENERATION VIA OLLAMA
# ══════════════════════════════════════════════

def get_ollama_embedding(text: str) -> list[float]:
    """
    Calls the local Ollama API to obtain the embedding vector for the
    given text using the `nomic-embed-text` model.

    Args:
        text: Text to vectorize (a document chunk or a query string).

    Returns:
        List of floats representing the embedding vector.

    Raises:
        ConnectionError: If Ollama is not reachable at localhost:11434.
        ValueError:      If the Ollama response does not contain the expected field.
    """
    payload = {
        "model":  OLLAMA_MODEL,
        "prompt": text,
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=30)
        response.raise_for_status()
    except requests.exceptions.ConnectionError as exc:
        raise ConnectionError(
            f"Could not connect to Ollama at {OLLAMA_URL}. "
            "Make sure the service is running (`ollama serve`)."
        ) from exc
    except requests.exceptions.Timeout as exc:
        raise ConnectionError(
            f"Ollama took too long to respond (timeout=30s). "
            f"Check if model '{OLLAMA_MODEL}' is downloaded (`ollama pull {OLLAMA_MODEL}`)."
        ) from exc
    except requests.exceptions.HTTPError as exc:
        raise ValueError(
            f"Ollama returned HTTP error {response.status_code}: {response.text}"
        ) from exc

    data = response.json()

    if "embedding" not in data:
        raise ValueError(
            f"Unexpected Ollama response (missing 'embedding' field): {data}"
        )

    return data["embedding"]


# ══════════════════════════════════════════════
# 3. FULL INGESTION: PDF → EMBEDDING → CHROMADB
# ══════════════════════════════════════════════

def process_and_store_document(
    file_paths: list[str],
    collection_name: str = "trustnode_evidence",
) -> None:
    """
    Main ingestion function. For each PDF in `file_paths`:
      1. Extracts and chunks the text (with metadata).
      2. Generates embeddings with Ollama.
      3. Stores vectors and metadata in persistent ChromaDB.

    The collection is deleted and recreated on each run to guarantee
    full synchronization with the source files.

    Args:
        file_paths:      List of paths to the PDFs to process.
        collection_name: Name of the ChromaDB collection.
    """
    # ── Initialize persistent ChromaDB ─────────────────────
    print(f"[chroma] Initializing persistent client at '{CHROMA_PATH}'...")
    client = chromadb.PersistentClient(
        path=CHROMA_PATH,
        settings=Settings(anonymized_telemetry=False),
    )

    # Delete existing collection to re-index from scratch
    existing = [c.name for c in client.list_collections()]
    if collection_name in existing:
        print(f"[chroma] Deleting existing collection '{collection_name}'...")
        client.delete_collection(collection_name)

    collection = client.create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},  # cosine distance for semantic similarity
    )
    print(f"[chroma] Collection '{collection_name}' created.")

    # ── Iterate over PDFs ───────────────────────────────────
    total_stored = 0

    for file_path in file_paths:
        print(f"\n[ingest] Processing: {file_path}")

        try:
            records = extract_text_chunks_with_metadata(file_path)
        except (FileNotFoundError, RuntimeError) as exc:
            print(f"  [WARN] Skipping '{file_path}': {exc}")
            continue

        if not records:
            print(f"  [WARN] No text extracted from '{file_path}'. Is it a scanned PDF?")
            continue

        # ── Generate embeddings and prepare batch ───────────
        ids:        list[str]         = []
        embeddings: list[list[float]] = []
        documents:  list[str]         = []
        metadatas:  list[dict]        = []

        for record in records:
            try:
                vector = get_ollama_embedding(record.text)
            except (ConnectionError, ValueError) as exc:
                print(f"  [ERROR] Embedding failed (chunk {record.chunk_idx}): {exc}")
                continue  # Skip this chunk without aborting the entire ingestion

            doc_id = f"{record.source}_chunk{record.chunk_idx}"

            ids.append(doc_id)
            embeddings.append(vector)
            documents.append(record.text)
            metadatas.append({
                "source":    record.source,
                "page":      record.page,
                "chunk_idx": record.chunk_idx,
            })

        # ── Store in ChromaDB in batches of 100 ────────────
        BATCH_SIZE = 100
        for i in range(0, len(ids), BATCH_SIZE):
            batch = slice(i, i + BATCH_SIZE)
            collection.add(
                ids=ids[batch],
                embeddings=embeddings[batch],
                documents=documents[batch],
                metadatas=metadatas[batch],
            )

        stored = len(ids)
        total_stored += stored
        print(f"  [chroma] {stored} chunks stored for '{os.path.basename(file_path)}'.")

    print(f"\n[ingest] Done. Total chunks in collection: {total_stored}")


# ══════════════════════════════════════════════
# 4. EVIDENCE QUERY BY KEYWORDS
# ══════════════════════════════════════════════

def query_evidence(
    keywords: list[str],
    n_results: int = 3,
    collection_name: str = "trustnode_evidence",
) -> str:
    """
    Converts a list of keywords into an embedding, searches ChromaDB for
    the most relevant fragments, and returns a consolidated text block
    ready to be consumed by the audit pipeline.

    Args:
        keywords:        List of search terms (e.g. ["GDPR", "personal data"]).
        n_results:       Number of fragments to retrieve (default 3).
        collection_name: Name of the collection to query.

    Returns:
        String with the most relevant fragments concatenated, each headed
        by its metadata (source, page, relevance score). Returns a warning
        message if the collection is empty or no results are found.

    Raises:
        ConnectionError: If Ollama is unavailable when generating the query embedding.
    """
    client = chromadb.PersistentClient(
        path=CHROMA_PATH,
        settings=Settings(anonymized_telemetry=False),
    )

    existing = [c.name for c in client.list_collections()]
    if collection_name not in existing:
        return (
            f"[query_evidence] Collection '{collection_name}' does not exist. "
            "Run `process_and_store_document()` first."
        )

    collection = client.get_collection(collection_name)

    if collection.count() == 0:
        return "[query_evidence] Collection is empty. No evidence has been indexed."

    # ── Build query embedding ───────────────────────────────
    query_text = " ".join(keywords)
    print(f"[query] Searching: '{query_text}'")

    try:
        query_vector = get_ollama_embedding(query_text)
    except (ConnectionError, ValueError) as exc:
        raise ConnectionError(
            f"Could not generate query embedding: {exc}"
        ) from exc

    # ── Run ChromaDB search ─────────────────────────────────
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=min(n_results, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    # ── Consolidate results into a single text block ────────
    fragments: list[str] = []

    docs      = results.get("documents", [[]])[0]
    metas     = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    for doc, meta, dist in zip(docs, metas, distances):
        relevance = round((1 - dist) * 100, 2)  # cosine distance → % similarity
        header = (
            f"[Source: {meta.get('source', 'unknown')} | "
            f"Page: {meta.get('page', '?')} | "
            f"Relevance: {relevance}%]"
        )
        fragments.append(f"{header}\n{doc}")

    if not fragments:
        return "[query_evidence] No relevant fragments found for the given keywords."

    return "\n\n---\n\n".join(fragments)


# ══════════════════════════════════════════════
# 5. PUBLIC API — consumed by main.py
# ══════════════════════════════════════════════

def get_collection_stats(collection_name: str = "trustnode_evidence") -> dict:
    """Return document count and availability for the ChromaDB collection."""
    client = chromadb.PersistentClient(
        path=CHROMA_PATH,
        settings=Settings(anonymized_telemetry=False),
    )
    existing = [c.name for c in client.list_collections()]
    if collection_name not in existing:
        return {"documents": 0, "available": False, "collection": collection_name}
    collection = client.get_collection(collection_name)
    return {
        "documents": collection.count(),
        "available": True,
        "collection": collection_name,
    }


def clear_collection(collection_name: str = "trustnode_evidence") -> dict:
    """Drop the ChromaDB collection so the next ingest starts from a clean slate.

    Used by ``POST /api/v1/clear_db`` before every new audit run to prevent
    the LLM from grounding answers on stale evidence from previous sessions.
    """
    client = chromadb.PersistentClient(
        path=CHROMA_PATH,
        settings=Settings(anonymized_telemetry=False),
    )
    existing = [c.name for c in client.list_collections()]
    if collection_name in existing:
        client.delete_collection(collection_name)
        deleted = True
    else:
        deleted = False

    # Re-create the (empty) collection so subsequent queries don't error out
    client.create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )
    return {"cleared": deleted, "collection": collection_name, "documents": 0}


def ingest_pdf(file_bytes: bytes, filename: str, collection_name: str = "trustnode_evidence") -> dict:
    """Ingest a single PDF from raw bytes into ChromaDB.

    Writes bytes to a temp file, extracts chunks, embeds them and upserts
    into the persistent collection (additive — does not wipe existing data).

    Returns a metadata dict with keys ``filename`` and ``chunks``.
    """
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        records = extract_text_chunks_with_metadata(tmp_path)
    finally:
        os.unlink(tmp_path)

    if not records:
        return {"filename": filename, "chunks": 0, "warning": "No text extracted."}

    client = chromadb.PersistentClient(
        path=CHROMA_PATH,
        settings=Settings(anonymized_telemetry=False),
    )
    existing = [c.name for c in client.list_collections()]
    if collection_name in existing:
        collection = client.get_collection(collection_name)
    else:
        collection = client.create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    ids:        list[str]         = []
    embeddings: list[list[float]] = []
    documents:  list[str]         = []
    metadatas:  list[dict]        = []

    for record in records:
        try:
            vector = get_ollama_embedding(record.text)
        except (ConnectionError, ValueError):
            continue

        ids.append(f"{filename}_chunk{record.chunk_idx}")
        embeddings.append(vector)
        documents.append(record.text)
        metadatas.append({
            "source":    filename,
            "page":      record.page,
            "chunk_idx": record.chunk_idx,
        })

    BATCH_SIZE = 100
    for i in range(0, len(ids), BATCH_SIZE):
        b = slice(i, i + BATCH_SIZE)
        collection.upsert(
            ids=ids[b],
            embeddings=embeddings[b],
            documents=documents[b],
            metadatas=metadatas[b],
        )

    print(f"  [ingest_pdf] '{filename}' → {len(ids)} chunks stored.")
    return {"filename": filename, "chunks": len(ids)}


# ══════════════════════════════════════════════
# ENTRY POINT FOR QUICK TESTING
# ══════════════════════════════════════════════

if __name__ == "__main__":
    # Usage example — uncomment to test:
    #
    # test_files = ["documents/privacy_policy.pdf", "documents/contract_2024.pdf"]
    # process_and_store_document(test_files)
    #
    # evidence = query_evidence(["data protection", "consent", "GDPR"])
    # print(evidence)

    print("ingestion.py ready. Import functions from main.py.")
