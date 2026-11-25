import type { AuditRequest } from "../api/client";

/**
 * Tipos de documento. Un control con `applies_to` solo se evalua si el tipo del
 * documento esta en esa lista; si no, el resultado es "not_evaluable" y no cuenta en el score.
 * Los controles SIN `applies_to` se consideran siempre evaluables (compatibilidad).
 *
 * Agrega estos campos opcionales al tipo de control en ../api/client.ts:
 *   applies_to?: DocType[];
 *   legacy_id?: string;   // numeracion ISO 27001:2013, solo trazabilidad
 */
export type DocType = "isms_policy" | "topic_policy" | "procedure" | "soa";

export const STANDARD_DEFINITIONS: Record<string, AuditRequest> = {
  "ISO 27001": {
    standard_name: "ISO 27001",
    domain: "Information Security",
    controls: [
      // ---------- Cláusulas del SGSI ----------
      {
        control_id: "5.2",
        title: "Information security policy (clause)",
        description:
          "Does the document state a policy appropriate to the organization that includes objectives or a framework for setting them, a commitment to satisfy applicable requirements, and a commitment to continual improvement?",
        search_keywords: ["policy", "objectives", "commitment", "applicable requirements", "continual improvement"],
        applies_to: ["isms_policy"],
        // NOTE (deliberate omission): ISO 27001 cl. 5.2(a) also requires the policy to be
        // "appropriate to the purpose of the organization". That is a judgement, not a
        // single verifiable condition, so it has intentionally NO check here.
        checks: [
          {
            id: "5.2.a",
            question: "Does the document contain a formal information security policy statement made on behalf of the organization?",
            hint: "Count: a declaration of what the organization commits to or intends to do about information security.",
            recommendation: "Add a formal information security policy statement, issued on behalf of the organization by its top management.",
          },
          {
            id: "5.2.b",
            question: "Does the document include information security objectives, or a framework for setting them?",
            hint: "Count: a list of objectives, or a described process for setting and reviewing them.",
            recommendation: "State the information security objectives in the policy, or describe the framework used to set and review them.",
          },
          {
            id: "5.2.c",
            question: "Does the document include a commitment to satisfy applicable information security requirements?",
            hint: "Count: a commitment to meet legal, regulatory, contractual or standard requirements.",
            recommendation: "Add an explicit commitment to satisfy applicable legal, regulatory, contractual and standard requirements.",
          },
          {
            id: "5.2.d",
            question: "Does the document include a commitment to continual improvement of the information security management system?",
            hint: "Count: an explicit commitment to improve the ISMS over time.",
            anchors: ["improv"],
            recommendation: "Add an explicit commitment to the continual improvement of the ISMS.",
          },
        ],
      },
      {
        control_id: "6.2",
        title: "Information security objectives",
        description:
          "Are the information security objectives stated, and are they measurable (target, metric, owner or frequency) where practicable?",
        search_keywords: ["objective", "target", "measure", "KPI", "metric", "review frequency"],
        applies_to: ["isms_policy"],
        checks: [
          {
            id: "6.2.a",
            question: "Does the document state information security objectives?",
            hint: "Count: explicit objectives that the organization sets for information security.",
            recommendation: "State the information security objectives explicitly.",
          },
          {
            id: "6.2.b",
            question: "Is at least one objective measurable, i.e. does it have a target value, or a defined indicator or metric?",
            hint: "Count: a numeric target, threshold or deadline, or a named indicator used to track an objective.",
            recommendation: "Give each objective a measurable target or a defined indicator, so progress can be tracked.",
          },
          {
            id: "6.2.c",
            question: "Does the document state who is responsible for achieving the objectives, or how often progress towards them is evaluated?",
            hint: "Count: a named role or function accountable for the objectives themselves, or a stated frequency or schedule for evaluating progress towards the objectives.",
            recommendation: "Assign an owner for the objectives and define how often progress against them is evaluated.",
          },
        ],
      },
      {
        control_id: "4.3",
        title: "Scope of the ISMS",
        description:
          "Does the document state, or point to, the scope of the ISMS (organization units, locations, systems)?",
        search_keywords: ["scope", "applies to", "boundaries", "locations", "legal entities"],
        applies_to: ["isms_policy"],
        checks: [
          {
            id: "4.3.a",
            question: "Does the document state that an ISMS exists, or that the document is part of one?",
            hint: "Count: a statement that an information security management system is in place or that this document belongs to it.",
            recommendation: "State that the document forms part of the organization's ISMS.",
          },
          {
            id: "4.3.b",
            question: "Does the document identify the legal entities or organizational units covered by the ISMS?",
            hint: "Count: names, or an explicit list, of the entities or organizational units inside the ISMS scope.",
            recommendation: "Name the legal entities or organizational units that the ISMS covers.",
          },
          {
            id: "4.3.c",
            question: "Does the document identify the physical locations or sites covered by the ISMS?",
            hint: "Count: sites, offices or facilities named as being inside the ISMS scope.",
            recommendation: "List the locations or sites that the ISMS covers.",
          },
          {
            id: "4.3.d",
            question: "Does the document identify the systems, services or processes covered by the ISMS?",
            hint: "Count: an explicit list or boundary statement naming what is within the ISMS scope.",
            recommendation: "Define the ISMS boundary by listing the systems, services or processes it covers.",
          },
        ],
      },

      // ---------- Anexo A: controles organizacionales ----------
      {
        control_id: "A.5.1",
        title: "Policies for information security",
        description:
          "Is the policy approved by management, published, communicated to personnel and relevant parties, and reviewed at planned intervals (with evidence of the reviews)?",
        search_keywords: ["approved by", "signed", "published", "communicated", "annual review", "version history"],
        applies_to: ["isms_policy", "topic_policy"],
        legacy_id: "A.5.1.1",
        checks: [
          {
            id: "A.5.1.a",
            question: "Does the document show that it was approved by management?",
            hint: "Count: a named approver or approving role (e.g. executive, board, senior management), an approval statement, or a signature/approval block.",
            recommendation: "Record the approval of the policy by management (approver, role and date).",
          },
          {
            id: "A.5.1.b",
            question: "Does the document state that it is published or communicated to personnel?",
            hint: "Count: a statement that the policy is made available, distributed or communicated to staff or other relevant parties.",
            recommendation: "State how the policy is published and communicated to personnel and relevant interested parties.",
          },
          {
            id: "A.5.1.c",
            question: "Does the document state that it is reviewed at planned intervals or when significant changes occur?",
            hint: "Count: a review frequency (e.g. yearly), a review schedule, or review triggered by significant changes.",
            anchors: ["review", "revis"],
            recommendation: "Define a review at planned intervals (and on significant changes) and keep a record of the reviews.",
          },
        ],
      },
      {
        control_id: "A.5.2",
        title: "Information security roles and responsibilities",
        description:
          "Are responsibilities for information security defined and allocated (e.g. CISO, managers, all staff)?",
        search_keywords: ["responsible", "CISO", "managers", "staff", "owner", "steering committee"],
        applies_to: ["isms_policy", "topic_policy"],
        legacy_id: "A.6.1.1",
        checks: [
          {
            id: "A.5.2.a",
            question: "Does the document assign information security responsibilities to at least one specific role or function?",
            hint: "Count: a named role, function or committee together with a duty it has regarding information security.",
            recommendation: "Define and allocate information security responsibilities to specific roles or functions.",
          },
          {
            id: "A.5.2.b",
            question: "Does the document state information security responsibilities that apply to all personnel?",
            hint: "Count: duties or obligations that every employee or member of staff must follow regarding information security.",
            recommendation: "State the information security responsibilities that apply to all personnel.",
          },
        ],
      },
      {
        control_id: "A.5.15",
        title: "Access control",
        description:
          "Does an access control rule or topic-specific policy exist covering business and security requirements for access (least privilege, need-to-know, authorization)?",
        search_keywords: ["access control", "least privilege", "need to know", "authorization", "user access"],
        applies_to: ["topic_policy"],
        legacy_id: "A.9.1.1",
        checks: [
          {
            id: "A.5.15.a",
            question: "Does the document state that access is granted on a need-to-know basis or following the least-privilege principle?",
            hint: "Count: need-to-know, need-to-use or least privilege, in those or equivalent words.",
            recommendation: "State that access is limited to what each person needs (need-to-know / least privilege).",
          },
          {
            id: "A.5.15.b",
            question: "Does the document require access to be formally authorized before it is granted?",
            hint: "Count: a requirement for approval of access requests by an owner, manager or other authority.",
            recommendation: "Require formal authorization before access to information or systems is granted.",
          },
          {
            id: "A.5.15.c",
            question: "Does the document base its access rules on business and security requirements?",
            hint: "Count: a statement that access rules follow business needs, risk or security requirements.",
            recommendation: "Base the access control rules on documented business and security requirements.",
          },
        ],
      },
      {
        control_id: "A.5.24",
        title: "Incident management planning and preparation",
        description:
          "Is there a defined process, roles and responsibilities for managing security incidents (reporting, assessment, classification, response)?",
        search_keywords: ["incident response", "classification", "escalation", "roles", "incident procedure"],
        applies_to: ["procedure", "topic_policy"],
        legacy_id: "A.16.1.1",
        checks: [
          {
            id: "A.5.24.a",
            question: "Does the document assign roles or responsibilities for managing information security incidents?",
            hint: "Count: a named role, team or function that handles, coordinates or decides on security incidents.",
            recommendation: "Assign roles and responsibilities for information security incident management.",
          },
          {
            id: "A.5.24.b",
            question: "Does the document define how information security incidents are reported?",
            hint: "Count: a reporting step, channel or contact point described as part of the incident process.",
            recommendation: "Define the steps and channels by which incidents are reported within the incident process.",
          },
          {
            id: "A.5.24.c",
            question: "Does the document define how incidents are assessed or classified?",
            hint: "Count: assessment of impact or a classification of incidents by severity or type.",
            recommendation: "Define how incidents are assessed and classified (for example by severity).",
          },
          {
            id: "A.5.24.d",
            question: "Does the document define how the organization responds to incidents?",
            hint: "Count: described response actions such as containment, investigation, recovery or escalation.",
            recommendation: "Describe the incident response actions (containment, investigation, recovery, escalation).",
          },
        ],
      },
      {
        control_id: "A.5.29",
        title: "Information security during disruption",
        description:
          "Does the document require business continuity / disruption plans to be maintained and tested?",
        search_keywords: ["business continuity", "disruption", "recovery", "tested", "continuity plan"],
        applies_to: ["isms_policy", "procedure"],
        legacy_id: "A.17.1.1",
        checks: [
          {
            id: "A.5.29.a",
            question: "Does the document require continuity plans (to keep information security in place during a disruption) to be established?",
            hint: "Count: a requirement or commitment to have business continuity, disaster recovery or similar plans that keep information security in place during a disruption.",
            recommendation: "Require business continuity and disruption plans that maintain information security during a disruption.",
          },
          {
            id: "A.5.29.b",
            question: "Does the document require the continuity plans to be kept up to date?",
            hint: "Count: a requirement to maintain, update or review the plans.",
            recommendation: "Require the continuity plans to be maintained and kept up to date.",
          },
          {
            id: "A.5.29.c",
            question: "Does the document require the continuity plans to be tested?",
            hint: "Count: testing, exercises, simulations or drills of the plans.",
            anchors: ["test", "exercis", "drill", "simulat"],
            recommendation: "Require the continuity plans to be tested periodically (exercises, simulations or drills).",
          },
        ],
      },
      {
        control_id: "A.5.31",
        title: "Legal, statutory, regulatory and contractual requirements",
        description:
          "Does the document commit to meeting applicable legal, regulatory and contractual requirements (e.g. data protection law)?",
        search_keywords: ["legal", "regulatory", "legislation", "GDPR", "data protection", "contractual"],
        applies_to: ["isms_policy"],
        legacy_id: "A.18.1.1",
        checks: [
          {
            id: "A.5.31.a",
            question: "Does the document commit to meeting applicable legal, statutory or regulatory requirements?",
            hint: "Count: an explicit commitment to comply with laws, statutes or regulations that apply to the organization.",
            recommendation: "Add an explicit commitment to comply with applicable legal, statutory and regulatory requirements.",
          },
          {
            id: "A.5.31.b",
            question: "Does the document commit to meeting applicable contractual requirements?",
            hint: "Count: an explicit commitment to comply with contractual obligations related to information security.",
            recommendation: "Add an explicit commitment to meet applicable contractual requirements.",
          },
          {
            id: "A.5.31.c",
            question: "Does the document say who is responsible for tracking the legal and regulatory requirements that apply?",
            hint: "Count: a named role or function responsible for identifying the applicable requirements and tracking changes to them.",
            recommendation: "Assign a role responsible for identifying the applicable requirements and keeping them up to date.",
          },
        ],
      },

      // ---------- Anexo A: personas ----------
      {
        control_id: "A.6.3",
        title: "Information security awareness, education and training",
        description:
          "Does the document require security awareness training for personnel (on joining and regularly afterwards)?",
        search_keywords: ["awareness", "training", "induction", "regularly", "education"],
        applies_to: ["isms_policy", "procedure"],
        legacy_id: "A.7.2.2",
        checks: [
          {
            id: "A.6.3.a",
            question: "Does the document require personnel to receive information security awareness, education or training?",
            hint: "Count: a requirement or statement that staff are trained or made aware of information security.",
            recommendation: "Require information security awareness, education and training for all personnel.",
          },
          {
            id: "A.6.3.b",
            question: "Does the document state that new personnel receive this awareness or training when they join?",
            hint: "Count: induction, onboarding or training on joining or within a stated period after starting.",
            recommendation: "Provide information security awareness training to new personnel when they join.",
          },
          {
            id: "A.6.3.c",
            question: "Does the document state that awareness training is repeated at regular intervals?",
            hint: "Count: a stated frequency (e.g. annual), periodic refresher training, or regular updates.",
            recommendation: "Repeat or refresh awareness training at regular intervals.",
          },
        ],
      },
      {
        control_id: "A.6.8",
        title: "Information security event reporting",
        description:
          "Is there a mechanism for personnel to report observed or suspected security events or breaches in a timely manner, and to whom?",
        search_keywords: ["report", "breach", "suspected", "line manager", "security event", "notify"],
        applies_to: ["isms_policy", "procedure"],
        legacy_id: "A.16.1.2",
        checks: [
          {
            id: "A.6.8.a",
            question: "Does the document require personnel to report observed or suspected information security events?",
            hint: "Count: an obligation on staff to report events, incidents, breaches or suspected weaknesses.",
            recommendation: "Require all personnel to report observed or suspected information security events.",
          },
          {
            id: "A.6.8.b",
            question: "Does the document say to whom, or through which channel, security events are reported?",
            hint: "Count: a named role, function, contact point, mailbox, phone line or reporting tool.",
            recommendation: "Identify the contact point or channel through which events must be reported.",
          },
          {
            id: "A.6.8.c",
            question: "Does the document require security events to be reported promptly?",
            hint: "Count: words such as immediately, promptly or as soon as possible, or a stated deadline.",
            recommendation: "Require events to be reported in a timely manner and state the expected timeframe.",
          },
        ],
      },

      // ---------- Anexo A: tecnológicos ----------
      {
        control_id: "A.8.5",
        title: "Secure authentication",
        description:
          "Where this document covers authentication, does it specify secure authentication technologies/procedures aligned with the access control policy (e.g. strength of method, MFA where risk requires)?",
        search_keywords: ["authentication", "log-on", "login", "password", "MFA", "multi-factor"],
        applies_to: ["topic_policy", "procedure"],
        legacy_id: "A.9.4.2",
        checks: [
          {
            id: "A.8.5.a",
            question: "Does the document set at least one requirement on the strength or handling of authentication credentials?",
            hint: "Count: password or passphrase rules (length, complexity, reuse, change) or rules for protecting authentication secrets.",
            recommendation: "Define requirements for the strength and protection of authentication credentials.",
          },
          {
            id: "A.8.5.b",
            question: "Does the document require stronger authentication for higher-risk access?",
            hint: "Count: an additional authentication factor required in some cases, or authentication strength tied to risk or sensitivity.",
            recommendation: "Require stronger authentication where the risk or sensitivity of the access calls for it.",
          },
        ],
      },
      {
        control_id: "A.8.8",
        title: "Management of technical vulnerabilities",
        description:
          "Where this document covers vulnerability management, does it define how vulnerabilities are identified, evaluated and remediated within defined timeframes?",
        search_keywords: ["vulnerability", "patch", "remediation", "scan", "CVE", "timeframe"],
        applies_to: ["topic_policy", "procedure"],
        legacy_id: "A.12.6.1",
        checks: [
          {
            id: "A.8.8.a",
            question: "Does the document state how technical vulnerabilities are identified?",
            hint: "Count: scanning, testing, monitoring of advisories or other named sources used to discover vulnerabilities.",
            recommendation: "Define how technical vulnerabilities are identified (scanning, advisories, monitoring).",
          },
          {
            id: "A.8.8.b",
            question: "Does the document require identified vulnerabilities to be assessed or prioritized?",
            hint: "Count: evaluation of risk, severity or priority of vulnerabilities.",
            recommendation: "Require vulnerabilities to be assessed and prioritized by risk or severity.",
          },
          {
            id: "A.8.8.c",
            question: "Does the document require identified vulnerabilities to be remediated or mitigated?",
            hint: "Count: patching, fixing or applying a compensating measure to vulnerabilities.",
            recommendation: "Require vulnerabilities to be remediated or mitigated.",
          },
          {
            id: "A.8.8.d",
            question: "Does the document define timeframes for remediating vulnerabilities?",
            hint: "Count: a stated deadline or timeframe, possibly depending on severity.",
            recommendation: "Define remediation timeframes (for example by severity).",
          },
        ],
      },
    ],
  },
  "ISO 9001": {
    standard_name: "ISO 9001",
    domain: "Quality Management",
    controls: [
      {
        control_id: "4.1",
        title: "Context of the Organization",
        description:
          "Internal and external issues relevant to quality objectives must be identified and documented.",
        search_keywords: ["context", "internal issues", "external issues", "stakeholders", "interested parties"],
      },
      {
        control_id: "8.4.1",
        title: "Control of Externally Provided Processes",
        description:
          "Supplier evaluation criteria and selection processes must be documented and applied to all external providers.",
        search_keywords: ["supplier", "vendor", "external provider", "evaluation", "selection criteria"],
      },
      {
        control_id: "9.1.1",
        title: "Monitoring, Measurement, Analysis and Evaluation",
        description:
          "The organization shall determine what needs to be monitored and measured, with defined KPIs and evaluation methods.",
        search_keywords: ["KPI", "performance indicator", "measurement", "monitoring", "evaluation"],
      },
      {
        control_id: "10.2",
        title: "Nonconformity and Corrective Action",
        description:
          "Nonconformities must be documented, root causes identified, and corrective actions implemented and verified.",
        search_keywords: ["nonconformity", "corrective action", "root cause", "defect", "deviation"],
      },
    ],
  },
  "ISO 14001": {
    standard_name: "ISO 14001",
    domain: "Environmental Management",
    controls: [
      {
        control_id: "6.1.2",
        title: "Environmental Aspects",
        description:
          "Significant environmental aspects and their impacts must be identified and documented.",
        search_keywords: ["environmental aspect", "environmental impact", "significant", "lifecycle"],
      },
      {
        control_id: "6.2.1",
        title: "Environmental Objectives",
        description:
          "Environmental objectives with measurable targets, baselines and timelines must be established and documented.",
        search_keywords: ["environmental objective", "target", "baseline", "greenhouse", "emission", "measurable"],
      },
      {
        control_id: "7.4",
        title: "Environmental Communication",
        description:
          "Internal and external communication procedures regarding environmental performance must be documented.",
        search_keywords: ["environmental communication", "disclosure", "reporting", "stakeholder"],
      },
      {
        control_id: "8.1",
        title: "Operational Planning and Control",
        description:
          "Controls must be established and maintained for operations associated with significant environmental aspects.",
        search_keywords: ["operational control", "environmental procedure", "waste", "emissions control"],
      },
    ],
  },
  "GDPR": {
    standard_name: "GDPR",
    domain: "Data Protection & Privacy",
    controls: [
      {
        control_id: "Art.5",
        title: "Principles of Data Processing",
        description:
          "Personal data must be processed lawfully, fairly, and transparently with a documented lawful basis.",
        search_keywords: ["lawful basis", "data processing", "personal data", "consent", "legitimate interest"],
      },
      {
        control_id: "Art.13",
        title: "Privacy Notice and Transparency",
        description:
          "Data subjects must be informed about data processing purposes, retention periods, and their rights.",
        search_keywords: ["privacy notice", "privacy policy", "data subject rights", "transparency"],
      },
      {
        control_id: "Art.17",
        title: "Right to Erasure",
        description:
          "Procedures must exist to delete personal data upon request or when no longer necessary.",
        search_keywords: ["data deletion", "right to erasure", "right to be forgotten", "data retention", "retention schedule"],
      },
      {
        control_id: "Art.32",
        title: "Security of Processing",
        description:
          "Appropriate technical and organizational measures must be implemented to ensure data security.",
        search_keywords: ["data security", "encryption", "pseudonymization", "technical measures", "data breach"],
      },
    ],
  },
  "SOC 2": {
    standard_name: "SOC 2",
    domain: "Service Organization Controls",
    controls: [
      {
        control_id: "CC6.1",
        title: "Logical and Physical Access Controls",
        description:
          "Access to systems and data is restricted to authorized users through documented provisioning and deprovisioning procedures.",
        search_keywords: ["access provisioning", "access control", "deprovisioning", "user access review", "least privilege"],
      },
      {
        control_id: "CC7.5",
        title: "Incident Response",
        description:
          "Incident response plan must include documented recovery time objectives (RTO) and recovery point objectives (RPO).",
        search_keywords: ["incident response", "recovery time", "RTO", "RPO", "business continuity", "disaster recovery"],
      },
      {
        control_id: "CC8.1",
        title: "Change Management",
        description:
          "Changes to systems must follow a documented change management process with authorization and testing.",
        search_keywords: ["change management", "change control", "deployment", "release management"],
      },
      {
        control_id: "CC9.2",
        title: "Risk Assessment",
        description:
          "Risk assessments must be performed and risk treatment plans documented and reviewed.",
        search_keywords: ["risk assessment", "risk treatment", "risk register", "risk mitigation"],
      },
    ],
  },
  "ISO 45001": {
    standard_name: "ISO 45001",
    domain: "Occupational Health & Safety",
    controls: [
      {
        control_id: "6.1",
        title: "Hazard Identification and Risk Assessment",
        description:
          "OH&S hazards must be identified and occupational health and safety risks assessed and documented.",
        search_keywords: ["hazard", "risk assessment", "occupational health", "safety risk", "danger"],
      },
      {
        control_id: "8.1",
        title: "Operational Planning and Control",
        description:
          "Controls must be implemented to eliminate hazards and reduce OH&S risks.",
        search_keywords: ["safety control", "hazard control", "protective equipment", "PPE", "safety procedure"],
      },
      {
        control_id: "9.1",
        title: "Performance Monitoring and Measurement",
        description:
          "OH&S performance must be monitored and measured with defined safety KPIs and incident statistics.",
        search_keywords: ["safety performance", "safety KPI", "incident rate", "accident", "near miss"],
      },
      {
        control_id: "10.2",
        title: "Incident Investigation",
        description:
          "Work-related incidents must be investigated to identify root causes and implement corrective actions.",
        search_keywords: ["incident investigation", "accident investigation", "root cause", "corrective action", "safety incident"],
      },
    ],
  },
};

export const ASSESSMENT_STANDARDS = Object.keys(STANDARD_DEFINITIONS);
