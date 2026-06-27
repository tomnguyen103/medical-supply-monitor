import Papa from "papaparse";

export type CsvRecord = Record<string, string>;

export interface ParsedCsv {
  headers: string[];
  rows: CsvRecord[];
  errors: string[];
}

/** Parse CSV text into header-keyed records with a robust, quote-aware parser. */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<CsvRecord>(text.replace(/^﻿/, "").trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const errors = result.errors.map(
    (e) =>
      `Row ${typeof e.row === "number" ? e.row + 2 : "?"}: ${e.message}`,
  );
  return { headers: result.meta.fields ?? [], rows: result.data, errors };
}

/** Normalize a header/key for tolerant matching (case/space/underscore-insensitive). */
export function normalizeKey(key: string): string {
  return key.toLowerCase().trim().replace(/[\s_-]+/g, "_");
}

/** Pick the first non-empty value among header aliases from a record. */
export function pickField(row: CsvRecord, aliases: string[]): string | undefined {
  const normalized = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string") normalized.set(normalizeKey(k), v);
  }
  for (const alias of aliases) {
    const value = normalized.get(normalizeKey(alias));
    if (value != null && value.trim() !== "") return value.trim();
  }
  return undefined;
}
