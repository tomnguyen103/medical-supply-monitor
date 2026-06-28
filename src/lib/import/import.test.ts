import { describe, it, expect } from "vitest";

import { parseCsv } from "./csv";
import { validateItemRows } from "./items";
import { validateSupplierRows } from "./suppliers";
import { validateFacilityRows } from "./facilities";

describe("parseCsv", () => {
  it("parses headers and rows, trimming headers and stripping a BOM", () => {
    const { headers, rows } = parseCsv("﻿ Name , Category \nAspirin,drug\n");
    expect(headers).toEqual(["Name", "Category"]);
    expect(rows).toEqual([{ Name: "Aspirin", Category: "drug" }]);
  });

  it("handles quoted fields containing commas", () => {
    const { rows } = parseCsv('name\n"Saline, 0.9%"\n');
    expect(rows[0]?.name).toBe("Saline, 0.9%");
  });

  it("skips blank lines", () => {
    const { rows } = parseCsv("name\nA\n\n\nB\n");
    expect(rows).toHaveLength(2);
  });
});

describe("validateItemRows", () => {
  it("accepts a full valid row", () => {
    const { valid, errors } = validateItemRows([
      {
        name: "Sodium Chloride",
        category: "iv_fluid",
        criticality: "life_critical",
        sku: "NS-1000",
        unit_of_measure: "bag",
        par_level: "500",
        reorder_point: "200",
        watch: "yes",
      },
    ]);
    expect(errors).toEqual([]);
    expect(valid[0]).toEqual({
      name: "Sodium Chloride",
      category: "iv_fluid",
      criticality: "life_critical",
      internalSku: "NS-1000",
      unitOfMeasure: "bag",
      parLevel: 500,
      reorderPoint: 200,
      isWatched: true,
      identifiers: [{ type: "sku", value: "ns1000", isPrimary: false }],
    });
  });

  it("applies defaults: category=other, criticality=medium, watched=true", () => {
    const { valid } = validateItemRows([{ name: "Gauze" }]);
    expect(valid[0]).toMatchObject({
      category: "other",
      criticality: "medium",
      isWatched: true,
      internalSku: null,
      parLevel: null,
      identifiers: [],
    });
  });

  it("matches header aliases case/space-insensitively", () => {
    const { valid, errors } = validateItemRows([
      { "Item Name": "Propofol", "UOM": "vial", "Watched": "no" },
    ]);
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({
      name: "Propofol",
      unitOfMeasure: "vial",
      isWatched: false,
      identifiers: [],
    });
  });

  it("collects NDC, GTIN, and SKU identifiers from item rows", () => {
    const { valid, errors } = validateItemRows([
      {
        name: "Furosemide Injection",
        sku: "RX-FUR-001",
        ndc: "0409-6102-26",
        gtin: "00304096102266",
      },
    ]);
    expect(errors).toEqual([]);
    expect(valid[0]?.identifiers).toEqual([
      { type: "ndc", value: "0409610226", isPrimary: true },
      { type: "gtin", value: "00304096102266", isPrimary: false },
      { type: "sku", value: "rxfur001", isPrimary: false },
    ]);
  });

  it("reports a row error for a missing name (with the spreadsheet line)", () => {
    const { valid, errors } = validateItemRows([{ category: "drug" }]);
    expect(valid).toHaveLength(0);
    expect(errors[0]).toMatchObject({ row: 2, field: "name" });
  });

  it("rejects unknown enums and non-integer numerics", () => {
    const badCategory = validateItemRows([{ name: "X", category: "potions" }]);
    expect(badCategory.errors[0]).toMatchObject({ field: "category" });

    const badPar = validateItemRows([{ name: "X", par_level: "-3" }]);
    expect(badPar.errors[0]).toMatchObject({ field: "par_level" });
  });

  it("flags duplicate SKUs within the file", () => {
    const { valid, errors } = validateItemRows([
      { name: "A", sku: "DUP" },
      { name: "B", sku: "dup" },
    ]);
    expect(valid).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 3, field: "sku" });
  });

  it("rejects rows with PHI-like catalog content without echoing the value", () => {
    const { valid, errors } = validateItemRows([
      { name: "Sterile saline", notes: "MRN: AB-12345" },
    ]);

    expect(valid).toHaveLength(0);
    expect(errors[0]).toMatchObject({ row: 2, field: "notes" });
    expect(errors[0]?.message).toContain("[redacted-patient-identifier]");
    expect(errors[0]?.message).not.toContain("AB-12345");
  });
});

describe("validateSupplierRows", () => {
  it("accepts a valid supplier and defaults type to manufacturer", () => {
    const { valid, errors } = validateSupplierRows([{ name: "Baxter" }]);
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ name: "Baxter", type: "manufacturer" });
  });

  it("rejects unknown supplier type and duplicate names", () => {
    expect(validateSupplierRows([{ name: "X", type: "robot" }]).errors[0]).toMatchObject({
      field: "type",
    });
    const dup = validateSupplierRows([{ name: "Acme" }, { name: "acme" }]);
    expect(dup.valid).toHaveLength(1);
    expect(dup.errors).toHaveLength(1);
  });

  it("rejects patient-specific supplier rows", () => {
    const { valid, errors } = validateSupplierRows([
      { name: "Baxter", "Patient Name": "Case patient" },
    ]);

    expect(valid).toHaveLength(0);
    expect(errors[0]).toMatchObject({ row: 2, field: "Patient Name" });
  });
});

describe("validateFacilityRows", () => {
  it("accepts a valid facility and defaults type to hospital", () => {
    const { valid, errors } = validateFacilityRows([
      { name: "Mercy Regional", city: "Springfield" },
    ]);
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ name: "Mercy Regional", type: "hospital", city: "Springfield" });
  });

  it("requires a name", () => {
    expect(validateFacilityRows([{ city: "Nowhere" }]).errors[0]).toMatchObject({
      field: "name",
    });
  });
});
