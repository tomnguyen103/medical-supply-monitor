import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getActiveConnectors, getConnector } from "@/lib/connectors/registry";
import type { Connector } from "@/lib/connectors/types";
import type { NormalizedRiskSignal } from "@/lib/connectors/types";
import { db, isDatabaseConfigured } from "@/lib/db";
import {
  itemIdentifiers,
  itemSuppliers,
  items,
  organizations,
  suppliers,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  matchSignalToCatalog,
  type TenantCatalog,
} from "./matching";
import { reconcileResolvedSignals, upsertMatchedSignal } from "./persistence";

export interface IngestionRunOptions {
  connectorIds?: string[];
  since?: Date;
  signal?: AbortSignal;
  timeoutMs?: number;
  tenantBatchSize?: number;
}

export const CONNECTOR_FETCH_TIMEOUT_MS = 15_000;
export const INGESTION_TENANT_BATCH_SIZE = 25;
export const INGESTION_CATALOG_LIMIT = 5_000;

export interface IngestionConnectorSummary {
  connectorId: string;
  fetched: number;
  matched: number;
  persisted: number;
  failed: number;
  /** Previously-active signals for this org+source no longer present in
   * this fetch, now marked "resolved". */
  resolved: number;
  error?: string;
}

export interface IngestionRunSummary {
  ok: boolean;
  skipped?: "database-unconfigured" | "no-connectors";
  tenants: number;
  fetched: number;
  matched: number;
  persisted: number;
  failed: number;
  resolved: number;
  connectors: IngestionConnectorSummary[];
}

export async function runRiskIngestion(
  options: IngestionRunOptions = {},
): Promise<IngestionRunSummary> {
  if (!isDatabaseConfigured) {
    return emptySummary("database-unconfigured");
  }

  const connectors = selectConnectors(options.connectorIds);
  if (connectors.length === 0) {
    return emptySummary("no-connectors");
  }

  const tenantIds = await loadTenantIds();
  const summaries: IngestionConnectorSummary[] = [];

  for (const connector of connectors) {
    try {
      const signals = await fetchConnectorSignals(connector, {
        since: options.since,
        userAgent: env.connectors.userAgent,
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? CONNECTOR_FETCH_TIMEOUT_MS,
      });
      const result = await persistSignalsForTenants(
        connector.id,
        signals,
        tenantIds,
        options.tenantBatchSize ?? INGESTION_TENANT_BATCH_SIZE,
        options.signal,
      );
      summaries.push({
        connectorId: connector.id,
        fetched: signals.length,
        matched: result.matched,
        persisted: result.persisted,
        failed: result.failed,
        resolved: result.resolved,
      });
    } catch (error) {
      summaries.push({
        connectorId: connector.id,
        fetched: 0,
        matched: 0,
        persisted: 0,
        failed: 0,
        resolved: 0,
        error: error instanceof Error ? error.message : "Connector failed.",
      });
    }
  }

  return {
    ok: summaries.every((summary) => !summary.error && summary.failed === 0),
    tenants: tenantIds.length,
    fetched: summaries.reduce((sum, row) => sum + row.fetched, 0),
    matched: summaries.reduce((sum, row) => sum + row.matched, 0),
    persisted: summaries.reduce((sum, row) => sum + row.persisted, 0),
    failed: summaries.reduce((sum, row) => sum + row.failed, 0),
    resolved: summaries.reduce((sum, row) => sum + row.resolved, 0),
    connectors: summaries,
  };
}

function selectConnectors(connectorIds: string[] | undefined) {
  if (!connectorIds?.length) return getActiveConnectors();
  return connectorIds
    .map((id) => getConnector(id))
    .filter((connector): connector is Connector => Boolean(connector?.isConfigured()));
}

async function fetchConnectorSignals(
  connector: Connector,
  {
    since,
    userAgent,
    signal,
    timeoutMs,
  }: {
    since?: Date;
    userAgent: string;
    signal?: AbortSignal;
    timeoutMs: number;
  },
) {
  ensureNotAborted(signal);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromParent = () => controller.abort();
  signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    return await connector.fetch({
      since,
      userAgent,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new Error(`Connector ${connector.id} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

export async function persistSignalsForTenants(
  source: string,
  signals: NormalizedRiskSignal[],
  tenantIds: string[],
  tenantBatchSize: number,
  abortSignal?: AbortSignal,
): Promise<{ matched: number; persisted: number; failed: number; resolved: number }> {
  let matched = 0;
  let persisted = 0;
  let failed = 0;
  let resolved = 0;

  for (const tenantBatch of chunk(tenantIds, tenantBatchSize)) {
    ensureNotAborted(abortSignal);
    const catalogs = await Promise.all(tenantBatch.map((id) => loadTenantCatalog(id)));
    for (const catalog of catalogs) {
      const seenDedupeKeys: string[] = [];
      for (const riskSignal of signals) {
        ensureNotAborted(abortSignal);
        const match = matchSignalToCatalog(riskSignal, catalog);
        if (!match) continue;
        matched += 1;
        // Recorded as "seen" as soon as it matches, before the persist
        // attempt below - a transient write failure must not make
        // reconciliation treat a still-source-reported signal as gone.
        seenDedupeKeys.push(riskSignal.dedupeKey);
        try {
          ensureNotAborted(abortSignal);
          await upsertMatchedSignal(riskSignal, match);
          persisted += 1;
        } catch {
          failed += 1;
        }
      }
      // Reconcile even when nothing matched this tenant this run — a
      // previously-matched signal that no longer matches (source resolved
      // it, or the catalog changed) should stop being reported "active".
      resolved += await reconcileResolvedSignals(
        catalog.organizationId,
        source,
        seenDedupeKeys,
      );
    }
  }

  return { matched, persisted, failed, resolved };
}

async function loadTenantIds(): Promise<string[]> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.id));

  return rows.map((org) => org.id);
}

async function loadTenantCatalog(organizationId: string): Promise<TenantCatalog> {
  const [itemRows, supplierRows] = await Promise.all([
    db
      .select({
        id: items.id,
        name: items.name,
        internalSku: items.internalSku,
      })
      .from(items)
      .where(eq(items.organizationId, organizationId))
      .orderBy(desc(items.updatedAt), desc(items.createdAt), desc(items.id))
      .limit(INGESTION_CATALOG_LIMIT),
    db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        countryOfOrigin: suppliers.countryOfOrigin,
      })
      .from(suppliers)
      .where(eq(suppliers.organizationId, organizationId))
      .orderBy(desc(suppliers.updatedAt), desc(suppliers.createdAt), desc(suppliers.id))
      .limit(INGESTION_CATALOG_LIMIT),
  ]);

  const itemIds = itemRows.map((item) => item.id);
  const supplierIds = supplierRows.map((supplier) => supplier.id);
  const [identifierRows, itemSupplierRows] = await Promise.all([
    itemIds.length === 0
      ? []
      : db
          .select({
            itemId: itemIdentifiers.itemId,
            type: itemIdentifiers.type,
            value: itemIdentifiers.value,
          })
          .from(itemIdentifiers)
          .where(
            and(
              eq(itemIdentifiers.organizationId, organizationId),
              inArray(itemIdentifiers.itemId, itemIds),
            ),
          )
          .orderBy(asc(itemIdentifiers.itemId), asc(itemIdentifiers.type), asc(itemIdentifiers.value)),
    itemIds.length === 0 || supplierIds.length === 0
      ? []
      : db
          .select({
            itemId: itemSuppliers.itemId,
            supplierId: itemSuppliers.supplierId,
          })
          .from(itemSuppliers)
          .where(
            and(
              eq(itemSuppliers.organizationId, organizationId),
              inArray(itemSuppliers.itemId, itemIds),
              inArray(itemSuppliers.supplierId, supplierIds),
            ),
          )
          .orderBy(asc(itemSuppliers.itemId), asc(itemSuppliers.supplierId)),
  ]);

  return {
    organizationId,
    items: itemRows,
    identifiers: identifierRows,
    suppliers: supplierRows,
    itemSuppliers: itemSupplierRows,
  };
}

function emptySummary(
  skipped: NonNullable<IngestionRunSummary["skipped"]>,
): IngestionRunSummary {
  return {
    ok: false,
    skipped,
    tenants: 0,
    fetched: 0,
    matched: 0,
    persisted: 0,
    failed: 0,
    resolved: 0,
    connectors: [],
  };
}

function chunk<T>(values: T[], size: number): T[][] {
  const batchSize = Math.max(1, size);
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize));
  }
  return batches;
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Risk ingestion was aborted.");
  }
}
