import "server-only";

import { eq } from "drizzle-orm";

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
}

export interface IngestionConnectorSummary {
  connectorId: string;
  fetched: number;
  matched: number;
  persisted: number;
  error?: string;
}

export interface IngestionRunSummary {
  ok: boolean;
  skipped?: "database-unconfigured" | "no-connectors";
  tenants: number;
  fetched: number;
  matched: number;
  persisted: number;
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

  const catalogs = await loadTenantCatalogs();
  const summaries: IngestionConnectorSummary[] = [];

  for (const connector of connectors) {
    try {
      const signals = await connector.fetch({
        since: options.since,
        userAgent: env.connectors.userAgent,
      });
      const result = await persistSignalsForTenants(signals, catalogs);
      summaries.push({
        connectorId: connector.id,
        fetched: signals.length,
        matched: result.matched,
        persisted: result.persisted,
      });
    } catch (error) {
      summaries.push({
        connectorId: connector.id,
        fetched: 0,
        matched: 0,
        persisted: 0,
        error: error instanceof Error ? error.message : "Connector failed.",
      });
    }
  }

  return {
    ok: summaries.every((summary) => !summary.error),
    tenants: catalogs.length,
    fetched: summaries.reduce((sum, row) => sum + row.fetched, 0),
    matched: summaries.reduce((sum, row) => sum + row.matched, 0),
    persisted: summaries.reduce((sum, row) => sum + row.persisted, 0),
    connectors: summaries,
  };
}

function selectConnectors(connectorIds: string[] | undefined) {
  if (!connectorIds?.length) return getActiveConnectors();
  return connectorIds
    .map((id) => getConnector(id))
    .filter((connector): connector is Connector => Boolean(connector?.isConfigured()));
}

async function persistSignalsForTenants(
  signals: NormalizedRiskSignal[],
  catalogs: TenantCatalog[],
): Promise<{ matched: number; persisted: number }> {
  let matched = 0;
  let persisted = 0;

  for (const catalog of catalogs) {
    for (const signal of signals) {
      const match = matchSignalToCatalog(signal, catalog);
      if (!match) continue;
      matched += 1;
      await upsertMatchedSignal(signal, match);
      persisted += 1;
    }
  }

  return { matched, persisted };
}

async function loadTenantCatalogs(): Promise<TenantCatalog[]> {
  const orgRows = await db.select({ id: organizations.id }).from(organizations);
  return Promise.all(orgRows.map((org) => loadTenantCatalog(org.id)));
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
      .where(eq(items.organizationId, organizationId)),
    db
      .select({
        itemId: itemIdentifiers.itemId,
        type: itemIdentifiers.type,
        value: itemIdentifiers.value,
      })
      .from(itemIdentifiers)
      .where(eq(itemIdentifiers.organizationId, organizationId)),
    db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        countryOfOrigin: suppliers.countryOfOrigin,
      })
      .from(suppliers)
      .where(eq(suppliers.organizationId, organizationId)),
    db
      .select({
        itemId: itemSuppliers.itemId,
        supplierId: itemSuppliers.supplierId,
      })
      .from(itemSuppliers)
      .where(eq(itemSuppliers.organizationId, organizationId)),
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
    connectors: [],
  };
}
