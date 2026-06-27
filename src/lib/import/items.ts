import { pickField, type CsvRecord } from "./csv";
import { normalizeIdentifier } from "@/lib/connectors/helpers";
import { normalizeEnum, parseBoolean, parseInteger } from "./coerce";
import type { RowError, ValidationResult } from "./types";

export const ITEM_CATEGORIES = [
  "drug",
  "device",
  "iv_fluid",
  "ppe",
  "oxygen",
  "lab_reagent",
  "sterile_supply",
  "consumable",
  "other",
] as const;

export const ITEM_CRITICALITIES = ["low", "medium", "high", "life_critical"] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export type ItemCriticality = (typeof ITEM_CRITICALITIES)[number];

export const ITEM_IDENTIFIER_TYPES = [
  "ndc",
  "gtin",
  "upc",
  "hibcc",
  "sku",
  "mpn",
  "fda_app_no",
  "rxcui",
  "other",
] as const;

export type ItemIdentifierType = (typeof ITEM_IDENTIFIER_TYPES)[number];

export interface ImportItemIdentifier {
  type: ItemIdentifierType;
  value: string;
  isPrimary: boolean;
}

export interface ImportItem {
  name: string;
  category: ItemCategory;
  criticality: ItemCriticality;
  internalSku: string | null;
  unitOfMeasure: string | null;
  parLevel: number | null;
  reorderPoint: number | null;
  isWatched: boolean;
  identifiers: ImportItemIdentifier[];
}

/** Header row for the downloadable item import template. */
export const ITEM_CSV_TEMPLATE =
  "name,category,criticality,sku,ndc,gtin,unit_of_measure,par_level,reorder_point,watch\n" +
  "Sodium Chloride 0.9% IV 1000mL,iv_fluid,life_critical,IV-NS-1000,0409-7983-09,00304097983091,bag,500,200,yes\n";

export function validateItemRows(rows: CsvRecord[]): ValidationResult<ImportItem> {
  const valid: ImportItem[] = [];
  const errors: RowError[] = [];
  const seenSku = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 2; // header occupies line 1

    const name = pickField(row, ["name", "item", "item_name", "description"]);
    if (!name) {
      errors.push({ row: line, field: "name", message: "Name is required." });
      return;
    }

    let category: ItemCategory = "other";
    const rawCategory = pickField(row, ["category", "type"]);
    if (rawCategory) {
      const norm = normalizeEnum(rawCategory, ITEM_CATEGORIES);
      if (!norm) {
        errors.push({ row: line, field: "category", message: `Unknown category "${rawCategory}".` });
        return;
      }
      category = norm;
    }

    let criticality: ItemCriticality = "medium";
    const rawCriticality = pickField(row, ["criticality", "priority"]);
    if (rawCriticality) {
      const norm = normalizeEnum(rawCriticality, ITEM_CRITICALITIES);
      if (!norm) {
        errors.push({
          row: line,
          field: "criticality",
          message: `Unknown criticality "${rawCriticality}".`,
        });
        return;
      }
      criticality = norm;
    }

    const par = parseInteger(pickField(row, ["par_level", "par"]));
    if (!par.ok) {
      errors.push({ row: line, field: "par_level", message: "Par level must be a non-negative integer." });
      return;
    }
    const reorder = parseInteger(pickField(row, ["reorder_point", "reorder"]));
    if (!reorder.ok) {
      errors.push({
        row: line,
        field: "reorder_point",
        message: "Reorder point must be a non-negative integer.",
      });
      return;
    }

    const internalSku = pickField(row, ["sku", "internal_sku", "item_number"]) ?? null;
    if (internalSku) {
      const key = internalSku.toLowerCase();
      if (seenSku.has(key)) {
        errors.push({ row: line, field: "sku", message: `Duplicate SKU "${internalSku}" in file.` });
        return;
      }
      seenSku.add(key);
    }

    valid.push({
      name,
      category,
      criticality,
      internalSku,
      unitOfMeasure: pickField(row, ["unit_of_measure", "uom", "unit"]) ?? null,
      parLevel: par.value,
      reorderPoint: reorder.value,
      isWatched: parseBoolean(pickField(row, ["watch", "watched", "watchlist"]), true),
      identifiers: collectIdentifiers(row, internalSku),
    });
  });

  return { valid, errors };
}

function collectIdentifiers(
  row: CsvRecord,
  internalSku: string | null,
): ImportItemIdentifier[] {
  const values: ImportItemIdentifier[] = [];
  addIdentifier(values, "ndc", pickField(row, ["ndc", "package_ndc", "product_ndc"]), true);
  addIdentifier(values, "gtin", pickField(row, ["gtin", "udi", "udi_di"]), false);
  addIdentifier(values, "upc", pickField(row, ["upc"]), false);
  addIdentifier(values, "hibcc", pickField(row, ["hibcc"]), false);
  addIdentifier(values, "mpn", pickField(row, ["mpn", "manufacturer_part_number"]), false);
  addIdentifier(values, "fda_app_no", pickField(row, ["fda_app_no", "application_number"]), false);
  addIdentifier(values, "rxcui", pickField(row, ["rxcui", "rxnorm"]), false);
  addIdentifier(values, "other", pickField(row, ["identifier", "external_identifier"]), false);
  addIdentifier(values, "sku", internalSku ?? undefined, false);

  const seen = new Set<string>();
  return values.filter((identifier) => {
    const key = `${identifier.type}:${identifier.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addIdentifier(
  identifiers: ImportItemIdentifier[],
  type: ItemIdentifierType,
  value: string | undefined,
  isPrimary: boolean,
) {
  const canonical = canonicalizeIdentifier(type, value);
  if (!canonical) return;
  identifiers.push({ type, value: canonical, isPrimary });
}

function canonicalizeIdentifier(
  type: ItemIdentifierType,
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (type === "other") return trimmed;
  return normalizeIdentifier(trimmed);
}
