import { describe, expect, it } from "vitest";

import type { NormalizedRiskSignal } from "@/lib/connectors/types";
import { matchSignalToCatalog, type TenantCatalog } from "./matching";

const baseSignal: NormalizedRiskSignal = {
  source: "fixture",
  domain: "shortage",
  entityType: "item",
  entityId: "fixture",
  title: "Fixture signal",
  severity: "moderate",
  lastFetchedAt: new Date("2026-06-27T12:00:00Z"),
  stalenessStatus: "fresh",
  dedupeKey: "fixture",
};

const catalog: TenantCatalog = {
  organizationId: "org_1",
  items: [
    { id: "item_1", name: "Furosemide Injection", internalSku: "RX-FUR" },
    { id: "item_2", name: "Dialysis Catheter", internalSku: null },
  ],
  identifiers: [
    { itemId: "item_1", type: "ndc", value: "0409-6102-26" },
    { itemId: "item_2", type: "gtin", value: "20884521128009" },
  ],
  suppliers: [
    { id: "supplier_1", name: "Hospira Inc", countryOfOrigin: "US" },
    { id: "supplier_2", name: "B. Braun", countryOfOrigin: "DE" },
  ],
  itemSuppliers: [{ itemId: "item_1", supplierId: "supplier_1" }],
};

describe("matchSignalToCatalog", () => {
  it("matches NDC identifiers before supplier names", () => {
    const match = matchSignalToCatalog(
      {
        ...baseSignal,
        matchHints: { ndc: "0409-6102-26", supplierName: "Unknown" },
      },
      catalog,
    );
    expect(match).toMatchObject({
      organizationId: "org_1",
      itemId: "item_1",
      reason: "ndc",
    });
  });

  it("matches GTIN identifiers after punctuation normalization", () => {
    const match = matchSignalToCatalog(
      { ...baseSignal, matchHints: { gtin: "20884521128009" } },
      catalog,
    );
    expect(match).toMatchObject({ itemId: "item_2", reason: "gtin" });
  });

  it("matches suppliers by normalized firm name", () => {
    const match = matchSignalToCatalog(
      { ...baseSignal, matchHints: { supplierName: "Hospira, Inc., a Pfizer Company" } },
      catalog,
    );
    expect(match).toMatchObject({
      supplierId: "supplier_1",
      reason: "supplier",
    });
    expect(match?.itemId).toBeUndefined();
  });

  it("matches supplier country exposure", () => {
    const match = matchSignalToCatalog(
      { ...baseSignal, matchHints: { countryCode: "Germany" } },
      catalog,
    );
    expect(match).toMatchObject({
      supplierId: "supplier_2",
      reason: "country",
      matchedValue: "DE",
    });
    expect(match?.itemId).toBeUndefined();
  });

  it("falls back to item keywords", () => {
    const match = matchSignalToCatalog(
      { ...baseSignal, matchHints: { keywords: ["dialysis catheter recall"] } },
      catalog,
    );
    expect(match).toMatchObject({ itemId: "item_2", reason: "keyword" });
  });
});

describe("matchSignalToCatalog ambiguous country matches (A9)", () => {
  const ambiguousCatalog: TenantCatalog = {
    organizationId: "org_1",
    items: [],
    identifiers: [],
    suppliers: [
      { id: "supplier_de_1", name: "B. Braun", countryOfOrigin: "DE" },
      { id: "supplier_de_2", name: "Fresenius Kabi", countryOfOrigin: "DE" },
    ],
    itemSuppliers: [],
  };

  it("does not guess a supplier when multiple same-country candidates are uncorroborated", () => {
    const match = matchSignalToCatalog(
      { ...baseSignal, matchHints: { countryCode: "Germany" } },
      ambiguousCatalog,
    );
    expect(match).toBeNull();
  });

  it("resolves the ambiguous country match when the text corroborates one specific supplier", () => {
    const match = matchSignalToCatalog(
      {
        ...baseSignal,
        title: "Fresenius Kabi flags dialysis concentrate shortage",
        matchHints: { countryCode: "Germany" },
      },
      ambiguousCatalog,
    );
    expect(match).toMatchObject({
      supplierId: "supplier_de_2",
      reason: "country",
      matchedValue: "DE",
    });
  });
});

describe("matchSignalToCatalog keyword token-boundary matching (A21)", () => {
  const gloveCatalog: TenantCatalog = {
    organizationId: "org_1",
    items: [{ id: "item_glove", name: "Glove", internalSku: null }],
    identifiers: [],
    suppliers: [],
    itemSuppliers: [],
  };

  it("does not match an item name that is a bare substring of an unrelated word", () => {
    const match = matchSignalToCatalog(
      {
        ...baseSignal,
        matchHints: {
          keywords: ["Gloversville regional distribution center recall"],
        },
      },
      gloveCatalog,
    );
    expect(match).toBeNull();
  });

  it("still matches the item name when it appears as a whole word", () => {
    const match = matchSignalToCatalog(
      { ...baseSignal, matchHints: { keywords: ["Nitrile glove shortage reported"] } },
      gloveCatalog,
    );
    expect(match).toMatchObject({ itemId: "item_glove", reason: "keyword" });
  });
});
