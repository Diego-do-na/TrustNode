# TrustNode

> **Universal Compliance Engine — fully offline, AI-driven, audit-ready.**
> Ingest your organisational documents, evaluate them against normative
> standards (ISO 27001, ISO 9001, ISO 14001, ISO 45001, GDPR, SOC 2), and
> deliver an institutional PDF report — all on local infrastructure.

TrustNode runs a local Retrieval-Augmented Generation (RAG) pipeline against
**Llama 3.1 via Ollama** and **ChromaDB**, generates a multilingual executive
summary, and compiles a publication-grade LaTeX report so compliance officers
get a deliverable they can hand to auditors, boards, or regulators — without
any document ever leaving the machine.

---

## Table of contents

1. [Why TrustNode](#why-trustnode)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Repository layout](#repository-layout)
5. [Prerequisites](#prerequisites)
6. [Installation](#installation)
7. [Running TrustNode](#running-trustnode)
8. [How the pipeline works](#how-the-pipeline-works)
9. [HTTP API reference](#http-api-reference)
10. [Frontend feature tour](#frontend-feature-tour)
11. [Supported standards](#supported-standards)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)
14. [Roadmap](#roadmap)

---

## Why TrustNode

Compliance audits historically have three painful properties:

- **Slow** — manual review of hundreds of pages per control.
- **Expensive** — Big-4 consultants for first-pass gap analysis.
- **Confidential** — sending internal documents to a cloud LLM is rarely an option.

TrustNode collapses the gap-analysis stage into minutes while keeping every
byte on the operator's machine. The output is not a chat transcript, it is a
structured audit artefact:

- A **Trust Score** (0–100) per standard, computed from the LLM's verdicts.
- A **Compliance Heatmap** across every control of every selected standard.
- A list of **Findings** with status (Compliant / Partial / Non-Compliant),
  evidence, gap analysis, recommendations, and risk level.
- An **AI Executive Summary** written in the audit language by a "Senior
  Cybersecurity Auditor" persona.
- A **LaTeX-rendered PDF** with color-coded findings, ready to ship.

---

## Architecture

```
┌─────────────────────┐        ┌──────────────────────────────────────────────┐
│  React 19 + Vite    │  HTTP  │ FastAPI (main.py)                            │
│  Tailwind v4        │ ─────► │  ├─ /api/v1/status                           │
│  TypeScript         │        │  ├─ /api/v1/ingest      → ingestion.py        │
│                     │        │  ├─ /api/v1/audit       → evaluator.py        │
│                     │        │  ├─ /api/v1/summary     → evaluator.py        │
│                     │        │  ├─ /api/v1/clear_db    → ingestion.py        │
│                     │        │  └─ /api/v1/export/pdf  → latex_report.py     │
└─────────────────────┘        └──────────────────────────────────────────────┘
                                              │
              ┌───────────────────────────────┼─────────────────────────────┐
              │                               │                             │
              ▼                               ▼                             ▼
    ┌──────────────────┐         ┌──────────────────────┐      ┌────────────────────┐
    │  Ollama (local)  │         │  ChromaDB (on-disk)  │      │  pdflatex (TeX     │
    │  ─ llama3.1:8b   │         │  vector store        │      │  Live) → PDF       │
    │  ─ nomic-embed   │         │  ./chroma_db/        │      │                    │
    └──────────────────┘         └──────────────────────┘      └────────────────────┘
```

Everything runs on `localhost`. No network egress.

---

## Tech stack

### Backend (`backend/`)
| Concern               | Choice                                |
|-----------------------|----------------------------------------|
| HTTP framework        | FastAPI 0.136                         |
| ASGI server           | Uvicorn 0.47                          |
| Validation            | Pydantic 2.13                         |
| PDF text extraction   | PyMuPDF (`fitz`)                      |
| Embeddings model      | `nomic-embed-text` (via Ollama)       |
| Reasoning model       | `llama3.1:8b` (via Ollama)            |
| Vector store          | ChromaDB 1.5 (local persistence)      |
| PDF report compiler   | `pdflatex` from TeX Live              |
| HTTP client (Ollama)  | httpx (async + sync)                  |

### Frontend (`frontend/`)
| Concern        | Choice                          |
|----------------|----------------------------------|
| UI framework   | React 19                        |
| Build / dev    | Vite 6                          |
| Language       | TypeScript ~5.8 (strict mode)   |
| Styling        | Tailwind v4 + custom CSS tokens |
| State          | React state + Context API       |

---

## Repository layout

```
TrustNode/
├── backend/
│   ├── main.py            FastAPI app + endpoints + middleware
│   ├── ingestion.py       PDF parsing, chunking, embeddings, Chroma upsert/query
│   ├── evaluator.py       Per-control LLM evaluation + executive summary
│   ├── latex_report.py    LaTeX template + pdflatex compilation
│   ├── schemas.py         Pydantic request/response models (single source of truth)
│   ├── chroma_db/         Persisted vector collection (auto-created on first run)
│   └── venv/              Python virtualenv (created during install)
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig*.json
│   └── src/
│       ├── App.tsx                          Top-level shell + global state
│       ├── main.tsx                         React entrypoint
│       ├── api/
│       │   └── client.ts                    Typed fetch helpers for the 5 endpoints
│       ├── pages/
│       │   ├── index.tsx                    Router-like page switch
│       │   ├── OverviewPage.tsx             Hero + Heatmap + Findings + ExecutiveSummary
│       │   ├── ReportsPage.tsx              Persisted reports list
│       │   ├── DocumentsPage.tsx            Ingested PDFs library
│       │   └── SettingsPage.tsx
│       ├── components/
│       │   ├── TrustHero.tsx                Big score ring + meta
│       │   ├── StandardsCard.tsx
│       │   ├── ComplianceHeatmap.tsx
│       │   ├── FindingsCard.tsx
│       │   ├── ExecutiveSummary.tsx         AI summary card + Generate flow
│       │   ├── ReportPreviewModal.tsx       Triggers /export/pdf and downloads the blob
│       │   ├── UploadModal.tsx              File picker + standard selector + report lang
│       │   ├── GlowCard.tsx                 Reusable spotlight-glow card primitive
│       │   ├── Sidebar.tsx / Topbar.tsx
│       │   └── …
│       ├── context/AppStateContext.tsx      Persisted documents, reports, custom standards
│       ├── data/standards.ts                Built-in normative cartridges
│       ├── hooks/                           Custom React hooks
│       └── styles/                          Global CSS + animations
│
└── README.md
```

---

## Prerequisites

| Software   | Minimum version | Purpose                                |
|------------|------------------|---------------------------------------|
| Python     | 3.11             | Backend runtime                       |
| Node.js    | 20               | Frontend dev server / build           |
| Ollama     | 0.1.40           | Local LLM + embedding runtime         |
| TeX Live   | 2024+            | `pdflatex` for the institutional PDF  |
| OS         | Linux / macOS    | Tested on Fedora 44 (kernel 7.0.x)    |

You will also need **~10 GB of disk** for the two Ollama models.

---

## Installation

### 1 — Pull the Ollama models

```bash
ollama serve &                  # starts the daemon on :11434
ollama pull llama3.1:8b         # ~4.7 GB
ollama pull nomic-embed-text    # ~270 MB
```

### 2 — Install TeX Live (Fedora)

```bash
sudo dnf install -y \
  texlive-scheme-basic \
  texlive-collection-latexextra \
  texlive-collection-fontsrecommended
```

On Debian/Ubuntu: `sudo apt install texlive-latex-extra texlive-fonts-recommended`.
On macOS: `brew install --cask mactex-no-gui`.

Verify: `pdflatex --version` should print a banner.

### 3 — Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn httpx pydantic chromadb pymupdf
```

(There is no `requirements.txt` yet — the line above is the canonical set.)

### 4 — Frontend

```bash
cd frontend
npm install
```

---

## Running TrustNode

Open three terminals.

```bash
# Terminal 1 — Ollama daemon
ollama serve

# Terminal 2 — FastAPI backend (auto-reload)
cd backend && source venv/bin/activate
python main.py
# → http://localhost:8000  (Swagger UI at /docs)

# Terminal 3 — Vite frontend
cd frontend
npm run dev
# → http://localhost:5173
```

Visit `http://localhost:5173`, hit **Upload**, drop your PDFs, pick one or more
standards, choose the report language, run the audit. Once the Overview lights
up, hit **Generate** on the Executive Summary card and then
**Export Report (PDF) → Download PDF**.

---

## How the pipeline works

### Ingestion (`backend/ingestion.py`)

1. PDFs arrive as `multipart/form-data` at `POST /api/v1/ingest`.
2. Pages are extracted with PyMuPDF.
3. Each page is chunked with character-based windows and overlap.
4. Every chunk is embedded by `nomic-embed-text` via Ollama
   (`POST /api/embeddings`).
5. Chunks + embeddings + metadata (filename, page, ord) are upserted into the
   `trustnode_evidence` Chroma collection persisted at `backend/chroma_db/`.

### Audit (`backend/evaluator.py`)

For each control in the selected standard (`StandardSchema` from
`schemas.py`):

1. `query_evidence(search_keywords)` runs a vector search on Chroma and
   returns the top-N chunks as one concatenated evidence string.
2. `evaluate_control()` posts a fully-rendered prompt to
   `llama3.1` with `format=json` and parses the response into an
   `AuditResult` (`status`, `evidence_found`, `gaps`, `recommendation`).
3. The status maps to a risk level via `_STATUS_TO_RISK` and is wrapped into
   the canonical `AuditResult` schema.
4. `run_audit()` aggregates per-control results into an `AuditResponse` with
   `global_score_percentage = compliant / total × 100`.

The system prompt (`AUDIT_SYSTEM_PROMPT`) instructs the model to:

- Use **only** the supplied evidence (no external knowledge).
- Evaluate semantically (synonyms, examples) not literally.
- Prefer "Non-Compliant" over "Partial" over "Compliant" when in doubt.
- Output exactly one strict JSON object.

A single retry is attempted on any parsing/HTTP error before falling back to
a safe "Non-Compliant" verdict.

### Executive summary (`backend/evaluator.py`)

`POST /api/v1/summary` accepts an `AuditResponse` plus a `language` field
("English", "Spanish", "French", "German", "Portuguese"). The system prompt
template is parameterised:

> You are a Senior Cybersecurity Auditor … Write the entire response in
> {language}. Use at most 3 paragraphs, plain text only.

Result: a deliverable-quality narrative whose language matches whatever the
operator selected at upload time.

### LaTeX PDF export (`backend/latex_report.py`)

`POST /api/v1/export/pdf` accepts the full report payload (`standard_name`,
`compliance_score`, findings, `executive_summary`).

1. Every user-provided string is escaped through `tex_escape()` which neutralises
   `% $ & _ # { } ~ ^ \` so injected payloads cannot break the compile.
2. `build_report_tex()` renders a self-contained LaTeX source:
   - `\documentclass[11pt,a4paper]{article}` + `geometry` (1in margins).
   - Corporate palette via `xcolor` — `tnEmerald` (Compliant), `tnAmber`
     (Partial), `tnCrimson` (Non-Compliant), `tnDark`, `tnGray`.
   - Cover header with **TRUSTNODE AUTOMATED COMPLIANCE REPORT**, date,
     audited standard, and a giant Trust Score in a `tcolorbox`.
   - Section 1 — Executive Summary (rendered paragraphs).
   - Section 2 — Detailed Findings: one breakable `tcolorbox` per control,
     status-colored frame/background, plus Evidence / Gap / Recommendation
     rows. Findings are sorted Non-Compliant → Partial → Compliant.
3. `render_pdf()` writes `report.tex` into a `tempfile.TemporaryDirectory()`,
   shells out to `pdflatex -interaction=nonstopmode -halt-on-error` (60 s
   timeout) and returns the raw PDF bytes.
4. The endpoint streams them back as
   `application/pdf` with
   `Content-Disposition: attachment; filename="TrustNode_Audit_Report.pdf"`.

If compilation fails the API returns HTTP 502 with the tail of the
`pdflatex` log in the `detail` field, so failures are debuggable from the
browser console.

---

## HTTP API reference

Base URL: `http://localhost:8000`

| Method | Path                     | Purpose                                                  |
|--------|--------------------------|----------------------------------------------------------|
| GET    | `/api/v1/status`         | Health check — verifies Ollama + lists installed models  |
| POST   | `/api/v1/ingest`         | Upload one or more PDFs into the vector store            |
| POST   | `/api/v1/audit`          | Run an audit against a normative standard                |
| POST   | `/api/v1/summary`        | LLM-generated executive summary (language-aware)         |
| POST   | `/api/v1/export/pdf`     | Compile and download the institutional PDF report        |
| POST   | `/api/v1/clear_db`       | Wipe the vector collection                               |

Swagger UI: `http://localhost:8000/docs`.

### Sample: run an audit

```bash
curl -X POST http://localhost:8000/api/v1/audit \
  -H "Content-Type: application/json" \
  -d '{
    "standard_name": "ISO 27001",
    "domain": "Information Security",
    "controls": [{
      "control_id": "A.5.1",
      "title": "Information Security Policies",
      "description": "Security policies must be defined, approved by management, published and communicated to all employees.",
      "search_keywords": ["security policy","approval","communication"]
    }]
  }'
```

### Sample: export PDF

```bash
curl -X POST http://localhost:8000/api/v1/export/pdf \
  -H "Content-Type: application/json" \
  -d @audit_payload.json \
  --output TrustNode_Audit_Report.pdf
```

---

## Frontend feature tour

| Surface                  | Component                          | Behaviour                                                                                  |
|--------------------------|-------------------------------------|--------------------------------------------------------------------------------------------|
| Sidebar / Topbar         | `Sidebar`, `Topbar`                | Navigation + Ollama health pill                                                            |
| Upload flow              | `UploadModal`                      | Drag-drop PDFs, pick built-in/custom standards, choose report language, kick off ingest + sequential audits |
| Overview hero            | `TrustHero`, `StandardsCard`       | Animated Trust Score ring + active standards summary                                       |
| Heatmap                  | `ComplianceHeatmap`                | One row per standard, one cell per control colored by verdict                              |
| Latest Findings          | `FindingsCard`                     | Expandable list ordered by severity (critical → warning → pass)                            |
| Executive Summary        | `ExecutiveSummary`                 | "Generate" calls `/api/v1/summary` in the report language; pulse skeleton during inference |
| Export Report            | `ReportPreviewModal`               | Preview, then POST to `/api/v1/export/pdf` and trigger a browser download of the blob       |
| Reports library          | `ReportsPage`                      | Persisted history (localStorage); re-opening restores the audit and its language           |
| Documents library        | `DocumentsPage`                    | Tracks every ingested PDF so subsequent audits can reuse them without re-uploading         |

All persistent state (documents, reports, custom standards, language) is
serialised through `AppStateContext` into `localStorage` under
`trustnode.state.v1`.

---

## Supported standards

Built-in cartridges in `frontend/src/data/standards.ts`:

- ISO 27001 — Information Security
- ISO 9001 — Quality Management
- ISO 14001 — Environmental Management
- ISO 45001 — Occupational Health & Safety
- GDPR — Data Protection & Privacy
- SOC 2 — Service Organization Controls

Each cartridge is a list of `ControlSchema` objects with `control_id`,
`title`, `description`, and `search_keywords` used for retrieval. Adding a
new standard is a matter of dropping another entry into
`STANDARD_DEFINITIONS` — the rest of the pipeline is fully cartridge-driven.

Users can also upload custom cartridges via the Documents page; they are
persisted alongside the built-ins.

---

## Configuration

The backend reads two constants you may want to tune in `main.py` and
`evaluator.py`:

| Constant                  | Default                         | Where             |
|---------------------------|---------------------------------|-------------------|
| `OLLAMA_BASE_URL`         | `http://localhost:11434`        | `main.py`         |
| `OLLAMA_TIMEOUT_SECONDS`  | `5.0` (health-check only)       | `main.py`         |
| `OLLAMA_MODEL`            | `llama3.1`                      | `evaluator.py`    |
| `OLLAMA_TIMEOUT`          | `120` (inference)               | `evaluator.py`    |
| `MAX_PDF_SIZE_MB`         | `50`                            | `main.py`         |
| `PDFLATEX_TIMEOUT_SECONDS`| `60`                            | `latex_report.py` |
| `CHROMA_PATH`             | `./chroma_db`                   | `ingestion.py`    |

CORS is wide-open (`allow_origins=["*"]`) for hackathon convenience —
**restrict before any production deployment**.

---

## Troubleshooting

**`Ollama LLM not reachable`** — the `/status` endpoint returns
`ollama_alive: false`. Confirm `ollama serve` is running and that
`curl http://localhost:11434/api/tags` succeeds.

**Audit returns "Internal error during LLM inference or response parsing"** —
the LLM produced malformed JSON twice in a row. Check the backend logs;
usually a smaller `controls` batch or pulling a fresher `llama3.1:8b` fixes it.

**`pdflatex not found`** — install TeX Live (see [Installation](#installation)).
On Fedora the required packages are `texlive-scheme-basic`,
`texlive-collection-latexextra`, and `texlive-collection-fontsrecommended`.

**PDF compile error (HTTP 502)** — the `detail` field contains the tail of
the `pdflatex` log. The most common cause is missing fonts; install
`texlive-collection-fontsrecommended`.

**Stale findings between runs** — call `POST /api/v1/clear_db` (the
"Clear database" action on the Documents page) before a fresh ingestion to
ensure the retriever doesn't surface stale evidence.

---

## Roadmap

- Job-queue pattern for long audits (`POST /api/v1/audit` → `job_id` polling).
- Streaming token-by-token for the executive summary.
- Per-finding citations (page number, document) surfaced in the PDF.
- More cartridges: NIST CSF, HIPAA, PCI-DSS, ISO 42001 (AI management).
- Optional remote LLM provider behind a feature flag for organisations that
  prefer cloud inference.

---

## License

Internal hackathon project — license to be decided.
