/**
 * Source-agnostic connector contract.
 *
 * Every external provider (openFDA, USGS, NWS, GDELT, CISA KEV, OFAC, and the
 * OPTIONAL WorldMonitor enrichment) implements `Connector` and emits the SAME
 * normalized `NormalizedRiskSignal`. No provider-specific business logic leaks
 * past this boundary — the rest of the app only ever sees RiskSignals.
 *
 * Connectors are pure data adapters: fetch → normalize → emit. They never
 * write to the database, score risk, or send alerts. Persistence, scoring, and
 * delivery happen downstream in deterministic, auditable steps.
 */

// Value import (not `import type`): we derive union types from the enums'
// runtime `enumValues`. Consumers that only need the types should `import type`
// from this module so the schema runtime is not pulled into client bundles.
import {
  riskDomainEnum,
  entityTypeEnum,
  severityEnum,
  stalenessStatusEnum,
} from "@/lib/db/schema";

export type RiskDomain = (typeof riskDomainEnum.enumValues)[number];
export type EntityType = (typeof entityTypeEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
export type StalenessStatus = (typeof stalenessStatusEnum.enumValues)[number];

/**
 * The normalized signal a connector produces, before tenant matching and
 * persistence. Mirrors the freshness/evidence fields required for every signal.
 */
export interface NormalizedRiskSignal {
  /** Connector id, e.g. "openfda_drug_shortage". */
  source: string;
  domain: RiskDomain;
  entityType: EntityType;
  /** External id of the subject (NDC, supplier id, ISO country code, …). */
  entityId: string | null;
  title: string;
  summary?: string;
  severity: Severity;
  /** 0–100 numeric severity for deterministic scoring. */
  severityScore?: number;
  /** 0–1 confidence in the signal. */
  confidence?: number;
  observedAt?: Date;
  sourcePublishedAt?: Date;
  lastFetchedAt: Date;
  stalenessStatus: StalenessStatus;
  evidenceUrl?: string;
  /** Raw provider payload, retained as evidence (no PHI). */
  raw?: Record<string, unknown>;
  /** Stable idempotency key within (org, source). */
  dedupeKey: string;
  /** Hints used downstream to match this signal to a tenant's catalog. */
  matchHints?: {
    ndc?: string;
    gtin?: string;
    supplierName?: string;
    countryCode?: string;
    keywords?: string[];
  };
}

/** Context passed to a connector run (Phase 3 will flesh this out). */
export interface ConnectorContext {
  /** Window start for incremental fetches. */
  since?: Date;
  /** Abort signal for cooperative cancellation. */
  signal?: AbortSignal;
  /** Descriptive User-Agent required by some public feeds (e.g. NWS). */
  userAgent: string;
}

export interface Connector {
  /** Stable id used as `risk_signals.source` and in the registry. */
  readonly id: string;
  readonly name: string;
  readonly domain: RiskDomain;
  readonly description: string;
  /** WorldMonitor and other enrichers set this true → never foundational. */
  readonly optional: boolean;
  /** Whether required configuration is present (most public feeds need none). */
  isConfigured(): boolean;
  /** Fetch + normalize. Returns generic signals; no DB writes, no scoring. */
  fetch(ctx: ConnectorContext): Promise<NormalizedRiskSignal[]>;
}
