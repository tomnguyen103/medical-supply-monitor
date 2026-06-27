/** Coerce a truthy/falsy CSV cell to a boolean, falling back when unrecognized. */
export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(v)) return true;
  if (["0", "false", "no", "n"].includes(v)) return false;
  return fallback;
}

/**
 * Parse an optional non-negative integer cell. Empty → null. Returns `ok: false`
 * for non-integer / negative input so the caller can report a row error.
 */
export function parseInteger(
  value: string | undefined,
): { ok: true; value: number | null } | { ok: false } {
  if (value == null || value.trim() === "") return { ok: true, value: null };
  const n = Number(value.replace(/,/g, ""));
  if (!Number.isInteger(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

/** Normalize and validate a cell against an allowed enum (space/case tolerant). */
export function normalizeEnum<T extends string>(
  value: string,
  allowed: readonly T[],
): T | undefined {
  const n = value.toLowerCase().trim().replace(/[\s-]+/g, "_") as T;
  return allowed.includes(n) ? n : undefined;
}
