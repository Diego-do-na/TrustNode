"""Load a standard from frontend/src/data/standards.ts via Node (type-stripping).

The TS file is the single source of truth, so tests read it instead of duplicating it.
"""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

STANDARDS_TS = Path(__file__).resolve().parents[2] / "frontend/src/data/standards.ts"


def node_available() -> bool:
    return shutil.which("node") is not None


def load_standard(name: str) -> dict:
    if not node_available():
        raise RuntimeError("node not found")
    with tempfile.TemporaryDirectory() as d:
        script = Path(d) / "dump.mjs"
        script.write_text(
            f'import {{ STANDARD_DEFINITIONS }} from {json.dumps(STANDARDS_TS.as_uri())};\n'
            f'console.log(JSON.stringify(STANDARD_DEFINITIONS[{json.dumps(name)}]));\n'
        )
        out = subprocess.run(["node", str(script)], capture_output=True, text=True, check=True, timeout=30)
    return json.loads(out.stdout)
