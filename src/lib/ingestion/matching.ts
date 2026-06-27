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
      itemId: firstItemForSupplier(supplier.id, catalog),
      supplierId: supplier.id,
      reason: "supplier",
      matchedValue: supplier.name,
    };
  }

  const country = normalizeCountry(signal.matchHints?.countryCode);
  if (country) {
    const supplierByCountry = catalog.suppliers.find(
      (candidate) => normalizeCountry(candidate.countryOfOrigin) === country,
    );
    if (supplierByCountry) {
      return {
        organizationId: catalog.organizationId,
        itemId: firstItemForSupplier(supplierByCountry.id, catalog),
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
        itemName.includes(keyword) ||
        keyword.includes(itemName) ||
        (sku.length >= 4 && keyword.includes(sku)),
    );
  });
}

function firstItemForSupplier(
  supplierId: string,
  catalog: TenantCatalog,
): string | undefined {
  return catalog.itemSuppliers.find((link) => link.supplierId === supplierId)?.itemId;
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
