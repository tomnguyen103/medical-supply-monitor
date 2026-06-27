import { describe, expect, it } from "vitest";

import cisaKev from "./__fixtures__/cisa-kev.json";
import openFdaShortage from "./__fixtures__/openfda-drug-shortage.json";
import openFdaDeviceRecall from "./__fixtures__/openfda-device-recall.json";
import { normalizeCisaKev } from "./cisa-kev";
import { normalizeOpenFdaDrugShortage } from "./openfda-drug-shortages";
import { normalizeOpenFdaRecall } from "./openfda-recalls";

const fetchedAt = new Date("2026-06-27T12:00:00Z");

describe("connector normalization", () => {
  it("normalizes openFDA drug shortages with NDC match hints", () => {
    const signal = normalizeOpenFdaDrugShortage(openFdaShortage, fetchedAt);
    expect(signal).toMatchObject({
      source: "openfda_drug_shortage",
      domain: "shortage",
      entityType: "ndc",
      entityId: "0409-6102-26",
      severity: "high",
      matchHints: {
        ndc: "0409-6102-26",
        supplierName: "Hospira, Inc., a Pfizer Company",
      },
    });
    expect(signal?.dedupeKey).toContain("0409-6102-26");
    expect(signal?.raw).toEqual(openFdaShortage);
  });

  it("normalizes openFDA recalls with GTIN and firm match hints", () => {
    const signal = normalizeOpenFdaRecall(openFdaDeviceRecall, "device", fetchedAt);
    expect(signal).toMatchObject({
      source: "openfda_recall",
      domain: "recall",
      entityType: "gtin",
      entityId: "20884521128009",
      severity: "critical",
      matchHints: {
        gtin: "20884521128009",
        supplierName: "Covidien LP",
        countryCode: "United States",
      },
    });
  });

  it("normalizes CISA KEV supplier cyber signals", () => {
    const signal = normalizeCisaKev(cisaKev, fetchedAt);
    expect(signal).toMatchObject({
      source: "cisa_kev",
      domain: "cyber",
      entityType: "supplier",
      entityId: "microsoft:windows",
      severity: "high",
      matchHints: {
        supplierName: "Microsoft",
      },
    });
  });
});
