import type { NormalizedRiskSignal } from "@/lib/connectors/types";
import { normalizeIdentifier } from "@/lib/connectors/helpers";

export interface CatalogIdentifier {
  itemId: string;
  type: string;
  value: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  internalSku?: string | null;
}

export interface CatalogSupplier {
  id: string;
  name: string;
  countryOfOrigin?: string | null;
}

export interface CatalogItemSupplier {
  itemId: string;
  supplierId: string;
}

export interface TenantCatalog {
  organizationId: string;
  items: CatalogItem[];
  identifiers: CatalogIdentifier[];
  suppliers: CatalogSupplier[];
  itemSuppliers: CatalogItemSupplier[];
}

export interface SignalMatch {
  organizationId: string;
  itemId?: string;
  supplierId?: string;
  reason: "ndc" | "gtin" | "supplier" | "country" | "keyword";
  matchedValue: string;
}

const COUNTRY_ALIASES = new Map<string, string>([
  ["united states", "US"],
  ["usa", "US"],
  ["us", "US"],
  ["united states of america", "US"],
  ["china", "CN"],
  ["cn", "CN"],
  ["india", "IN"],
  ["in", "IN"],
  ["mexico", "MX"],
  ["mx", "MX"],
  ["canada", "CA"],
  ["ca", "CA"],
  ["germany", "DE"],
  ["de", "DE"],
  ["ireland", "IE"],
  ["ie", "IE"],
  ["italy", "IT"],
  ["it", "IT"],
  ["japan", "JP"],
  ["jp", "JP"],
  ["united kingdom", "GB"],
  ["uk", "GB"],
  ["gb", "GB"],
]);

export function matchSignalToCatalog(
  signal: NormalizedRiskSignal,
  catalog: TenantCatalog,
): SignalMatch | null {
  const ndcMatch = matchIdentifier(signal.matchHints?.ndc, "ndc", catalog);
  if (ndcMatch) {
    return {
      organizationId: catalog.organizationId,
      itemId: ndcMatch.itemId,
      reason: "ndc",
      matchedValue: ndcMatch.value,
    };
  }

  const gtinMatch = matchIdentifier(signal.matchHints?.gtin, "gtin", catalog);
  if (gtinMatch) {
    return {
      organizationId: catalog.organizationId,
      itemId: gtinMatch.itemId,
      reason: "gtin",
      matchedValue: gtinMatch.value,
    };
  }

  const supplier = findSupplier(signal.matchHints?.supplierName, catalog);
  if (supplier) {
    return {
      organizationId: catalog.organizationId,
      supplierId: supplier.id,
      reason: "supplier",
      matchedValue: supplier.name,
    };
  }

  const country = normalizeCountry(signal.matchHints?.countryCode);
  if (country) {
    const suppliersByCountry = catalog.suppliers.filter(
      (candidate) => normalizeCountry(candidate.countryOfOrigin) === country,
    );
    // A bare country match is only trustworthy when it's unambiguous (one
    // candidate) or independently corroborated by keyword/text mentioning
    // that specific supplier — otherwise picking .find()'s first result
    // among several same-country suppliers is an arbitrary guess.
    const corroborated = suppliersByCountry.find((candidate) =>
      signalCorroboratesSupplier(signal, candidate),
    );
    const supplierByCountry =
      corroborated ?? (suppliersByCountry.length === 1 ? suppliersByCountry[0] : undefined);
    if (supplierByCountry) {
      return {
        organizationId: catalog.organizationId,
        supplierId: supplierByCountry.id,
        reason: "country",
        matchedValue: country,
      };
    }
  }

  const item = findItemByKeyword(signal, catalog);
  if (item) {
    return {
      organizationId: catalog.organizationId,
      itemId: item.id,
      reason: "keyword",
      matchedValue: item.name,
    };
  }

  return null;
}

function matchIdentifier(
  value: string | undefined,
  type: "ndc" | "gtin",
  catalog: TenantCatalog,
): CatalogIdentifier | undefined {
  const normalized = normalizeIdentifier(value);
  if (!normalized) return undefined;
  return catalog.identifiers.find(
    (identifier) =>
      identifier.type === type &&
      normalizeIdentifier(identifier.value) === normalized,
  );
}

function findSupplier(
  supplierName: string | undefined,
  catalog: TenantCatalog,
): CatalogSupplier | undefined {
  const normalized = normalizeText(supplierName);
  if (!normalized || normalized.length < 4) return undefined;
  return catalog.suppliers.find((supplier) => {
    const candidate = normalizeText(supplier.name);
    return (
      candidate.length >= 4 &&
      (candidate.includes(normalized) || normalized.includes(candidate))
    );
  });
}

function signalCorroboratesSupplier(
  signal: NormalizedRiskSignal,
  supplier: CatalogSupplier,
): boolean {
  const supplierName = normalizeText(supplier.name);
  if (supplierName.length < 4) return false;
  const texts = [
    signal.matchHints?.supplierName,
    signal.title,
    signal.summary,
    ...(signal.matchHints?.keywords ?? []),
  ]
    .map(normalizeText)
    .filter((value) => value.length >= 4);
  return texts.some(
    (text) => containsWholeText(text, supplierName) || containsWholeText(supplierName, text),
  );
}

function findItemByKeyword(
  signal: NormalizedRiskSignal,
  catalog: TenantCatalog,
): CatalogItem | undefined {
  const keywords = [
    ...(signal.matchHints?.keywords ?? []),
    signal.title,
    signal.summary,
  ]
    .map(normalizeText)
    .filter((value) => value.length >= 4);

  return catalog.items.find((item) => {
    const itemName = normalizeText(item.name);
    const sku = normalizeText(item.internalSku);
    return keywords.some(
      (keyword) =>
        containsWholeText(itemName, keyword) ||
        containsWholeText(keyword, itemName) ||
        (sku.length >= 4 && containsWholeText(keyword, sku)),
    );
  });
}

export function normalizeCountry(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.length === 2) return normalized.toUpperCase();
  return COUNTRY_ALIASES.get(normalized);
}

function normalizeText(value: string | undefined | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(inc|incorporated|llc|ltd|limited|corp|corporation|company|co|the)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whole-token containment: true only when `needle` appears in `haystack` on
 * word boundaries, not as a bare substring inside a longer unrelated word
 * (e.g. a 4+ char keyword like "cardiac" should not match inside some other
 * compound word that happens to contain those letters). Both inputs are
 * assumed already normalizeText()-ed (lowercase, alphanumeric + single
 * spaces only), so no regex-special characters can survive to need
 * escaping.
 */
function containsWholeText(haystack: string, needle: string): boolean {
  if (!needle || !haystack) return false;
  return new RegExp(`(?:^|\\s)${needle}(?:\\s|$)`).test(haystack);
}
