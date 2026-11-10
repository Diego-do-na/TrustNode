"""Probe: how well does each 'second pass' separate sufficient from insufficient citations?

Uses the SAME Ollama call and options as production (evaluator._call_ollama,
OLLAMA_OPTIONS). Does not modify the pipeline. Prompts below are written once and are
NOT tuned against the results.

Variants (a pair = condition + cited quote that the first pass already accepted as 'found'):
  base : accept everything the first pass marked found
  A    : second pass sees ONLY the quote and the condition -> yes/no
  B    : first pass is re-run on the fragment and must also return `matched_part`;
         accepted iff found, quote verified in the fragment, matched_part non-empty and
         a substring of that quote
  C    : lexical anchor for 6.2.b only (derived from the meaning of "measurable" in ISO 27001
         6.2, not from any document): a figure/digit, %, or a deadline/indicator word
  A+C  : A, then C on 6.2.b
  B+A  : B, then A applied to B's matched_part

Usage: judge_probe.py --out results.json
"""
import argparse
import json
import re
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
TESTS = HERE.parent
sys.path.insert(0, str(TESTS.parent))

import evaluator  # noqa: E402  (read-only use)
from evaluator import normalize_text, verify_quote, _call_ollama  # noqa: E402

A_SYSTEM = """
You judge whether ONE quoted passage, taken entirely by itself, satisfies ONE condition.
You see only the passage and the condition.

RULES:
1. Answer "yes" only if the passage explicitly states what the condition asks for.
2. Being on the same topic is not enough. A passage that is more general, weaker, or about
   something adjacent does not satisfy the condition. Examples from other domains:
   - Condition: "Does the document state a retention period for personal data?"
     Passage: "Personal data is kept only as long as necessary."  -> "no"
   - Condition: "Does the document name who investigates workplace accidents?"
     Passage: "The Health and Safety Manager investigates every workplace accident." -> "yes"
3. A paraphrase with the same meaning is acceptable; an inference is not.
4. If you are unsure, answer "no".
5. Respond with a single valid JSON object and NOTHING ELSE: {"verdict": "yes" | "no"}
""".strip()

_OLD_SCHEMA = '{"answer": "found" | "not_found", "citations": [{"chunk_id": "E2", "quote": "<exact text>"}]}'
_NEW_SCHEMA = ('{"answer": "found" | "not_found", "citations": [{"chunk_id": "E2", '
               '"quote": "<exact text>", "matched_part": "<exact words of the quote that satisfy the condition>"}]}')
assert _OLD_SCHEMA in evaluator.CHECK_SYSTEM_PROMPT
B_SYSTEM = evaluator.CHECK_SYSTEM_PROMPT.replace(_OLD_SCHEMA, _NEW_SCHEMA) + (
    '\n8. In every citation also return "matched_part": the exact, contiguous words of the quote '
    "that satisfy the condition. It must be a non-empty substring of the quote. If no part of "
    'the quote satisfies the condition, answer "not_found" instead.'
)

# C — derived from what "measurable" means in ISO 27001 6.2 (a figure/percentage/deadline, or a
# named indicator such as KPI/SLA/RTO/RPO). NOT derived from any PDF.
C_ANCHOR = re.compile(
    r"\d|%|percent|per cent|\bkpi\b|\bsla\b|\brto\b|\brpo\b|metric|indicator|target|deadline",
    re.I,
)


def c_ok(item: dict, text: str) -> bool:
    if item["check_id"] != "6.2.b":
        return True            # C only exists for 6.2.b
    return bool(C_ANCHOR.search(text))


def call(prompt: str) -> tuple[str, float, int | None]:
    """Same call as production, but also returns timing and token count."""
    import httpx
    payload = {"model": evaluator.OLLAMA_MODEL, "prompt": prompt, "format": "json",
               "stream": False, "options": dict(evaluator.OLLAMA_OPTIONS)}
    t = time.time()
    with httpx.Client(timeout=evaluator.OLLAMA_TIMEOUT) as c:
        r = c.post(evaluator.OLLAMA_URL, json=payload)
        r.raise_for_status()
    j = r.json()
    return j["response"], round(time.time() - t, 2), j.get("eval_count")


def judge_A(condition: str, passage: str) -> dict:
    prompt = f'{A_SYSTEM}\n\nCONDITION: {condition}\nPASSAGE: "{passage}"\n\nDoes the passage, by itself, satisfy the condition? Respond in JSON.'
    raw, secs, ntok = call(prompt)
    try:
        verdict = str(json.loads(raw).get("verdict", "")).strip().lower()
    except Exception:  # noqa: BLE001
        verdict = "parse_error"
    return {"verdict": verdict, "yes": verdict == "yes", "secs": secs, "eval_count": ntok, "raw": raw}


def run_B(item: dict) -> dict:
    chunk = {"id": "probe", "source": "probe", "page": "?", "text": item["fragmento"]}
    check = {"id": item["check_id"], "question": item["condicion"], "hint": item.get("hint")}
    control = {"control_id": "PROBE", "title": "probe"}
    msg = evaluator.build_check_message("probe", control, check, [chunk])
    raw, secs, ntok = call(f"{B_SYSTEM}\n\n{msg}")
    out = {"secs": secs, "eval_count": ntok, "raw": raw, "accepted": False, "matched_part": "",
           "whole_quote": False, "same_quote_as_pair": False}
    try:
        data = json.loads(raw)
    except Exception:  # noqa: BLE001
        out["reason"] = "parse_error"
        return out
    if str(data.get("answer", "")).strip().lower() != "found":
        out["reason"] = "first_pass_not_found"
        return out
    for c in data.get("citations", []) or []:
        quote, mp = str(c.get("quote", "")), str(c.get("matched_part", "")).strip()
        if str(c.get("chunk_id", "")).strip().upper().strip("[]") != "E1":
            continue
        if not verify_quote(quote, item["fragmento"]):
            continue
        if mp and normalize_text(mp) in normalize_text(quote):
            out.update(accepted=True, matched_part=mp, quote=quote,
                       whole_quote=normalize_text(mp) == normalize_text(quote),
                       same_quote_as_pair=normalize_text(quote) == normalize_text(item["cita"]))
            return out
    out["reason"] = "no_verified_citation_with_valid_matched_part"
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--probe", default=str(TESTS / "fixtures" / "judge_probe.json"))
    args = ap.parse_args()
    items = json.loads(Path(args.probe).read_text(encoding="utf-8"))

    rows = []
    for it in items:
        a = judge_A(it["condicion"], it["cita"])
        b = run_B(it)
        ba = judge_A(it["condicion"], b["matched_part"]) if b["accepted"] else None
        rows.append({"id": it["id"], "check_id": it["check_id"], "etiqueta": it["etiqueta"],
                     "dudosa": it["etiqueta_dudosa"], "origen": it["origen"], "cita": it["cita"], "A": a, "B": b, "BA": ba})
        print(f'{it["id"]} {it["check_id"]:6s} {it["etiqueta"]:12s}{"?" if it["etiqueta_dudosa"] else " "} A={a["verdict"]:5s} B={"acc" if b["accepted"] else "rej"}', flush=True)

    for r, it in zip(rows, items):
        base = True
        r["accept"] = {
            "base": base,
            "A": r["A"]["yes"],
            "B": r["B"]["accepted"],
            "C": c_ok(it, it["cita"]),
            "A+C": r["A"]["yes"] and c_ok(it, it["cita"]),
            "B+A": bool(r["BA"] and r["BA"]["yes"]),
        }
    Path(args.out).write_text(json.dumps({"rows": rows}, indent=1, ensure_ascii=False), encoding="utf-8")
    print("saved", args.out)


if __name__ == "__main__":
    main()
