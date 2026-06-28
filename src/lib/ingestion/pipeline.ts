import "server-only";

import { asc, eq } from "drizzle-orm";

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
import { upsertMatchedSignal } from "./persistence";

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
        signals,
        tenantIds,
        options.tenantBatchSize ?? INGESTION_TENANT_BATCH_SIZE,
      );
      summaries.push({
        connectorId: connector.id,
        fetched: signals.length,
        matched: result.matched,
        persisted: result.persisted,
        failed: result.failed,
      });
    } catch (error) {
      summaries.push({
        connectorId: connector.id,
        fetched: 0,
        matched: 0,
        persisted: 0,
        failed: 0,
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

async function persistSignalsForTenants(
  signals: NormalizedRiskSignal[],
  tenantIds: string[],
  tenantBatchSize: number,
): Promise<{ matched: number; persisted: number; failed: number }> {
  let matched = 0;
  let persisted = 0;
  let failed = 0;

  for (const tenantBatch of chunk(tenantIds, tenantBatchSize)) {
    const catalogs = await Promise.all(tenantBatch.map((id) => loadTenantCatalog(id)));
    for (const catalog of catalogs) {
      for (const signal of signals) {
        const match = matchSignalToCatalog(signal, catalog);
        if (!match) continue;
        matched += 1;
        try {
          await upsertMatchedSignal(signal, match);
          persisted += 1;
        } catch {
          failed += 1;
        }
      }
    }
  }

  return { matched, persisted, failed };
}

async function loadTenantIds(): Promise<string[]> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.id));

  return rows.map((org) => org.id);
}

async function loadTenantCatalog(organizationId: string): Promise<TenantCatalog> {
  const [itemRows, identifierRows, supplierRows, itemSupplierRows] = await Promise.all([
    db
      .select({
        id: items.id,
        name: items.name,
        internalSku: items.internalSku,
      })
      .from(items)
      .where(eq(items.organizationId, organizationId))
      .orderBy(asc(items.id))
      .limit(INGESTION_CATALOG_LIMIT),
    db
      .select({
        itemId: itemIdentifiers.itemId,
        type: itemIdentifiers.type,
        value: itemIdentifiers.value,
      })
      .from(itemIdentifiers)
      .where(eq(itemIdentifiers.organizationId, organizationId))
      .orderBy(asc(itemIdentifiers.id))
      .limit(INGESTION_CATALOG_LIMIT),
    db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        countryOfOrigin: suppliers.countryOfOrigin,
      })
      .from(suppliers)
      .where(eq(suppliers.organizationId, organizationId))
      .orderBy(asc(suppliers.id))
      .limit(INGESTION_CATALOG_LIMIT),
    db
      .select({
        itemId: itemSuppliers.itemId,
        supplierId: itemSuppliers.supplierId,
      })
      .from(itemSuppliers)
      .where(eq(itemSuppliers.organizationId, organizationId))
      .orderBy(asc(itemSuppliers.id))
      .limit(INGESTION_CATALOG_LIMIT),
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
