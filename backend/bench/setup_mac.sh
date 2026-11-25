#!/usr/bin/env bash
# Prepara una Mac (Apple Silicon) para correr el benchmark de TrustNode.
# Uso (desde la raíz del repo):   bash backend/bench/setup_mac.sh [modelos...]
# Ejemplo:                         bash backend/bench/setup_mac.sh llama3.1:8b qwen2.5:7b llama3.2:3b
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
MODELS=("$@")
[ ${#MODELS[@]} -eq 0 ] && MODELS=(llama3.1:8b qwen2.5:7b llama3.2:3b gemma3:4b)

need() { command -v "$1" >/dev/null 2>&1; }

echo "== Hardware"
sysctl -n hw.model machdep.cpu.brand_string
echo "RAM: $(( $(sysctl -n hw.memsize) / 1073741824 )) GB"

if ! need brew; then
  echo "Falta Homebrew: https://brew.sh" >&2; exit 1
fi

echo "== Dependencias (python 3.13, node, ollama)"
# Python 3.13: chromadb -> onnxruntime todavía no publica ruedas para 3.15.
need python3.13 || brew install python@3.13
need node || brew install node
need ollama || brew install ollama

if ! curl -sf localhost:11434/api/version >/dev/null; then
  echo "Arrancando Ollama…"
  (brew services start ollama || (nohup ollama serve >/tmp/ollama.log 2>&1 &)) >/dev/null
  for _ in $(seq 1 30); do curl -sf localhost:11434/api/version >/dev/null && break; sleep 1; done
fi
echo "Ollama $(curl -s localhost:11434/api/version)"

echo "== venv del backend"
if [ ! -x "$BACKEND/.venv/bin/python" ]; then
  python3.13 -m venv "$BACKEND/.venv"
fi
"$BACKEND/.venv/bin/pip" install -q -r "$BACKEND/requirements.txt"

echo "== Modelos"
ollama pull nomic-embed-text
for m in "${MODELS[@]}"; do ollama pull "$m"; done

echo "== Tests offline"
(cd "$BACKEND" && .venv/bin/python -m pytest -q)

cat <<EOF

Listo. Siguiente paso (ver backend/bench/README.md):
  cd backend
  .venv/bin/python bench/run_bench.py --models $(IFS=,; echo "${MODELS[*]}") --repeats 2
EOF
