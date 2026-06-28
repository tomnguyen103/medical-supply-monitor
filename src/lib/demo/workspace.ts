import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { buildAuditLogInsert, type AuditLogInput } from "@/lib/audit";
import { db, isDatabaseConfigured } from "@/lib/db";
import {
  auditLog,
  alertRules,
  facilities,
  itemIdentifiers,
  items,
  itemSuppliers,
  inventorySnapshots,
  organizations,
  riskSignals,
  riskSnapshots,
  suppliers,
} from "@/lib/db/schema";
import { scoreItemRisk } from "@/lib/risk/scoring";

export interface DemoWorkspaceSeedResult {
  ok: boolean;
  skipped?: "database-unconfigured";
  inserted: {
    facilities: number;
    suppliers: number;
    items: number;
    identifiers: number;
    itemSuppliers: number;
    inventorySnapshots: number;
    riskSignals: number;
    riskSnapshots: number;
    alertRules: number;
  };
}

const DEMO_FACILITIES = [
  { key: "memorial", name: "Memorial Hospital", city: "Austin", region: "TX" },
  { key: "north", name: "North Distribution Center", city: "Round Rock", region: "TX" },
];

const DEMO_SUPPLIERS = [
  {
    key: "medline",
    name: "Medline Demo Supply",
    type: "distributor" as const,
    countryOfOrigin: "US",
  },
  {
    key: "steriflow",
    name: "Steriflow Manufacturing",
    type: "manufacturer" as const,
    countryOfOrigin: "US",
  },
  {
    key: "global-iv",
    name: "Global IV Components",
    type: "manufacturer" as const,
    countryOfOrigin: "MY",
  },
];

const DEMO_ITEMS = [
  {
    key: "saline",
    name: "0.9% Sodium Chloride IV Bag 1000 mL",
    category: "iv_fluid" as const,
    criticality: "life_critical" as const,
    internalSku: "DEMO-IV-NS-1000",
    unitOfMeasure: "case",
    daysOnHand: 5,
    supplierKey: "global-iv",
    isSoleSource: true,
    identifiers: [{ type: "ndc" as const, value: "00000-0001-10" }],
    signalDomains: ["shortage", "weather"] as const,
  },
  {
    key: "syringe",
    name: "Sterile syringe 10 mL luer lock",
    category: "device" as const,
    criticality: "high" as const,
    internalSku: "DEMO-DEV-SYR-10",
    unitOfMeasure: "box",
    daysOnHand: 18,
    supplierKey: "steriflow",
    isSoleSource: false,
    identifiers: [{ type: "gtin" as const, value: "00312345678901" }],
    signalDomains: ["recall"] as const,
  },
  {
    key: "mask",
    name: "N95 respirator",
    category: "ppe" as const,
    criticality: "high" as const,
    internalSku: "DEMO-PPE-N95",
    unitOfMeasure: "case",
    daysOnHand: 42,
    supplierKey: "medline",
    isSoleSource: false,
    identifiers: [{ type: "sku" as const, value: "N95-DEMO" }],
    signalDomains: ["supplier"] as const,
  },
];

export async function seedDemoWorkspace({
  organizationId,
  organizationName = "Demo Health System",
  asOf = new Date(),
  auditLog: auditLogInput,
}: {
  organizationId: string;
  organizationName?: string;
  asOf?: Date;
  auditLog: AuditLogInput;
}): Promise<DemoWorkspaceSeedResult> {
  if (!isDatabaseConfigured) {
    return { ok: false, skipped: "database-unconfigured", inserted: emptyInserted() };
  }

  const facilityRows = DEMO_FACILITIES.map((facility) => ({
    id: demoId(organizationId, "facility", facility.key),
    organizationId,
    name: facility.name,
    type: facility.key === "north" ? ("warehouse" as const) : ("hospital" as const),
    country: "US",
    region: facility.region,
    city: facility.city,
  }));
  const supplierRows = DEMO_SUPPLIERS.map((supplier) => ({
    id: demoId(organizationId, "supplier", supplier.key),
    organizationId,
    name: supplier.name,
    type: supplier.type,
    countryOfOrigin: supplier.countryOfOrigin,
    externalId: `demo-${supplier.key}`,
  }));
  const itemRows = DEMO_ITEMS.map((item) => ({
    id: demoId(organizationId, "item", item.key),
    organizationId,
    name: item.name,
    category: item.category,
    criticality: item.criticality,
    isWatched: true,
    internalSku: item.internalSku,
    unitOfMeasure: item.unitOfMeasure,
    attributes: { demo: true },
  }));
  const identifierRows = DEMO_ITEMS.flatMap((item) =>
    item.identifiers.map((identifier) => ({
      id: demoId(organizationId, "identifier", item.key, identifier.type, identifier.value),
      organizationId,
      itemId: demoId(organizationId, "item", item.key),
      type: identifier.type,
      value: identifier.value,
      isPrimary: true,
    })),
  );
  const itemSupplierRows = DEMO_ITEMS.map((item) => ({
    id: demoId(organizationId, "item_supplier", item.key),
    organizationId,
    itemId: demoId(organizationId, "item", item.key),
    supplierId: demoId(organizationId, "supplier", item.supplierKey),
    role: "primary",
    leadTimeDays: item.isSoleSource ? 28 : 14,
    isSoleSource: item.isSoleSource,
  }));
  const inventoryRows = DEMO_ITEMS.map((item) => ({
    id: demoId(organizationId, "inventory", item.key, asOf.toISOString().slice(0, 10)),
    organizationId,
    itemId: demoId(organizationId, "item", item.key),
    facilityId: demoId(organizationId, "facility", item.key === "mask" ? "north" : "memorial"),
    onHandQty: item.daysOnHand * 10,
    onOrderQty: item.daysOnHand < 10 ? 50 : 10,
    daysOnHand: item.daysOnHand,
    burnRatePerDay: 10,
    asOf,
    source: "demo_seed",
  }));
  const signalRows = DEMO_ITEMS.flatMap((item) =>
    item.signalDomains.map((domain, index) => buildDemoSignal(organizationId, item, domain, index, asOf)),
  );
  const snapshotRows = buildDemoSnapshots(organizationId, signalRows, asOf);
  const alertRuleRows = [
    {
      id: demoId(organizationId, "alert_rule", "critical"),
      organizationId,
      name: "Critical item review",
      description: "Demo rule for critical scored items.",
      enabled: true,
      domain: null,
      minSeverity: "high" as const,
      channels: ["in_app" as const],
      cooldownMinutes: 720,
      requireApprovalForCritical: true,
      createdBy: "demo-seed",
    },
  ];

  const inserted = emptyInserted();
  const demoSignalSources = [...new Set(signalRows.map((row) => row.source))];
  const [
    ,
    facilityResult,
    supplierResult,
    itemResult,
    identifierResult,
    itemSupplierResult,
    inventoryResult,
    ,
    signalResult,
    snapshotResult,
    alertRuleResult,
  ] = await db.batch([
    db
      .insert(organizations)
      .values({
        id: organizationId,
        name: organizationName,
        slug: organizationId.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        settings: {
          retention: {
            riskSignalDays: 365,
            riskSnapshotDays: 365,
            evidenceDays: 365,
            alertEventDays: 365,
            agentRunDays: 180,
            auditLogDays: 730,
          },
        },
      })
      .onConflictDoNothing(),
    db.insert(facilities).values(facilityRows).onConflictDoNothing().returning({ id: facilities.id }),
    db.insert(suppliers).values(supplierRows).onConflictDoNothing().returning({ id: suppliers.id }),
    db.insert(items).values(itemRows).onConflictDoNothing().returning({ id: items.id }),
    db.insert(itemIdentifiers).values(identifierRows).onConflictDoNothing().returning({ id: itemIdentifiers.id }),
    db.insert(itemSuppliers).values(itemSupplierRows).onConflictDoNothing().returning({ id: itemSuppliers.id }),
    db
      .insert(inventorySnapshots)
      .values(inventoryRows)
      .onConflictDoNothing()
      .returning({ id: inventorySnapshots.id }),
    db.delete(riskSignals).where(
      and(
        eq(riskSignals.organizationId, organizationId),
        inArray(riskSignals.source, demoSignalSources),
      ),
    ),
    db.insert(riskSignals).values(signalRows).onConflictDoNothing().returning({ id: riskSignals.id }),
    db.insert(riskSnapshots).values(snapshotRows).onConflictDoNothing().returning({ id: riskSnapshots.id }),
    db.insert(alertRules).values(alertRuleRows).onConflictDoNothing().returning({ id: alertRules.id }),
    db
      .insert(auditLog)
      .values(buildAuditLogInsert(auditLogInput))
      .returning({ id: auditLog.id }),
  ] as const);

  inserted.facilities = facilityResult.length;
  inserted.suppliers = supplierResult.length;
  inserted.items = itemResult.length;
  inserted.identifiers = identifierResult.length;
  inserted.itemSuppliers = itemSupplierResult.length;
  inserted.inventorySnapshots = inventoryResult.length;
  inserted.riskSignals = signalResult.length;
  inserted.riskSnapshots = snapshotResult.length;
  inserted.alertRules = alertRuleResult.length;

  return { ok: true, inserted };
}

function buildDemoSignal(
  organizationId: string,
  item: (typeof DEMO_ITEMS)[number],
  domain: (typeof item.signalDomains)[number],
  index: number,
  asOf: Date,
) {
  const itemId = demoId(organizationId, "item", item.key);
  const signalId = demoId(organizationId, "risk_signal", item.key, domain);
  const severityScore = domain === "shortage" ? 96 : domain === "recall" ? 72 : 58;
  return {
    id: signalId,
    organizationId,
    source: `demo_${domain}`,
    domain,
    entityType: "item" as const,
    entityId: item.internalSku,
    itemId,
    title: `${formatDomain(domain)} signal for ${item.name}`,
    summary: `Demo ${domain} signal for operations review.`,
    severity: severityScore >= 90 ? ("critical" as const) : ("high" as const),
    severityScore,
    confidence: 0.82 - index * 0.04,
    status: "active" as const,
    observedAt: offsetDays(asOf, -index - 1),
    sourcePublishedAt: offsetDays(asOf, -index - 1),
    lastFetchedAt: asOf,
    stalenessStatus: "fresh" as const,
    evidenceUrl: "https://example.com/demo-risk-evidence",
    dedupeKey: ["demo", item.key, domain].join(":"),
    metadata: { demo: true, source: "buyer-ready workspace" },
  };
}

function buildDemoSnapshots(
  organizationId: string,
  signals: ReturnType<typeof buildDemoSignal>[],
  asOf: Date,
) {
  return DEMO_ITEMS.map((item) => {
    const itemId = demoId(organizationId, "item", item.key);
    const itemSignals = signals.filter((signal) => signal.itemId === itemId);
    const result = scoreItemRisk({
      asOf,
      daysOnHand: item.daysOnHand,
      isSoleSource: item.isSoleSource,
      signals: itemSignals.map((signal) => ({
        id: signal.id,
        domain: signal.domain,
        severityScore: signal.severityScore,
        confidence: signal.confidence,
        stalenessStatus: signal.stalenessStatus,
        observedAt: signal.observedAt,
        sourcePublishedAt: signal.sourcePublishedAt,
        lastFetchedAt: signal.lastFetchedAt,
      })),
    });
    const changeSummary = {
      status: "initial",
      changed: false,
      deltaScore: null,
      previousSnapshotId: null,
      currentRiskLevel: result.riskLevel,
    };
    return {
      id: demoId(organizationId, "risk_snapshot", item.key, asOf.toISOString().slice(0, 10)),
      organizationId,
      itemId,
      scoringVersion: result.scoringVersion,
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      confidence: result.confidence,
      components: result.components,
      inputs: result.inputs,
      stalenessStatus: result.stalenessStatus,
      worstSignalAt: result.worstSignalAt,
      rationale: result.rationale,
      changeSummary,
      computedAt: asOf,
    };
  });
}

function emptyInserted(): DemoWorkspaceSeedResult["inserted"] {
  return {
    facilities: 0,
    suppliers: 0,
    items: 0,
    identifiers: 0,
    itemSuppliers: 0,
    inventorySnapshots: 0,
    riskSignals: 0,
    riskSnapshots: 0,
    alertRules: 0,
  };
}

function demoId(...parts: string[]) {
  const hex = createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function offsetDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDomain(domain: string) {
  return domain.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
