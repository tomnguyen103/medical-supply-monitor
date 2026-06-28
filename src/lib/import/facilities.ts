import { pickField, type CsvRecord } from "./csv";
import { normalizeEnum } from "./coerce";
import { validateCatalogRowCompliance } from "./compliance";
import type { RowError, ValidationResult } from "./types";

export const FACILITY_TYPES = [
  "hospital",
  "clinic",
  "pharmacy",
  "warehouse",
  "other",
] as const;

export type FacilityType = (typeof FACILITY_TYPES)[number];

export interface ImportFacility {
  name: string;
  type: FacilityType;
  externalId: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

export const FACILITY_CSV_TEMPLATE =
  "name,type,external_id,country,region,city\n" +
  "Mercy Regional Hospital,hospital,FAC-001,US,Midwest,Springfield\n";

export function validateFacilityRows(
  rows: CsvRecord[],
): ValidationResult<ImportFacility> {
  const valid: ImportFacility[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 2;
    const complianceError = validateCatalogRowCompliance(row, line);
    if (complianceError) {
      errors.push(complianceError);
      return;
    }

    const name = pickField(row, ["name", "facility", "facility_name", "site"]);
    if (!name) {
      errors.push({ row: line, field: "name", message: "Name is required." });
      return;
    }

    let type: FacilityType = "hospital";
    const rawType = pickField(row, ["type", "facility_type"]);
    if (rawType) {
      const norm = normalizeEnum(rawType, FACILITY_TYPES);
      if (!norm) {
        errors.push({ row: line, field: "type", message: `Unknown facility type "${rawType}".` });
        return;
      }
      type = norm;
    }

    const externalId = pickField(row, ["external_id", "id", "facility_id"]) ?? null;
    const dedupeKey = (externalId ?? name).toLowerCase();
    if (seen.has(dedupeKey)) {
      errors.push({ row: line, field: "name", message: `Duplicate facility "${name}" in file.` });
      return;
    }
    seen.add(dedupeKey);

    valid.push({
      name,
      type,
      externalId,
      country: pickField(row, ["country"]) ?? null,
      region: pickField(row, ["region", "state"]) ?? null,
      city: pickField(row, ["city", "town"]) ?? null,
    });
  });

  return { valid, errors };
}
