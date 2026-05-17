import type { AuditRequest } from "../api/client";

export const STANDARD_DEFINITIONS: Record<string, AuditRequest> = {
  "ISO 27001": {
    standard_name: "ISO 27001",
    domain: "Information Security",
    controls: [
      {
        control_id: "A.5.1",
        title: "Information Security Policies",
        description:
          "Security policies must be defined, approved by management, published and communicated to all employees.",
        search_keywords: ["security policy", "information security", "management approval", "policy communication"],
      },
      {
        control_id: "A.9.1",
        title: "Access Control Policy",
        description:
          "An access control policy shall be established and reviewed based on business and security requirements.",
        search_keywords: ["access control", "user access", "authorization", "privilege"],
      },
      {
        control_id: "A.9.4.2",
        title: "Secure Log-on Procedures",
        description:
          "Multi-factor authentication and secure log-on procedures must be implemented to prevent unauthorized access.",
        search_keywords: ["MFA", "multi-factor", "authentication", "login", "two-factor"],
      },
      {
        control_id: "A.12.6.1",
        title: "Technical Vulnerability Management",
        description:
          "Technical vulnerabilities must be identified, evaluated and remediated in a timely manner.",
        search_keywords: ["vulnerability", "patch", "remediation", "CVE", "security update"],
      },
      {
        control_id: "A.16.1",
        title: "Incident Management",
        description:
          "Security incidents must be reported, classified, and handled according to a documented incident response procedure.",
        search_keywords: ["incident", "security event", "breach", "incident response", "reporting"],
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
