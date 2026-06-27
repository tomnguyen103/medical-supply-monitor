/**
 * Drizzle schema — Critical Medical Supply Resilience Monitor (Phase 1 draft).
 *
 * Guardrails encoded here:
 *  - Multi-tenancy: every business table is scoped by `organization_id`, which
 *    is the Clerk organization id (text). Tenant isolation = filter on it.
 *  - NO PHI / no patient-level data. Tables describe supplies, suppliers,
 *    inventory aggregates, external risk signals, and operations — never people.
 *  - Source-agnostic ingestion: external providers normalize into `risk_signals`
 *    (the generic RiskSignal model) with full freshness + evidence metadata.
 *  - Deterministic, explainable, versioned, auditable scoring: `risk_snapshots`
 *    carry a scoring version, a structured component breakdown, the inputs used,
 *    and a link to the previous snapshot for changed-since-yesterday.
 *  - AI agents (`agent_runs`) record drafts/summaries only; they never own
 *    tenant access, scoring math, final writes, or critical alert delivery.
 *
 * This is a first draft intended to evolve; treat column choices as provisional.
 */

import {
  pgTable,
  pgEnum,
  text,
  uuid,
  timestamp,
  jsonb,
  integer,
  boolean,
  doublePrecision,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Shared column helpers                                                       */
/* -------------------------------------------------------------------------- */

const id = () => uuid("id").primaryKey().defaultRandom();

const organizationId = () =>
  text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const itemCategoryEnum = pgEnum("item_category", [
  "drug",
  "device",
  "iv_fluid",
  "ppe",
  "oxygen",
  "lab_reagent",
  "sterile_supply",
  "consumable",
  "other",
]);

export const criticalityEnum = pgEnum("criticality", [
  "low",
  "medium",
  "high",
  "life_critical",
]);

export const identifierTypeEnum = pgEnum("identifier_type", [
  "ndc",
  "gtin",
  "upc",
  "hibcc",
  "sku",
  "mpn",
  "fda_app_no",
  "rxcui",
  "other",
]);

export const supplierTypeEnum = pgEnum("supplier_type", [
  "manufacturer",
  "distributor",
  "wholesaler",
  "gpo",
  "other",
]);

export const facilityTypeEnum = pgEnum("facility_type", [
  "hospital",
  "clinic",
  "pharmacy",
  "warehouse",
  "other",
]);

export const procurementEventTypeEnum = pgEnum("procurement_event_type", [
  "po_created",
  "po_updated",
  "partial_fill",
  "backorder",
  "delayed_shipment",
  "received",
  "cancelled",
  "other",
]);

/** Generic risk domains a signal can belong to (source-agnostic). */
export const riskDomainEnum = pgEnum("risk_domain", [
  "shortage",
  "recall",
  "supplier",
  "inventory",
  "procurement",
  "weather",
  "disaster",
  "geopolitical",
  "sanctions",
  "cyber",
  "infrastructure",
  "logistics",
  "other",
]);

/** What kind of entity a signal is attached to. */
export const entityTypeEnum = pgEnum("entity_type", [
  "item",
  "ndc",
  "gtin",
  "supplier",
  "supplier_site",
  "manufacturer",
  "country",
  "port",
  "route",
  "chokepoint",
  "facility",
  "region",
  "other",
]);

export const severityEnum = pgEnum("severity", [
  "info",
  "low",
  "moderate",
  "high",
  "critical",
]);

export const stalenessStatusEnum = pgEnum("staleness_status", [
  "fresh",
  "aging",
  "stale",
  "expired",
  "unknown",
]);

export const signalStatusEnum = pgEnum("signal_status", [
  "active",
  "resolved",
  "superseded",
]);

export const alertChannelEnum = pgEnum("alert_channel", [
  "in_app",
  "email",
  "slack",
  "teams",
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "pending",
  "awaiting_approval",
  "approved",
  "rejected",
  "queued",
  "sent",
  "failed",
  "suppressed",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "open",
  "in_review",
  "approved",
  "rejected",
  "dismissed",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const evidenceTypeEnum = pgEnum("evidence_type", [
  "source_document",
  "api_response",
  "csv_row",
  "computed",
  "external_link",
  "other",
]);

export const actorTypeEnum = pgEnum("actor_type", ["user", "agent", "system"]);

/* -------------------------------------------------------------------------- */
/* Tenancy                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Mirror of a Clerk organization. `id` IS the Clerk org id (e.g. "org_xxx").
 * Clerk remains the source of truth for membership/roles; this row holds local
 * tenant metadata only.
 */
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug"),
  plan: text("plan").notNull().default("free"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps(),
});

export const facilities = pgTable(
  "facilities",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    type: facilityTypeEnum("type").notNull().default("hospital"),
    externalId: text("external_id"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    timezone: text("timezone"),
    ...timestamps(),
  },
  (t) => [
    index("facilities_org_idx").on(t.organizationId),
    uniqueIndex("facilities_org_external_idx").on(t.organizationId, t.externalId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Catalog                                                                     */
/* -------------------------------------------------------------------------- */

export const items = pgTable(
  "items",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    description: text("description"),
    category: itemCategoryEnum("category").notNull().default("other"),
    criticality: criticalityEnum("criticality").notNull().default("medium"),
    /** Watchlist membership — whether the item is actively monitored. */
    isWatched: boolean("is_watched").notNull().default(true),
    internalSku: text("internal_sku"),
    unitOfMeasure: text("unit_of_measure"),
    parLevel: integer("par_level"),
    reorderPoint: integer("reorder_point"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
  },
  (t) => [
    index("items_org_idx").on(t.organizationId),
    index("items_org_category_idx").on(t.organizationId, t.category),
    uniqueIndex("items_org_sku_idx").on(t.organizationId, t.internalSku),
  ],
);

export const itemIdentifiers = pgTable(
  "item_identifiers",
  {
    id: id(),
    organizationId: organizationId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    type: identifierTypeEnum("type").notNull(),
    value: text("value").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index("item_identifiers_item_idx").on(t.itemId),
    index("item_identifiers_lookup_idx").on(t.organizationId, t.type, t.value),
    uniqueIndex("item_identifiers_unique_idx").on(t.organizationId, t.type, t.value),
  ],
);

/* -------------------------------------------------------------------------- */
/* Suppliers + exposure                                                        */
/* -------------------------------------------------------------------------- */

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    type: supplierTypeEnum("type").notNull().default("manufacturer"),
    duns: text("duns"),
    externalId: text("external_id"),
    countryOfOrigin: text("country_of_origin"),
    riskNotes: text("risk_notes"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
  },
  (t) => [
    index("suppliers_org_idx").on(t.organizationId),
    uniqueIndex("suppliers_org_external_idx").on(t.organizationId, t.externalId),
  ],
);

export const supplierSites = pgTable(
  "supplier_sites",
  {
    id: id(),
    organizationId: organizationId(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    siteType: text("site_type"),
    country: text("country"),
    region: text("region"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    externalId: text("external_id"),
    ...timestamps(),
  },
  (t) => [
    index("supplier_sites_org_idx").on(t.organizationId),
    index("supplier_sites_supplier_idx").on(t.supplierId),
  ],
);

/** Item ↔ supplier exposure (sole-source flags, lead times, roles). */
export const itemSuppliers = pgTable(
  "item_suppliers",
  {
    id: id(),
    organizationId: organizationId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    supplierSiteId: uuid("supplier_site_id").references(() => supplierSites.id, {
      onDelete: "set null",
    }),
    role: text("role").notNull().default("primary"),
    leadTimeDays: integer("lead_time_days"),
    isSoleSource: boolean("is_sole_source").notNull().default(false),
    contractRef: text("contract_ref"),
    ...timestamps(),
  },
  (t) => [
    index("item_suppliers_org_idx").on(t.organizationId),
    index("item_suppliers_item_idx").on(t.itemId),
    uniqueIndex("item_suppliers_unique_idx").on(t.organizationId, t.itemId, t.supplierId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Inventory + procurement signals (aggregates only — no patient data)         */
/* -------------------------------------------------------------------------- */

export const inventorySnapshots = pgTable(
  "inventory_snapshots",
  {
    id: id(),
    organizationId: organizationId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").references(() => facilities.id, {
      onDelete: "set null",
    }),
    onHandQty: doublePrecision("on_hand_qty"),
    onOrderQty: doublePrecision("on_order_qty"),
    daysOnHand: doublePrecision("days_on_hand"),
    burnRatePerDay: doublePrecision("burn_rate_per_day"),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("csv_import"),
    ...timestamps(),
  },
  (t) => [
    index("inventory_snapshots_org_idx").on(t.organizationId),
    index("inventory_snapshots_item_idx").on(t.itemId, t.asOf),
  ],
);

export const procurementEvents = pgTable(
  "procurement_events",
  {
    id: id(),
    organizationId: organizationId(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    facilityId: uuid("facility_id").references(() => facilities.id, {
      onDelete: "set null",
    }),
    type: procurementEventTypeEnum("type").notNull(),
    poNumber: text("po_number"),
    quantity: doublePrecision("quantity"),
    filledQuantity: doublePrecision("filled_quantity"),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("csv_import"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
  },
  (t) => [
    index("procurement_events_org_idx").on(t.organizationId),
    index("procurement_events_item_idx").on(t.itemId, t.occurredAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* RiskSignal — the generic normalized model every connector emits             */
/* -------------------------------------------------------------------------- */

export const riskSignals = pgTable(
  "risk_signals",
  {
    id: id(),
    organizationId: organizationId(),
    /** Connector id, e.g. "openfda_drug_shortage". Kept as text (source-agnostic). */
    source: text("source").notNull(),
    domain: riskDomainEnum("domain").notNull(),
    entityType: entityTypeEnum("entity_type").notNull(),
    /** External entity id this signal is about (NDC, supplier id, country code…). */
    entityId: text("entity_id"),
    /** Optional matches into the tenant's catalog. */
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    facilityId: uuid("facility_id").references(() => facilities.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    summary: text("summary"),
    severity: severityEnum("severity").notNull().default("info"),
    severityScore: doublePrecision("severity_score"),
    confidence: doublePrecision("confidence"),
    status: signalStatusEnum("status").notNull().default("active"),
    // Freshness metadata (required by the product spec for every signal).
    observedAt: timestamp("observed_at", { withTimezone: true }),
    sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    stalenessStatus: stalenessStatusEnum("staleness_status").notNull().default("unknown"),
    evidenceUrl: text("evidence_url"),
    /** Pointer to a stored raw payload (evidence_artifacts id or storage key). */
    rawPayloadRef: text("raw_payload_ref"),
    /** Idempotency key for upserts: org + source + entity + version of the fact. */
    dedupeKey: text("dedupe_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
  },
  (t) => [
    index("risk_signals_org_idx").on(t.organizationId),
    index("risk_signals_domain_idx").on(t.organizationId, t.domain),
    index("risk_signals_item_idx").on(t.itemId),
    index("risk_signals_supplier_idx").on(t.supplierId),
    uniqueIndex("risk_signals_dedupe_idx").on(t.organizationId, t.source, t.dedupeKey),
  ],
);

/* -------------------------------------------------------------------------- */
/* Deterministic, explainable, versioned risk snapshots                        */
/* -------------------------------------------------------------------------- */

/** One explainable scoring component (factor → weighted contribution). */
export type RiskScoreComponent = {
  factor: string;
  weight: number;
  rawValue: number | string | null;
  contribution: number;
  explanation: string;
  signalIds?: string[];
};

export const riskSnapshots = pgTable(
  "risk_snapshots",
  {
    id: id(),
    organizationId: organizationId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").references(() => facilities.id, {
      onDelete: "set null",
    }),
    /** Pinned scoring algorithm version, e.g. "v0.1.0". Never null → auditable. */
    scoringVersion: text("scoring_version").notNull(),
    riskScore: doublePrecision("risk_score").notNull(),
    riskLevel: severityEnum("risk_level").notNull(),
    confidence: doublePrecision("confidence"),
    /** Structured, human-readable breakdown of how the score was produced. */
    components: jsonb("components").$type<RiskScoreComponent[]>().notNull().default([]),
    /** Snapshot of the exact inputs used, for reproducibility / audit. */
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    stalenessStatus: stalenessStatusEnum("staleness_status").notNull().default("unknown"),
    worstSignalAt: timestamp("worst_signal_at", { withTimezone: true }),
    /** Deterministic one-line rationale (NOT AI-authored). */
    rationale: text("rationale"),
    /** Link to the previous snapshot to compute changed-since-yesterday. */
    previousSnapshotId: uuid("previous_snapshot_id").references(
      (): AnyPgColumn => riskSnapshots.id,
      { onDelete: "set null" },
    ),
    changeSummary: jsonb("change_summary").$type<Record<string, unknown>>(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [
    index("risk_snapshots_org_idx").on(t.organizationId),
    index("risk_snapshots_item_idx").on(t.itemId, t.computedAt),
    index("risk_snapshots_level_idx").on(t.organizationId, t.riskLevel),
  ],
);

/* -------------------------------------------------------------------------- */
/* Evidence                                                                    */
/* -------------------------------------------------------------------------- */

export const evidenceArtifacts = pgTable(
  "evidence_artifacts",
  {
    id: id(),
    organizationId: organizationId(),
    signalId: uuid("signal_id").references(() => riskSignals.id, {
      onDelete: "cascade",
    }),
    snapshotId: uuid("snapshot_id").references(() => riskSnapshots.id, {
      onDelete: "cascade",
    }),
    type: evidenceTypeEnum("type").notNull().default("source_document"),
    title: text("title"),
    url: text("url"),
    sourceName: text("source_name"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    contentHash: text("content_hash"),
    /** Pointer to large raw payload in object storage; keep DB rows lean. */
    storageRef: text("storage_ref"),
    /** Small structured payloads may live inline (no PHI, ever). */
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (t) => [
    index("evidence_artifacts_org_idx").on(t.organizationId),
    index("evidence_artifacts_signal_idx").on(t.signalId),
    index("evidence_artifacts_snapshot_idx").on(t.snapshotId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Alerts                                                                      */
/* -------------------------------------------------------------------------- */

export const alertRules = pgTable(
  "alert_rules",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    domain: riskDomainEnum("domain"),
    minSeverity: severityEnum("min_severity").notNull().default("high"),
    itemFilter: jsonb("item_filter").$type<Record<string, unknown>>().notNull().default({}),
    facilityId: uuid("facility_id").references(() => facilities.id, {
      onDelete: "set null",
    }),
    channels: alertChannelEnum("channels").array().notNull().default([]),
    cooldownMinutes: integer("cooldown_minutes").notNull().default(720),
    /** Critical alerts require human approval before delivery (guardrail). */
    requireApprovalForCritical: boolean("require_approval_for_critical")
      .notNull()
      .default(true),
    createdBy: text("created_by"),
    ...timestamps(),
  },
  (t) => [index("alert_rules_org_idx").on(t.organizationId)],
);

export const alertEvents = pgTable(
  "alert_events",
  {
    id: id(),
    organizationId: organizationId(),
    ruleId: uuid("rule_id").references(() => alertRules.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    signalId: uuid("signal_id").references(() => riskSignals.id, {
      onDelete: "set null",
    }),
    snapshotId: uuid("snapshot_id").references(() => riskSnapshots.id, {
      onDelete: "set null",
    }),
    severity: severityEnum("severity").notNull(),
    channel: alertChannelEnum("channel").notNull(),
    status: alertStatusEnum("status").notNull().default("pending"),
    title: text("title").notNull(),
    body: text("body"),
    /** Every alert must carry evidence, freshness, and confidence (guardrail). */
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    confidence: doublePrecision("confidence"),
    freshness: jsonb("freshness").$type<Record<string, unknown>>().notNull().default({}),
    /** Idempotency / cooldown key. */
    dedupeKey: text("dedupe_key").notNull(),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps(),
  },
  (t) => [
    index("alert_events_org_idx").on(t.organizationId),
    index("alert_events_status_idx").on(t.organizationId, t.status),
    uniqueIndex("alert_events_dedupe_idx").on(t.organizationId, t.dedupeKey),
  ],
);

/* -------------------------------------------------------------------------- */
/* AI workflow bookkeeping + human-in-the-loop                                 */
/* -------------------------------------------------------------------------- */

/**
 * Records of LangGraph/LangChain runs. Agents summarize, classify, and draft;
 * these rows are for tracing/audit only and never hold authority over tenant
 * access, scoring math, final writes, or critical alert delivery.
 */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    graph: text("graph").notNull(),
    node: text("node"),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    langsmithRunId: text("langsmith_run_id"),
    traceUrl: text("trace_url"),
    model: text("model"),
    usage: jsonb("usage").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps(),
  },
  (t) => [
    index("agent_runs_org_idx").on(t.organizationId),
    index("agent_runs_graph_idx").on(t.graph, t.status),
  ],
);

export const humanReviewTasks = pgTable(
  "human_review_tasks",
  {
    id: id(),
    organizationId: organizationId(),
    type: text("type").notNull(),
    status: reviewStatusEnum("status").notNull().default("open"),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    title: text("title").notNull(),
    description: text("description"),
    assignedTo: text("assigned_to"),
    decision: text("decision"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps(),
  },
  (t) => [
    index("human_review_tasks_org_idx").on(t.organizationId),
    index("human_review_tasks_status_idx").on(t.organizationId, t.status),
  ],
);

/* -------------------------------------------------------------------------- */
/* Audit log                                                                   */
/* -------------------------------------------------------------------------- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    summary: text("summary"),
    /** Metadata must be redaction-safe — no PHI, no secrets. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_log_org_idx").on(t.organizationId, t.createdAt),
    index("audit_log_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Facility = typeof facilities.$inferSelect;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemIdentifier = typeof itemIdentifiers.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type SupplierSite = typeof supplierSites.$inferSelect;
export type ItemSupplier = typeof itemSuppliers.$inferSelect;
export type InventorySnapshot = typeof inventorySnapshots.$inferSelect;
export type ProcurementEvent = typeof procurementEvents.$inferSelect;
export type RiskSignal = typeof riskSignals.$inferSelect;
export type NewRiskSignal = typeof riskSignals.$inferInsert;
export type RiskSnapshot = typeof riskSnapshots.$inferSelect;
export type NewRiskSnapshot = typeof riskSnapshots.$inferInsert;
export type EvidenceArtifact = typeof evidenceArtifacts.$inferSelect;
export type AlertRule = typeof alertRules.$inferSelect;
export type AlertEvent = typeof alertEvents.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type HumanReviewTask = typeof humanReviewTasks.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
