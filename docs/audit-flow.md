# TrustNode — Mapa del flujo de auditoría

Estado descrito: working tree actual (cambios sin commit incluidos). Todo corre local: FastAPI (`:8000`) + Ollama (`:11434`) + ChromaDB en disco + React/Vite.

## 1. Flujo completo

| # | Paso | Archivo · función | Qué hace |
|---|------|-------------------|----------|
| 1 | Selección en UI | `frontend/src/components/UploadModal.tsx` · `handleRun` (dentro del componente) | El usuario elige PDFs (nuevos o ya subidos), estándares, **tipo de documento** (`docType`) e idioma del reporte. |
| 2 | Limpieza de memoria RAG | `UploadModal` → `api/client.ts · clearDb` → `main.py · clear_db_endpoint` → `ingestion.py · clear_collection` | **Borra la colección de Chroma antes de cada auditoría** (evita evidencia de corridas previas). |
| 3 | Subida | `client.ts · ingestFiles` → `main.py · ingest_endpoint` (`POST /api/v1/ingest`) | Envía los PDFs como `multipart`; cada uno pasa por `ingestion.ingest_pdf` en threadpool. |
| 4 | Chunking | `ingestion.py · extract_text_chunks_with_metadata` | PyMuPDF página a página; limpia (`-\n`→"", `\n`→espacio, colapsa espacios); ventana deslizante de **500 palabras, solape 50**; descarta fragmentos < 10 palabras. Cada `ChunkRecord` guarda `page` (1-based, la página del PDF), `source`, `chunk_idx`. |
| 5 | Recuperación de checks | `TRUSTNODE_CHECK_RETRIEVAL` = `per_check_k3` (default) o `control_k<N>` | `evaluator.CHECK_RETRIEVAL` |
| Embeddings | `ingestion.py · get_ollama_embedding` | `POST /api/embeddings`, modelo `nomic-embed-text`, timeout 30 s. Si un chunk falla, **se omite en silencio** (`ingest_pdf` hace `continue`). |
| 6 | Almacenamiento | `ingestion.py · ingest_pdf` | `collection.upsert` en `trustnode_evidence` (cosine), lotes de 100. id = `<archivo>_chunk<N>`; metadata `{source, page, chunk_idx}`. `CHROMA_PATH = "./chroma_db"` es **relativo al cwd** del backend. |
| 7 | Auditoría | `client.ts · runAudit` → `main.py · audit_endpoint` (`POST /api/v1/audit`) → `evaluator.py · run_audit` | Uno por estándar, secuencial desde `UploadModal`. Corre `run_audit` en threadpool. |
| 7a | Aplicabilidad | `evaluator.py · applicability` | Si el control tiene `applies_to` y `doc_type` no está en la lista → resultado `not_evaluable` (sin recuperación ni LLM). Sin `applies_to` → siempre se evalúa. |
| 7b | Recuperación | `ingestion.py · query_evidence` | Antes de evaluar, `run_audit` comprueba `get_collection_stats()`: si hay controles evaluables y la colección tiene 0 chunks → `EmptyEvidenceError` (HTTP 422, "La ingesta no produjo fragmentos…", se muestra en el modal; no es un hallazgo). Luego embebe `" ".join(search_keywords)` y consulta top **3** chunks. Devuelve `list[dict]` `{id, text, page, source, relevance}`. |
| 7c | Prompt | `evaluator.py · build_user_message`, `AUDIT_SYSTEM_PROMPT` | Sección `REQUISITO A VERIFICAR` (descripción del control) separada de `FRAGMENTOS RECUPERADOS` (`[E1]…` con fuente y página). |
| 7c' | Controles con `checks` | `evaluator.py · evaluate_checked_control`, `_evaluate_check`, `derive_status`, `apply_anchors` | Si el control define `checks` (hoy 5.2, 6.2 y 4.3 de ISO 27001), se hace **una llamada por check** con `CHECK_SYSTEM_PROMPT`; el modelo solo responde `found`/`not_found` + citas. Las citas se verifican igual (y contra `anchors` si existen); el **estado lo deriva el código**: todos found = Compliant, algunos = Partial, ninguno = Non-Compliant. `gaps` y `recommendation` salen de las preguntas y del texto fijo de cada check. Recuperación según `CHECK_RETRIEVAL` (default `per_check_k3`: una búsqueda por check usando su pregunta, k=3; alternativa `control_k<N>`). |
| 7d | LLM | `evaluator.py · _call_ollama`, `_ask_llm` | Ver §4. Respuesta JSON: `status`, `citations[{chunk_id, quote}]`, `gaps`, `recommendation`. |
| 7e | Verificación de citas | `evaluator.py · verify_citations`, `verify_quote`, `normalize_text` | Cada cita debe ser substring (normalizado) del chunk `E#` citado; página y fuente salen del metadata del chunk. Descartes → `logger.warning`. |
| 7f | Reintento / degradación | `evaluator.py · evaluate_control` | `Compliant`/`Partial` sin citas verificadas → 1 reintento con `STRICT_RETRY_NOTICE`; si persiste → `Non-Compliant`, `evidence_unverified=true`, `note="sin evidencia verificable"`. |
| 8 | Score | `evaluator.py · compute_score` (llamado en `run_audit`) | compliant=1, partial=0.5, non-compliant=0; promedio ×100 sobre evaluables; `None` si no hay. Fuente única; el frontend solo muestra. |
| 9 | Presentación | `FindingsCard`, `ComplianceHeatmap`, `StandardsCard`, `TrustHero`, `ReportPreviewModal` | Leen `AuditResponse`. Promedio global: `utils/auditMetrics.ts · averageTrustScore` → `utils/scoring.ts · weightedScore` (ponderado por `evaluated_count`, ignora null). |
| 10 | Resumen ejecutivo | `ExecutiveSummary.tsx · aggregatePayload` → `client.ts · generateSummary` → `main.py · summary_endpoint` → `evaluator.py · generate_executive_summary` | Score agregado con `weightedScore`. `build_summary_prompt` no lista los `not_evaluable`; agrega "M controles no evaluables para este tipo de documento". Llamada libre a Ollama (sin `format: json`), ≤ 3 párrafos. |
| 11 | Reporte PDF | `ReportPreviewModal.tsx · handleExport` → `client.ts · exportReportPdf` → `main.py · export_pdf_endpoint` → `latex_report.py · render_pdf` | Construye LaTeX (`build_report_tex`) y compila con `pdflatex` (timeout 60 s, binario en `/usr/bin/pdflatex`). |
| 12 | Registro | `UploadModal` → `AppStateContext.recordReport` | Guarda el reporte (con `results` completos) en `localStorage`. |

Nota de orden: al auditar varios estándares, el paso 7 se repite por estándar sobre la **misma** colección Chroma y el **mismo** `doc_type`.

## 2. Contratos de datos (frontend ↔ backend)

Fuente: `backend/schemas.py` y `frontend/src/api/client.ts` (se mantienen a mano en paralelo; no hay generación de tipos).

### `DocType`
`"isms_policy" | "topic_policy" | "procedure" | "soa"`. Definido en `frontend/src/data/standards.ts` (re-exportado por `client.ts`) y como `Literal` en `schemas.py`.

### `ControlSchema`
| Campo | Tipo | Obligatorio | Default |
|---|---|---|---|
| `control_id` | str | sí | — |
| `title` | str | sí | — |
| `description` | str | sí | — |
| `search_keywords` | list[str] | sí | — |
| `applies_to` | list[DocType] \| null | no | `null` (= siempre aplica) |
| `legacy_id` | str \| null | no | `null` (solo trazabilidad) |

### `Check` (opcional en `ControlSchema.checks`)
`id` (obligatorio), `question` (obligatorio, una sola condición), `hint?`, `anchors?` (subcadenas que debe contener la cita verificada), `recommendation?` (texto fijo). `AuditResult.checks` devuelve `CheckResult {check_id, question, found, citations, evidence_unverified}`; vacío en controles sin checks.

### `AuditRequest` (`POST /api/v1/audit`)
`standard_name` (sí), `domain` (sí), `controls` (sí), **`doc_type`** (no; default `"isms_policy"` en backend; el front lo envía siempre desde el selector). El front también envía `language`, que el backend **ignora** (pydantic descarta extras).

### `AuditResponse`
| Campo | Tipo | Notas |
|---|---|---|
| `standard_audited` | str | = `standard_name` |
| `global_score_percentage` | float \| null | `null` si no hay evaluables |
| `evaluated_count` | int (default 0) | controles evaluados |
| `not_evaluable_count` | int (default 0) | |
| `results` | list[AuditResult] | |
| `findings` | list[AuditResult] | campo calculado = `results` |
| `doc_type` | DocType (default `isms_policy`) | eco del request; ausente en reportes guardados antes |

### `AuditResult`
| Campo | Tipo | Default |
|---|---|---|
| `control_id` | str | — |
| `status` | `"Compliant" \| "Partial" \| "Non-Compliant" \| "not_evaluable"` | — |
| `evidence_found` | str | — (`"None"` si no hay; si hay: `"cita" (archivo, p. N) \| …`) |
| `gaps` | str | — (en `not_evaluable` contiene la razón) |
| `recommendation` | str | — |
| `risk_level` | `High\|Medium\|Low\|None` | — (mapeo en `_STATUS_TO_RISK`: Compliant→None, Partial→Medium, Non-Compliant→High, not_evaluable→None) |
| `citations` | list[Citation] | `[]` |
| `evidence_unverified` | bool | `false` |
| `note` | str | `""` |

`Citation`: `chunk_id` ("E1"…), `source`, `page` (int \| null), `quote`.

### Estados posibles
- Del LLM: `Compliant`, `Partial`, `Non-Compliant`.
- Del código: `Non-Compliant` (sin chunks; fallback por error del LLM; degradación por citas no verificables) y `not_evaluable` (regla `applies_to`).
- En el front, `ComplianceTag`: `compliant | partial | non-compliant | not-evaluable` (guion; en la API es `not_evaluable`).

### Otros endpoints
- `SummaryRequest`: `standard_audited`, `global_score_percentage` (float\|null, default null), `results`, `language` (default "English").
- `ExportPdfRequest`: `standard_name`, `compliance_score` (float\|null, **ahora con default null**; antes obligatorio), `findings[ExportFinding]`, `executive_summary?`, `generated_at?`. `ExportFinding` lleva `citations` y `evidence_unverified` (el PDF marca esos hallazgos con borde rojo grueso y un aviso); `ExportPdfRequest.doc_type` se imprime en la portada.
- `GET /api/v1/status`, `POST /api/v1/clear_db`, `POST /api/v1/ingest`.

## 3. Estado en el frontend

- `App.tsx` (estado en memoria, se pierde al recargar): `auditResults`, `lastAuditAt`, `reportLanguage`, `activeTab`, `uploadOpen`, `systemStatus`, `sidebarOpen`.
- `context/AppStateContext.tsx`: `documents`, `reports`, `customStandards` → **persistidos en `localStorage`** (clave `trustnode.state.v1`); `fileCache` (objetos `File`) solo en memoria.
- `reports[].results` guarda el `AuditResponse[]` completo. Al cargar, `loadPersisted` pasa cada resultado por `utils/scoring.ts · normalizeAuditResponse` (cuentas derivadas de `results`, score ausente → null). `StoredReport.docType` es opcional (ausente en reportes viejos).
- `UploadModal`: estado local de selección (`selected`, `reportLang`, `docType`, `phase`, `files`). El `docType` se guarda en el reporte (`StoredReport.docType`).
- Estándares: `data/standards.ts · STANDARD_DEFINITIONS` (6 estándares) + `customStandards` importados en `SettingsPage` (`validateStandardJson` conserva `applies_to` (validado contra `DOC_TYPES`) y `legacy_id`).

## 4. Configuración del LLM

| Aspecto | Valor | Dónde |
|---|---|---|
| Modelo de auditoría | `llama3.1` (en la máquina: `llama3.1:latest`, 8B, Q4_K_M) | `evaluator.OLLAMA_MODEL` |
| Endpoint | `POST http://localhost:11434/api/generate` | `evaluator.OLLAMA_URL` |
| Modo | `format: "json"`, `stream: false` | `_call_ollama` |
| Parámetros de muestreo (solo auditoría) | `temperature 0`, `seed 42`, `num_ctx 6144` en `evaluator.OLLAMA_OPTIONS`; override por env `TRUSTNODE_TEMPERATURE`, `TRUSTNODE_SEED`, `TRUSTNODE_NUM_CTX`. El resumen ejecutivo usa los defaults de Ollama. | `evaluator.py` |
| Prompt | system + user concatenados en un solo `prompt` (no se usa el rol `system`) | `_ask_llm` |
| Timeout | 120 s por llamada | `OLLAMA_TIMEOUT` |
| Reintentos | `_ask_llm`: 2 intentos si falla HTTP/JSON/validación; si el resultado es compliant/partial sin citas verificadas, 1 llamada extra estricta (también con hasta 2 intentos). Máximo **4** llamadas por control. | `evaluator.py` |
| Fallback | `Non-Compliant`, `_error: True`, gaps "Internal error…" | `_fallback` |
| Embeddings | `nomic-embed-text`, `/api/embeddings`, timeout 30 s, sin reintentos | `ingestion.py` |
| Resumen | mismo modelo, sin `format: json`, 1 intento, error → HTTP 502 | `generate_executive_summary` |
| Health check | `GET /api/tags` | `check_llm_alive`, `main.py · status_endpoint` |

## 5. Cobertura de tests

Backend: `backend/tests/test_evaluator.py` (pytest; 24 pasan, 1 se salta). Frontend: `frontend/src/utils/scoring.test.ts` (`npm test`, runner nativo de Node; 6 pasan). Ninguna prueba toca Ollama ni Chroma reales.

| Parte | Cobertura |
|---|---|
| `normalize_text`, `verify_quote`, `parse_chunk_label`, `verify_citations`, `applicability`, `compute_score`, `build_user_message`, `build_summary_prompt` | **Unit tests reales** (funciones puras). |
| `normalizeAuditResponse`, `weightedScore` (frontend) | **Unit tests reales**. |
| `_call_ollama` (opciones temperature/seed/num_ctx) | Test con `httpx.Client` falso: verifica el payload, no el efecto en el modelo. |
| `evaluate_control` (retry, degradación, sin chunks) | **Mock**: `_call_ollama` reemplazado. |
| `run_audit` (not_evaluable, score null, colección vacía, control sin `applies_to`) | **Mock**: `_call_ollama`, `query_evidence`, `get_collection_stats`. |
| `POST /api/v1/audit` con colección vacía → 422 | `TestClient` sin lifespan, con `get_collection_stats` mockeado. |
| Regresión Datagraphic (cassette) | `tests/test_datagraphic_cassette.py` reproduce una corrida real grabada (`tests/fixtures/datagraphic_cassette.json`, generada con `tests/record_cassette.py`). Prueba el pipeline, no el modelo. 6.2 está marcado `xfail(strict)` por un fallo conocido del modelo. |
| `ingestion.py` (chunking, embeddings, Chroma, `query_evidence`) | **Sin tests.** |
| Resto de `main.py` (ingest, summary, export) | **Sin tests.** |
| `latex_report.py` | Compilado una vez a mano con `pdflatex` (portada N/A, Not Evaluable, hallazgo no verificado, tipo de documento); **sin test automático**. |
| `generate_executive_summary` (llamada HTTP) | **Sin tests** (solo el prompt). |
| Componentes React | **Sin tests.** `tsc -b` solo falla en 3 archivos no tocados (`GlowCard.tsx`, `pages/index.tsx`, `remotion/scenes/Scene2.tsx`); no se ejecutó la app en navegador. |
