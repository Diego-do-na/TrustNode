"""latex_report.py — Build and compile an institutional TrustNode audit report.

Pipeline: ExportPdfRequest → LaTeX source → pdflatex → PDF bytes.

The LaTeX template is intentionally self-contained (no external resources) so
it compiles in any TeX Live environment with `latex-extra` + `fonts-recommended`.
"""

from __future__ import annotations

import logging
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

from schemas import ExportPdfRequest, ExportFinding

logger = logging.getLogger(__name__)

PDFLATEX_BIN = "pdflatex"
PDFLATEX_TIMEOUT_SECONDS = 60

# ---------------------------------------------------------------------------
# LaTeX escaping — every user-supplied string is funneled through here before
# being interpolated into the template.
# ---------------------------------------------------------------------------

_LATEX_SPECIALS: dict[str, str] = {
    "\\": r"\textbackslash{}",
    "{": r"\{",
    "}": r"\}",
    "$": r"\$",
    "&": r"\&",
    "%": r"\%",
    "#": r"\#",
    "_": r"\_",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}

_LATEX_SPECIALS_RE = re.compile(
    "|".join(re.escape(k) for k in sorted(_LATEX_SPECIALS, key=len, reverse=True))
)


def tex_escape(text: str | None) -> str:
    """Escape LaTeX specials so arbitrary text can be safely interpolated."""
    if not text:
        return ""
    return _LATEX_SPECIALS_RE.sub(lambda m: _LATEX_SPECIALS[m.group(0)], text)


# ---------------------------------------------------------------------------
# Per-status styling (frame and tint colours for tcolorbox).
# ---------------------------------------------------------------------------

_STATUS_STYLE: dict[str, tuple[str, str, str]] = {
    # status_lower → (frame_color, background_color, label_color)
    "compliant":      ("tnEmerald", "tnEmerald!8",  "tnEmerald!80!black"),
    "partial":        ("tnAmber",   "tnAmber!10",   "tnAmber!80!black"),
    "non-compliant":  ("tnCrimson", "tnCrimson!8",  "tnCrimson!80!black"),
}

_FALLBACK_STYLE = ("tnGray", "tnGray!8", "tnGray!80!black")


def _style_for(status: str) -> tuple[str, str, str]:
    return _STATUS_STYLE.get((status or "").strip().lower(), _FALLBACK_STYLE)


def _is_meaningful(value: str | None) -> bool:
    if not value:
        return False
    v = value.strip().lower()
    return v not in {"", "none", "null", "n/a"}


# ---------------------------------------------------------------------------
# LaTeX preamble — colours, packages, and the cover/heading macros.
# ---------------------------------------------------------------------------

_PREAMBLE = r"""
\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{tgheros}
\renewcommand{\familydefault}{\sfdefault}
\usepackage[a4paper,margin=1in]{geometry}
\usepackage{xcolor}
\usepackage[skins,breakable]{tcolorbox}
\usepackage{parskip}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage{fancyhdr}
\usepackage{hyperref}

\definecolor{tnDark}{HTML}{1F2937}
\definecolor{tnGray}{HTML}{6B7280}
\definecolor{tnEmerald}{HTML}{10B981}
\definecolor{tnCrimson}{HTML}{DC2626}
\definecolor{tnAmber}{HTML}{F59E0B}
\definecolor{tnInk}{HTML}{111827}

\hypersetup{
  colorlinks=true,
  linkcolor=tnDark,
  urlcolor=tnDark,
  pdftitle={TrustNode Compliance Report},
  pdfauthor={TrustNode}
}

\color{tnInk}

\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\fancyfoot[L]{\small\color{tnGray} TrustNode — Automated compliance report}
\fancyfoot[R]{\small\color{tnGray} Page \thepage}

\titleformat{\section}{\Large\bfseries\color{tnDark}}{}{0pt}{}
\titlespacing*{\section}{0pt}{18pt}{8pt}

\setlist[itemize]{leftmargin=*,itemsep=2pt,topsep=2pt}
"""


# ---------------------------------------------------------------------------
# Template builders.
# ---------------------------------------------------------------------------


def _cover_block(req: ExportPdfRequest) -> str:
    generated = tex_escape(req.generated_at or datetime.now().strftime("%Y-%m-%d %H:%M"))
    standard = tex_escape(req.standard_name)
    score_int = int(round(req.compliance_score))

    if score_int >= 80:
        score_color = "tnEmerald"
    elif score_int >= 60:
        score_color = "tnAmber"
    else:
        score_color = "tnCrimson"

    return rf"""
\begin{{center}}
{{\color{{tnGray}}\footnotesize\textsc{{TrustNode}}\par}}
\vspace{{4pt}}
{{\LARGE\bfseries\color{{tnDark}} TRUSTNODE AUTOMATED COMPLIANCE REPORT\par}}
\vspace{{6pt}}
{{\color{{tnGray}}\small Generated {generated} \quad\textbar\quad Standard: \textbf{{{standard}}}\par}}
\end{{center}}

\vspace{{4pt}}
{{\color{{tnGray}}\hrule height 0.6pt}}
\vspace{{18pt}}

\begin{{tcolorbox}}[
  enhanced,
  colback={score_color}!8,
  colframe={score_color},
  boxrule=0.8pt,
  arc=4pt,
  left=18pt, right=18pt, top=14pt, bottom=14pt,
]
\begin{{minipage}}{{0.55\textwidth}}
  {{\color{{tnGray}}\footnotesize\textsc{{Trust Score}}\par}}
  \vspace{{4pt}}
  {{\color{{tnGray}}\small Overall compliance posture against the audited standard.}}
\end{{minipage}}\hfill
\begin{{minipage}}{{0.4\textwidth}}\raggedleft
  {{\fontsize{{48}}{{52}}\selectfont\bfseries\color{{{score_color}}}{score_int}\,\textnormal{{\Large /100}}\par}}
\end{{minipage}}
\end{{tcolorbox}}
"""


def _executive_summary_block(summary: str | None) -> str:
    if not _is_meaningful(summary):
        body = (
            r"{\color{tnGray}\itshape No executive summary was generated for this report.}"
        )
    else:
        paragraphs = [
            tex_escape(p.strip())
            for p in re.split(r"\n{2,}|\r\n{2,}", summary or "")
            if p.strip()
        ]
        if not paragraphs:
            paragraphs = [tex_escape((summary or "").strip())]
        body = "\n\n".join(paragraphs)

    return rf"""
\section*{{1. Executive Summary}}
\begin{{tcolorbox}}[
  enhanced,
  colback=tnGray!5,
  colframe=tnGray!30,
  boxrule=0.4pt,
  arc=3pt,
  left=14pt, right=14pt, top=12pt, bottom=12pt,
]
{body}
\end{{tcolorbox}}
"""


def _finding_block(finding: ExportFinding) -> str:
    frame, back, label = _style_for(finding.status)
    standard = tex_escape(finding.standard) or tex_escape("")
    control_id = tex_escape(finding.control_id or "")
    status = tex_escape(finding.status or "")
    risk = tex_escape(finding.risk_level or "")

    rows: list[str] = []
    if _is_meaningful(finding.evidence_found):
        rows.append(
            rf"\textbf{{\color{{tnDark}}Evidence:}} {tex_escape(finding.evidence_found)} \\[2pt]"
        )
    if _is_meaningful(finding.gaps):
        rows.append(
            rf"\textbf{{\color{{tnDark}}Gap:}} {tex_escape(finding.gaps)} \\[2pt]"
        )
    if _is_meaningful(finding.recommendation):
        rows.append(
            rf"\textbf{{\color{{tnDark}}Recommendation:}} {tex_escape(finding.recommendation)}"
        )
    body = "\n".join(rows) if rows else r"{\color{tnGray}\itshape No further details provided.}"

    heading_left = (
        rf"{{\color{{tnGray}}\footnotesize\textsc{{{standard}}}\par}}"
        if standard else ""
    )

    risk_suffix = rf" \quad\textbar\quad Risk: {risk}" if risk else ""

    return rf"""
\begin{{tcolorbox}}[
  enhanced, breakable,
  colback={back},
  colframe={frame},
  boxrule=0.5pt,
  arc=3pt,
  left=14pt, right=14pt, top=10pt, bottom=10pt,
  before skip=8pt, after skip=8pt,
]
{heading_left}
{{\bfseries\color{{tnDark}}{control_id}}} \quad\textbar\quad {{\color{{{label}}}\bfseries {status}}}{risk_suffix}
\par\vspace{{6pt}}
{body}
\end{{tcolorbox}}
"""


def _findings_section(findings: list[ExportFinding]) -> str:
    if not findings:
        return (
            r"\section*{2. Detailed Findings}" "\n"
            r"{\color{tnGray}\itshape No findings were submitted for this report.}"
        )

    # Order: Non-Compliant first, then Partial, then Compliant.
    order = {"non-compliant": 0, "partial": 1, "compliant": 2}
    sorted_findings = sorted(
        findings,
        key=lambda f: order.get((f.status or "").strip().lower(), 99),
    )

    blocks = "\n".join(_finding_block(f) for f in sorted_findings)
    return rf"""
\section*{{2. Detailed Findings}}
{blocks}
"""


def build_report_tex(req: ExportPdfRequest) -> str:
    """Render the full LaTeX source for the report."""
    body = (
        _cover_block(req)
        + _executive_summary_block(req.executive_summary)
        + _findings_section(req.findings)
    )
    return _PREAMBLE + "\n\\begin{document}\n" + body + "\n\\end{document}\n"


# ---------------------------------------------------------------------------
# Compilation.
# ---------------------------------------------------------------------------


def render_pdf(req: ExportPdfRequest) -> bytes:
    """Compile the report and return the raw PDF bytes.

    Raises RuntimeError with the tail of the pdflatex log on failure.
    """
    tex_source = build_report_tex(req)

    with tempfile.TemporaryDirectory(prefix="trustnode_pdf_") as tmpdir:
        workdir = Path(tmpdir)
        tex_path = workdir / "report.tex"
        tex_path.write_text(tex_source, encoding="utf-8")

        try:
            proc = subprocess.run(
                [
                    PDFLATEX_BIN,
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "-output-directory",
                    str(workdir),
                    str(tex_path),
                ],
                cwd=workdir,
                capture_output=True,
                timeout=PDFLATEX_TIMEOUT_SECONDS,
                text=True,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "pdflatex not found. Install TeX Live (texlive-scheme-basic + "
                "texlive-collection-latexextra) and try again."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                f"pdflatex timed out after {PDFLATEX_TIMEOUT_SECONDS}s."
            ) from exc

        pdf_path = workdir / "report.pdf"
        if proc.returncode != 0 or not pdf_path.exists():
            log_path = workdir / "report.log"
            log_tail = ""
            if log_path.exists():
                log_tail = log_path.read_text(encoding="utf-8", errors="replace")[-1500:]
            else:
                log_tail = (proc.stdout or "") + (proc.stderr or "")
            logger.error("pdflatex failed (rc=%s). Log tail:\n%s", proc.returncode, log_tail)
            raise RuntimeError(f"pdflatex failed: {log_tail.strip()[-800:]}")

        return pdf_path.read_bytes()
