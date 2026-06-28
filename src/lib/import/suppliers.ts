import { pickField, type CsvRecord } from "./csv";
import { normalizeEnum } from "./coerce";
import { validateCatalogRowCompliance } from "./compliance";
import type { RowError, ValidationResult } from "./types";

export const SUPPLIER_TYPES = [
  "manufacturer",
  "distributor",
  "wholesaler",
  "gpo",
  "other",
] as const;

export type SupplierType = (typeof SUPPLIER_TYPES)[number];

export interface ImportSupplier {
  name: string;
  type: SupplierType;
  duns: string | null;
  externalId: string | null;
  countryOfOrigin: string | null;
}

export const SUPPLIER_CSV_TEMPLATE =
  "name,type,duns,external_id,country_of_origin\n" +
  "Baxter International,manufacturer,005073496,SUP-BAX,US\n";

export function validateSupplierRows(
  rows: CsvRecord[],
): ValidationResult<ImportSupplier> {
  const valid: ImportSupplier[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 2;
    const complianceError = validateCatalogRowCompliance(row, line);
    if (complianceError) {
      errors.push(complianceError);
      return;
    }

    const name = pickField(row, ["name", "supplier", "supplier_name", "vendor"]);
    if (!name) {
      errors.push({ row: line, field: "name", message: "Name is required." });
      return;
    }

    let type: SupplierType = "manufacturer";
    const rawType = pickField(row, ["type", "supplier_type"]);
    if (rawType) {
      const norm = normalizeEnum(rawType, SUPPLIER_TYPES);
      if (!norm) {
        errors.push({ row: line, field: "type", message: `Unknown supplier type "${rawType}".` });
        return;
      }
      type = norm;
    }

    const externalId = pickField(row, ["external_id", "id", "supplier_id"]) ?? null;
    const dedupeKey = (externalId ?? name).toLowerCase();
    if (seen.has(dedupeKey)) {
      errors.push({ row: line, field: "name", message: `Duplicate supplier "${name}" in file.` });
      return;
    }
    seen.add(dedupeKey);

    valid.push({
      name,
      type,
      duns: pickField(row, ["duns", "duns_number"]) ?? null,
      externalId,
      countryOfOrigin: pickField(row, ["country_of_origin", "country", "origin"]) ?? null,
    });
  });

  return { valid, errors };
}
