export type ComplianceCategory =
  | "phi"
  | "ehr"
  | "diagnosis_or_treatment"
  | "drug_substitution"
  | "patient_specific";

export interface ComplianceViolation {
  category: ComplianceCategory;
  pattern: string;
  excerpt: string;
}

export interface ComplianceReport {
  blocked: boolean;
  violations: ComplianceViolation[];
}

const COMPLIANCE_PATTERNS: Array<{
  category: ComplianceCategory;
  pattern: string;
  regex: RegExp;
}> = [
  {
    category: "phi",
    pattern: "medical record number",
    regex: /\b(?:mrn|medical record(?: number)?|patient id)\s*[:#-]?\s*[a-z0-9-]{4,}\b/i,
  },
  {
    category: "phi",
    pattern: "patient identifier header",
    regex: /\b(?:patient\s+mrn|patient name|patient identifier|mrn)\b/i,
  },
  {
    category: "phi",
    pattern: "date of birth",
    regex: /\b(?:dob|date of birth)\s*[:#-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i,
  },
  {
    category: "phi",
    pattern: "ssn",
    regex: /\b\d{3}-\d{2}-\d{4}\b/,
  },
  {
    category: "ehr",
    pattern: "ehr integration",
    regex: /\b(?:ehr|epic|cerner|patient chart|clinical chart)\b/i,
  },
  {
    category: "diagnosis_or_treatment",
    pattern: "clinical advice",
    regex: /\b(?:diagnos(?:e|is)|treat(?:ment)?|therapy|prescrib(?:e|ing)|dose adjustment|clinical decision)\b/i,
  },
  {
    category: "drug_substitution",
    pattern: "drug substitution",
    regex: /\b(?:substitut(?:e|ion)|interchange(?:able)?|therapeutic equivalent|alternative medication)\b/i,
  },
  {
    category: "patient_specific",
    pattern: "patient workflow",
    regex: /\b(?:patient-specific|for this patient|bedside|individual patient|patient-level)\b/i,
  },
];

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]"],
  [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "[redacted-phone]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted-ssn]"],
  [
    /\b(?:mrn|medical record(?: number)?|patient id)\s*[:#-]?\s*[a-z0-9-]{4,}\b/gi,
    "[redacted-patient-identifier]",
  ],
  [
    /\b(?:dob|date of birth)\s*[:#-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
    "[redacted-dob]",
  ],
];

export function assessCompliance(texts: string[]): ComplianceReport {
  const violations: ComplianceViolation[] = [];
  for (const text of texts) {
    for (const rule of COMPLIANCE_PATTERNS) {
      const match = rule.regex.exec(text);
      if (!match) continue;
      violations.push({
        category: rule.category,
        pattern: rule.pattern,
        excerpt: redactSensitiveText(match[0]).slice(0, 160),
      });
    }
  }

  return {
    blocked: violations.length > 0,
    violations,
  };
}

export function redactSensitiveText(value: string): string {
  return REDACTION_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}

export function sanitizeTracePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeTracePayload);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactSensitiveText(value) : value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isSensitiveTraceKey(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeTracePayload(raw);
  }
  return output;
}

function isSensitiveTraceKey(key: string): boolean {
  return [
    "rawpayload",
    "rawpayloadref",
    "payload",
    "apikey",
    "token",
    "secret",
    "authorization",
    "cookie",
    "body",
    "description",
  ].includes(key.toLowerCase());
}
