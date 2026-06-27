import { pickField, type CsvRecord } from "./csv";
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

export interface ImportItem {
  name: string;
  category: ItemCategory;
  criticality: ItemCriticality;
  internalSku: string | null;
  unitOfMeasure: string | null;
  parLevel: number | null;
  reorderPoint: number | null;
  isWatched: boolean;
}

/** Header row for the downloadable item import template. */
export const ITEM_CSV_TEMPLATE =
  "name,category,criticality,sku,unit_of_measure,par_level,reorder_point,watch\n" +
  "Sodium Chloride 0.9% IV 1000mL,iv_fluid,life_critical,IV-NS-1000,bag,500,200,yes\n";

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
    });
  });

  return { valid, errors };
}
