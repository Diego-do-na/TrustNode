"""Build tests/fixtures/judge_probe.json (labelled pairs for the second-pass probe).

(a) quotes recorded in 3 real runs (control_k5, per_check_k3, control_k6) on the Datagraphic
    policy, labelled by hand;
(b) invented examples (fictional organisations, NOT from the Datagraphic text).

Labels are hand-written judgements against the check question + hint in standards.ts.
`etiqueta_dudosa: true` marks cases where a reasonable reviewer could disagree; the probe
reports them but never uses them to decide.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TESTS = HERE.parent
sys.path.insert(0, str(TESTS.parent))
sys.path.insert(0, str(TESTS))

import ingestion  # noqa: E402
from evaluator import normalize_text, _compact  # noqa: E402
from standards_loader import load_standard  # noqa: E402

std = load_standard("ISO 27001")
CHECKS = {k["id"]: k for c in std["controls"] for k in c.get("checks", [])}

# chunks of the real PDF (to give each recorded quote its surrounding fragment)
PDF = TESTS / "fixtures" / "datagraphic_policy.pdf"
CHUNKS = ingestion.extract_text_chunks_with_metadata(str(PDF))


def fragment_of(quote: str) -> str:
    nq = normalize_text(quote)
    for c in CHUNKS:
        if nq in normalize_text(c.text) or _compact(nq) in _compact(normalize_text(c.text)):
            return c.text
    raise SystemExit(f"quote not found in any chunk: {quote!r}")


# (check_id, quote, label, dubious, origin, note)
RECORDED = [
 ("4.3.a", "A controlled document forming part of the Datagraphic ISO 27001 Information Security Management System (ISMS).", "sufficient", False, "grabado:per_check_k3", ""),
 ("4.3.a", "Datagraphic has an Information Security Management System (ISMS) to address the requirements of ISO 27001 and Pay.UK Standard 55 control objectives.", "sufficient", False, "grabado:control_k5,control_k6", ""),
 ("4.3.b", "Ensure our continued compliance with current UK laws, regulations and best practice guidelines.", "insufficient", False, "grabado:per_check_k3", "no entity named"),
 ("4.3.b", "• Effective for Datagraphic Limited and Datagraphic Group Limited (hereafter referred to as “Datagraphic”). •", "sufficient", True, "grabado:control_k5,control_k6", "names legal entities, but states where the POLICY is effective, not what the ISMS covers"),
 ("4.3.c", "Datagraphic has an Information Security Management System (ISMS) to address the requirements of ISO 27001 and Pay.UK Standard 55 control objectives.* (*Standard 55 applies at the Datagraphic production facility only).", "insufficient", True, "grabado:control_k5", "mentions a facility, but only as the extent of another standard, not the ISMS scope"),
 ("4.3.d", "Datagraphic has an Information Security Management System (ISMS) to address the requirements of ISO 27001 and Pay.UK Standard 55 control objectives.", "insufficient", False, "grabado:control_k6", "no system/service/process named"),
 ("4.3.d", "• Information will be protected against unauthorised access • Confidentiality of Information will be assured.", "insufficient", False, "grabado:control_k5", "general protection statements"),
 ("5.2.a", "The CEO & Managing Director have approved this Information Security Policy.", "insufficient", True, "grabado:control_k5,control_k6,per_check_k3", "approval of the policy, not the policy statement itself"),
 ("5.2.b", "2. Ensure our products and services remain available and secure.", "sufficient", False, "grabado:control_k5,control_k6", "an explicit objective"),
 ("5.2.b", "• Information will be protected against unauthorised access • Confidentiality of Information will be assured.2 • Integrity of Information will be maintained.3", "insufficient", True, "grabado:per_check_k3", "policy principles rather than objectives; arguable"),
 ("5.2.c", "Continue to comply with ISO 27001 controls according to our certified Statement of Applicability.", "sufficient", False, "grabado:control_k5,control_k6", "commitment to meet a standard's requirements"),
 ("5.2.c", "Ensure our continued compliance with current UK laws, regulations and best practice guidelines.", "sufficient", False, "grabado:per_check_k3", "commitment to meet legal requirements"),
 ("5.2.d", "8. Remain committed to the continual improvement of the Information Security Management System (ISMS).", "sufficient", False, "grabado:control_k5,per_check_k3", ""),
 ("5.2.d", "Objective 8 added: Commitment to Continual Improvement added.", "sufficient", True, "grabado:control_k6", "a change-log entry that mentions the commitment; not the commitment itself"),
 ("6.2.a", "2. Ensure our products and services remain available and secure.", "sufficient", False, "grabado:control_k5,control_k6", ""),
 ("6.2.a", "• Confidentiality of Information will be assured.2", "insufficient", True, "grabado:per_check_k3", "a policy principle, not an objective; arguable"),
 ("6.2.b", "Ensure our products and services remain available and secure.", "insufficient", False, "grabado:control_k5,control_k6", "no figure, deadline or named indicator"),
 ("6.2.b", "• Availability of Information is ensured as required by the business processes.", "insufficient", False, "grabado:per_check_k3", "no figure, deadline or named indicator"),
 ("6.2.c", "1. Ensure the protection of the confidential data under our control, including personally identifiable Information.", "insufficient", False, "grabado:per_check_k3", "no owner or evaluation frequency"),
 ("6.2.c", "6. Minimise the risk of security incidents by ensuring our employees understand their Information Security responsibilities.", "insufficient", False, "grabado:per_check_k3", "no owner or evaluation frequency"),
 ("6.2.c", "The CISO has responsibility for maintaining the Policy and providing advice and guidance on its implementation.", "insufficient", False, "grabado:control_k5,control_k6", "ownership of the policy document, not of the objectives (per the check's hint)"),
]

# (check_id, quote, label, dubious, fragment, note) — fictional organisations
SYNTH = [
 ("5.2.a", "Aldermoor Health Trust declares that the confidentiality, integrity and availability of patient information are a core duty of the Trust.", "sufficient", False,
  "Policy Statement. Aldermoor Health Trust declares that the confidentiality, integrity and availability of patient information are a core duty of the Trust. This statement is issued by the Board of Directors.", ""),
 ("5.2.a", "This document describes the information classification labels used in the Trust: Public, Internal and Restricted.", "insufficient", False,
  "Section 3. This document describes the information classification labels used in the Trust: Public, Internal and Restricted. Labels must be applied to every document at creation.", "descriptive text, no policy statement"),
 ("5.2.b", "Our information security objectives are: (1) no loss of patient records, (2) restore critical systems after an outage, (3) train all clinical staff.", "sufficient", False,
  "Objectives. Our information security objectives are: (1) no loss of patient records, (2) restore critical systems after an outage, (3) train all clinical staff. Objectives are reviewed by the Board.", ""),
 ("5.2.b", "The Trust takes information security very seriously and expects all staff to act responsibly.", "insufficient", False,
  "Introduction. The Trust takes information security very seriously and expects all staff to act responsibly. Further guidance is available from the Digital team.", "no objectives or framework"),
 ("5.2.c", "We commit to meeting all applicable data protection laws and our contractual obligations to commissioners.", "sufficient", False,
  "Commitments. We commit to meeting all applicable data protection laws and our contractual obligations to commissioners. Breaches are reported to the Board.", ""),
 ("5.2.c", "Staff must read the data protection handbook before they are given access to patient systems.", "insufficient", False,
  "Access. Staff must read the data protection handbook before they are given access to patient systems. Access is granted by the line manager.", "related rule, but no commitment to satisfy requirements"),
 ("5.2.d", "The Trust is committed to continually improving its information security controls and management system.", "sufficient", False,
  "Improvement. The Trust is committed to continually improving its information security controls and management system. Lessons from incidents are shared quarterly.", ""),
 ("5.2.d", "Security controls are reviewed after each external audit and the findings are filed.", "insufficient", False,
  "Review. Security controls are reviewed after each external audit and the findings are filed. The audit report is stored on the intranet.", "a review practice, no commitment to improve"),
 ("4.3.a", "This procedure is part of the Northwind Information Security Management System.", "sufficient", False,
  "Document control. This procedure is part of the Northwind Information Security Management System. It is owned by the Head of Security.", ""),
 ("4.3.a", "Northwind is certified to ISO 9001 for its quality management system.", "insufficient", False,
  "Certifications. Northwind is certified to ISO 9001 for its quality management system. The certificate is renewed every three years.", "a different management system"),
 ("4.3.b", "The ISMS covers Northwind Logistics GmbH and its subsidiaries Northwind Freight BV and Northwind Cold Chain Ltd.", "sufficient", False,
  "Scope. The ISMS covers Northwind Logistics GmbH and its subsidiaries Northwind Freight BV and Northwind Cold Chain Ltd. Joint ventures are excluded.", ""),
 ("4.3.b", "Northwind Logistics is a leading provider of road freight across Europe.", "insufficient", False,
  "About us. Northwind Logistics is a leading provider of road freight across Europe. Founded in 1994, it employs 2,300 people.", "names a company but says nothing about ISMS coverage"),
 ("4.3.c", "The scope includes the head office in Rotterdam and the distribution centres in Lyon and Gdansk.", "sufficient", False,
  "Scope. The scope includes the head office in Rotterdam and the distribution centres in Lyon and Gdansk. Customer sites are out of scope.", ""),
 ("4.3.c", "Northwind operates 14 distribution centres across 9 countries.", "insufficient", False,
  "About us. Northwind operates 14 distribution centres across 9 countries. Volumes grew by 8% last year.", "describes the business, names no covered site"),
 ("4.3.d", "In scope are the warehouse management system, the fleet telematics platform and the customer booking portal.", "sufficient", False,
  "Scope. In scope are the warehouse management system, the fleet telematics platform and the customer booking portal. The corporate intranet is out of scope.", ""),
 ("4.3.d", "Information systems are critical to our operations and must be protected at all times.", "insufficient", False,
  "Introduction. Information systems are critical to our operations and must be protected at all times. Everyone has a part to play.", "general statement, no systems named"),
 ("6.2.b", "Objective 2: restore the booking portal within 4 hours of an outage (RTO 4h), measured quarterly.", "sufficient", False,
  "Objectives. Objective 1: no personal data breach reported to the regulator. Objective 2: restore the booking portal within 4 hours of an outage (RTO 4h), measured quarterly.", ""),
 ("6.2.b", "Target: fewer than 5 high-severity incidents per year.", "sufficient", False,
  "Targets. Target: fewer than 5 high-severity incidents per year. Results are published in the annual report.", ""),
 ("6.2.b", "We aim to keep our systems secure and reliable for our customers.", "insufficient", False,
  "Aims. We aim to keep our systems secure and reliable for our customers. We value their trust.", "same topic, no figure or indicator"),
 ("6.2.b", "Objective 3: improve staff awareness of phishing and social engineering.", "insufficient", False,
  "Objectives. Objective 3: improve staff awareness of phishing and social engineering. Objective 4: strengthen supplier oversight.", "same topic, no figure or indicator"),
 ("6.2.c", "The Head of Security owns objectives 1 to 3 and reports progress to the Board every quarter.", "sufficient", False,
  "Governance. The Head of Security owns objectives 1 to 3 and reports progress to the Board every quarter. The Board may revise the objectives.", ""),
 ("6.2.c", "The Information Security Policy is reviewed by the Head of Security each year.", "insufficient", True,
  "Document control. The Information Security Policy is reviewed by the Head of Security each year. Previous versions are archived.", "review of the policy document, not of progress on the objectives; arguable"),
]

items = []
for i, (cid, q, lab, dub, origin, note) in enumerate(RECORDED, 1):
    items.append({"id": f"R{i:02d}", "check_id": cid, "condicion": CHECKS[cid]["question"], "hint": CHECKS[cid].get("hint"),
                  "cita": q, "fragmento": fragment_of(q), "etiqueta": lab, "etiqueta_dudosa": dub, "origen": origen if (origen := origin) else "", "nota": note})
for i, (cid, q, lab, dub, frag, note) in enumerate(SYNTH, 1):
    assert q in frag, q
    items.append({"id": f"S{i:02d}", "check_id": cid, "condicion": CHECKS[cid]["question"], "hint": CHECKS[cid].get("hint"),
                  "cita": q, "fragmento": frag, "etiqueta": lab, "etiqueta_dudosa": dub, "origen": "sintetico", "nota": note})

out = TESTS / "fixtures" / "judge_probe.json"
out.write_text(json.dumps(items, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"wrote {len(items)} items -> {out}")
