import { assessCompliance, type ComplianceViolation } from "@/lib/ai/safety";

import type { CsvRecord } from "./csv";
import type { RowError } from "./types";

const SENSITIVE_CATALOG_CATEGORIES = new Set<ComplianceViolation["category"]>([
  "phi",
  "patient_specific",
]);

export function validateCatalogRowCompliance(
  row: CsvRecord,
  line: number,
): RowError | null {
  for (const [field, rawValue] of Object.entries(row)) {
    if (rawValue.trim() === "") continue;

    const report = assessCompliance([`${normalizeHeaderForCompliance(field)}: ${rawValue}`]);
    const violation = report.violations.find((candidate) =>
      SENSITIVE_CATALOG_CATEGORIES.has(candidate.category),
    );
    if (!violation) continue;

    return {
      row: line,
      field,
      message:
        `Remove patient-specific or PHI-like content before importing this row. ` +
        `Matched ${violation.pattern}: ${violation.excerpt}.`,
    };
  }

  return null;
}

function normalizeHeaderForCompliance(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}
