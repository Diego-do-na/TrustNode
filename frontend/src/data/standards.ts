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
      },
      {
        control_id: "A.5.2",
        title: "Information security roles and responsibilities",
        description:
          "Are responsibilities for information security defined and allocated (e.g. CISO, managers, all staff)?",
        search_keywords: ["responsible", "CISO", "managers", "staff", "owner", "steering committee"],
        applies_to: ["isms_policy", "topic_policy"],
        legacy_id: "A.6.1.1",
      },
      {
        control_id: "A.5.15",
        title: "Access control",
        description:
          "Does an access control rule or topic-specific policy exist covering business and security requirements for access (least privilege, need-to-know, authorization)?",
        search_keywords: ["access control", "least privilege", "need to know", "authorization", "user access"],
        applies_to: ["topic_policy"],
        legacy_id: "A.9.1.1",
      },
      {
        control_id: "A.5.24",
        title: "Incident management planning and preparation",
        description:
          "Is there a defined process, roles and responsibilities for managing security incidents (reporting, assessment, classification, response)?",
        search_keywords: ["incident response", "classification", "escalation", "roles", "incident procedure"],
        applies_to: ["procedure", "topic_policy"],
        legacy_id: "A.16.1.1",
      },
      {
        control_id: "A.5.29",
        title: "Information security during disruption",
        description:
          "Does the document require business continuity / disruption plans to be maintained and tested?",
        search_keywords: ["business continuity", "disruption", "recovery", "tested", "continuity plan"],
        applies_to: ["isms_policy", "procedure"],
        legacy_id: "A.17.1.1",
      },
      {
        control_id: "A.5.31",
        title: "Legal, statutory, regulatory and contractual requirements",
        description:
          "Does the document commit to meeting applicable legal, regulatory and contractual requirements (e.g. data protection law)?",
        search_keywords: ["legal", "regulatory", "legislation", "GDPR", "data protection", "contractual"],
        applies_to: ["isms_policy"],
        legacy_id: "A.18.1.1",
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
      },
      {
        control_id: "A.6.8",
        title: "Information security event reporting",
        description:
          "Is there a mechanism for personnel to report observed or suspected security events or breaches in a timely manner, and to whom?",
        search_keywords: ["report", "breach", "suspected", "line manager", "security event", "notify"],
        applies_to: ["isms_policy", "procedure"],
        legacy_id: "A.16.1.2",
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
      },
      {
        control_id: "A.8.8",
        title: "Management of technical vulnerabilities",
        description:
          "Where this document covers vulnerability management, does it define how vulnerabilities are identified, evaluated and remediated within defined timeframes?",
        search_keywords: ["vulnerability", "patch", "remediation", "scan", "CVE", "timeframe"],
        applies_to: ["topic_policy", "procedure"],
        legacy_id: "A.12.6.1",
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
