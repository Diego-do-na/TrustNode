"""
ingestion.py — Módulo de ingesta de documentos para TrustNode
=============================================================
Responsabilidades:
  1. Extraer y fragmentar texto de PDFs empresariales (PyMuPDF).
  2. Generar embeddings locales vía Ollama (nomic-embed-text).
  3. Persistir vectores y metadata en ChromaDB local.
  4. Consultar evidencia relevante por palabras clave.

Dependencias: pymupdf, chromadb, requests
No usa LangChain. Todas las llamadas son directas.
"""

import re
import os
from dataclasses import dataclass
import requests
import fitz  # PyMuPDF
import chromadb
from chromadb.config import Settings

# ──────────────────────────────────────────────
# Configuración global
# ──────────────────────────────────────────────
OLLAMA_URL   = "http://localhost:11434/api/embeddings"
OLLAMA_MODEL = "nomic-embed-text"
CHROMA_PATH  = "./chroma_db"


# ──────────────────────────────────────────────
# Tipo interno para metadata de chunks
# ──────────────────────────────────────────────
@dataclass
class ChunkRecord:
    """Representa un fragmento de texto con su metadata de origen."""
    text:      str
    page:      int
    source:    str
    chunk_idx: int


# ══════════════════════════════════════════════
# 1. EXTRACCIÓN Y CHUNKING DE PDFs
# ══════════════════════════════════════════════

def extract_text_chunks(
    file_path: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> list[str]:
    """
    Abre un PDF con PyMuPDF, extrae el texto página a página,
    lo limpia y lo divide en fragmentos de `chunk_size` palabras
    con un solapamiento de `overlap` palabras para preservar contexto.

    Retorna únicamente los textos (list[str]) para cumplir el contrato
    público del módulo. Cuando necesites metadata (página, fuente, índice)
    usa `extract_text_chunks_with_metadata()`.

    Args:
        file_path:  Ruta absoluta o relativa al archivo PDF.
        chunk_size: Número de palabras por chunk (default 500).
        overlap:    Palabras compartidas entre chunks consecutivos (default 50).

    Returns:
        Lista de strings; cada elemento es un fragmento de texto limpio.

    Raises:
        FileNotFoundError: Si el PDF no existe en la ruta indicada.
        RuntimeError:      Si PyMuPDF no puede abrir el archivo.
    """
    return [r.text for r in extract_text_chunks_with_metadata(file_path, chunk_size, overlap)]


def extract_text_chunks_with_metadata(
    file_path: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> list[ChunkRecord]:
    """
    Versión extendida de `extract_text_chunks` que incluye metadata
    (página, fuente, índice de chunk). Usada internamente por
    `process_and_store_document` para construir los registros de ChromaDB.

    Args:
        file_path:  Ruta absoluta o relativa al archivo PDF.
        chunk_size: Número de palabras por chunk (default 500).
        overlap:    Palabras compartidas entre chunks consecutivos (default 50).

    Returns:
        Lista de ChunkRecord con campos: text, page, source, chunk_idx.

    Raises:
        FileNotFoundError: Si el PDF no existe en la ruta indicada.
        RuntimeError:      Si PyMuPDF no puede abrir el archivo.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"PDF no encontrado: {file_path}")

    source_name = os.path.basename(file_path)
    records: list[ChunkRecord] = []
    chunk_idx = 0

    try:
        doc = fitz.open(file_path)
    except Exception as exc:
        raise RuntimeError(f"No se pudo abrir '{file_path}' con PyMuPDF: {exc}") from exc

    with doc:
        for page_num, page in enumerate(doc, start=1):
            raw_text = page.get_text("text")

            # ── Limpieza del texto ──────────────────────────
            # Reemplaza guiones de separación silábica antes de colapsar líneas
            cleaned = raw_text.replace("-\n", "").replace("\n", " ")
            # Colapsa múltiples espacios en uno
            cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()

            if not cleaned:
                continue  # Página vacía (imagen sin capa de texto OCR)

            # ── Ventana deslizante por palabras ─────────────
            # step = chunk_size - overlap garantiza que cada chunk
            # comparta `overlap` palabras con el siguiente.
            words = cleaned.split()
            step  = chunk_size - overlap

            for start in range(0, len(words), step):
                chunk_words = words[start : start + chunk_size]
                chunk_text  = " ".join(chunk_words).strip()

                if len(chunk_words) < 10:
                    # Descarta fragmentos residuales demasiado pequeños
                    continue

                records.append(ChunkRecord(
                    text=chunk_text,
                    page=page_num,
                    source=source_name,
                    chunk_idx=chunk_idx,
                ))
                chunk_idx += 1

    print(f"  [extract] '{source_name}' → {chunk_idx} chunks extraídos.")
    return records


# ══════════════════════════════════════════════
# 2. GENERACIÓN DE EMBEDDINGS VÍA OLLAMA
# ══════════════════════════════════════════════

def get_ollama_embedding(text: str) -> list[float]:
    """
    Llama a la API local de Ollama para obtener el vector embedding
    del texto recibido usando el modelo `nomic-embed-text`.

    Args:
        text: Texto a vectorizar (un chunk de documento o una consulta).

    Returns:
        Lista de floats que representa el vector embedding.

    Raises:
        ConnectionError: Si Ollama no está disponible en localhost:11434.
        ValueError:      Si la respuesta de Ollama no contiene el campo esperado.
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
            f"No se pudo conectar a Ollama en {OLLAMA_URL}. "
            "Asegúrate de que el servicio esté corriendo (`ollama serve`)."
        ) from exc
    except requests.exceptions.Timeout as exc:
        raise ConnectionError(
            f"Ollama tardó demasiado en responder (timeout=30s). "
            f"Revisa si el modelo '{OLLAMA_MODEL}' está descargado (`ollama pull {OLLAMA_MODEL}`)."
        ) from exc
    except requests.exceptions.HTTPError as exc:
        raise ValueError(
            f"Ollama devolvió un error HTTP {response.status_code}: {response.text}"
        ) from exc

    data = response.json()

    if "embedding" not in data:
        raise ValueError(
            f"Respuesta inesperada de Ollama (sin campo 'embedding'): {data}"
        )

    return data["embedding"]


# ══════════════════════════════════════════════
# 3. INGESTA COMPLETA: PDF → EMBEDDING → CHROMADB
# ══════════════════════════════════════════════

def process_and_store_document(
    file_paths: list[str],
    collection_name: str = "trustnode_evidence",
) -> None:
    """
    Función principal de ingesta. Para cada PDF en `file_paths`:
      1. Extrae y fragmenta el texto (con metadata).
      2. Genera embeddings con Ollama.
      3. Almacena vectores + metadata en ChromaDB persistente.

    La colección se elimina y re-crea en cada ejecución para garantizar
    sincronización total con los archivos fuente.

    Args:
        file_paths:      Lista de rutas a los PDFs a procesar.
        collection_name: Nombre de la colección en ChromaDB.
    """
    # ── Inicializar ChromaDB persistente ───────────────────
    print(f"[chroma] Inicializando cliente persistente en '{CHROMA_PATH}'...")
    client = chromadb.PersistentClient(
        path=CHROMA_PATH,
        settings=Settings(anonymized_telemetry=False),
    )

    # Eliminar colección anterior para re-indexar desde cero
    existing = [c.name for c in client.list_collections()]
    if collection_name in existing:
        print(f"[chroma] Eliminando colección existente '{collection_name}'...")
        client.delete_collection(collection_name)

    collection = client.create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},  # distancia coseno para similitud semántica
    )
    print(f"[chroma] Colección '{collection_name}' creada.")

    # ── Iterar sobre los PDFs ───────────────────────────────
    total_stored = 0

    for file_path in file_paths:
        print(f"\n[ingesta] Procesando: {file_path}")

        try:
            records = extract_text_chunks_with_metadata(file_path)
        except (FileNotFoundError, RuntimeError) as exc:
            print(f"  [WARN] Saltando '{file_path}': {exc}")
            continue

        if not records:
            print(f"  [WARN] No se extrajo texto de '{file_path}'. ¿Es un PDF escaneado?")
            continue

        # ── Generar embeddings y preparar batch ────────────
        ids:        list[str]         = []
        embeddings: list[list[float]] = []
        documents:  list[str]         = []
        metadatas:  list[dict]        = []

        for record in records:
            try:
                vector = get_ollama_embedding(record.text)
            except (ConnectionError, ValueError) as exc:
                print(f"  [ERROR] Embedding fallido (chunk {record.chunk_idx}): {exc}")
                continue  # Saltar este chunk sin interrumpir toda la ingesta

            doc_id = f"{record.source}_chunk{record.chunk_idx}"

            ids.append(doc_id)
            embeddings.append(vector)
            documents.append(record.text)
            metadatas.append({
                "source":    record.source,
                "page":      record.page,
                "chunk_idx": record.chunk_idx,
            })

        # ── Guardar en ChromaDB en lotes de 100 ────────────
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
        print(f"  [chroma] {stored} chunks almacenados para '{os.path.basename(file_path)}'.")

    print(f"\n[ingesta] ✓ Proceso completado. Total chunks en colección: {total_stored}")


# ══════════════════════════════════════════════
# 4. CONSULTA DE EVIDENCIA POR PALABRAS CLAVE
# ══════════════════════════════════════════════

def query_evidence(
    keywords: list[str],
    n_results: int = 3,
    collection_name: str = "trustnode_evidence",
) -> str:
    """
    Convierte una lista de palabras clave en un embedding, busca en
    ChromaDB los fragmentos más relevantes y retorna un bloque de
    texto consolidado listo para consumir en el pipeline de auditoría.

    Args:
        keywords:        Lista de términos de búsqueda (ej. ["GDPR", "datos personales"]).
        n_results:       Número de fragmentos a recuperar (default 3).
        collection_name: Nombre de la colección a consultar.

    Returns:
        String con los fragmentos más relevantes concatenados,
        cada uno encabezado por su metadata (fuente, página, relevancia).
        Devuelve un mensaje de aviso si la colección está vacía o
        no se encuentran resultados.

    Raises:
        ConnectionError: Si Ollama no está disponible al generar el query embedding.
    """
    client = chromadb.PersistentClient(
        path=CHROMA_PATH,
        settings=Settings(anonymized_telemetry=False),
    )

    existing = [c.name for c in client.list_collections()]
    if collection_name not in existing:
        return (
            f"[query_evidence] La colección '{collection_name}' no existe. "
            "Ejecuta primero `process_and_store_document()`."
        )

    collection = client.get_collection(collection_name)

    if collection.count() == 0:
        return "[query_evidence] La colección está vacía. No hay evidencia indexada."

    # ── Construir query embedding ──────────────────────────
    query_text = " ".join(keywords)
    print(f"[query] Buscando: '{query_text}'")

    try:
        query_vector = get_ollama_embedding(query_text)
    except (ConnectionError, ValueError) as exc:
        raise ConnectionError(
            f"No se pudo generar el embedding de consulta: {exc}"
        ) from exc

    # ── Ejecutar búsqueda en ChromaDB ──────────────────────
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=min(n_results, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    # ── Consolidar resultados en un solo bloque de texto ───
    fragments: list[str] = []

    docs      = results.get("documents", [[]])[0]
    metas     = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    for doc, meta, dist in zip(docs, metas, distances):
        relevance = round((1 - dist) * 100, 2)  # distancia coseno → % similitud
        header = (
            f"[Fuente: {meta.get('source', 'desconocido')} | "
            f"Página: {meta.get('page', '?')} | "
            f"Relevancia: {relevance}%]"
        )
        fragments.append(f"{header}\n{doc}")

    if not fragments:
        return "[query_evidence] No se encontraron fragmentos relevantes para los términos dados."

    return "\n\n---\n\n".join(fragments)


# ══════════════════════════════════════════════
# PUNTO DE ENTRADA PARA PRUEBAS RÁPIDAS
# ══════════════════════════════════════════════

if __name__ == "__main__":
    # Ejemplo de uso — descomentar para probar:
    #
    # test_files = ["documentos/politica_privacidad.pdf", "documentos/contrato_2024.pdf"]
    # process_and_store_document(test_files)
    #
    # evidencia = query_evidence(["protección de datos", "consentimiento", "GDPR"])
    # print(evidencia)

    print("ingestion.py listo. Importa las funciones desde main.py.")