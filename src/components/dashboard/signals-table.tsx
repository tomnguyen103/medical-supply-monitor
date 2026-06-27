"use client";

import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ExternalLink, PanelRightOpen, X } from "lucide-react";

import { SeverityBadge } from "@/components/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatLabel } from "@/lib/utils";
import type { SignalListRow } from "@/lib/signals";
import { DataTable } from "./data-table";

const muted = <span className="text-muted-foreground">-</span>;

export function SignalsTable({ data }: { data: SignalListRow[] }) {
  const [selected, setSelected] = React.useState<SignalListRow | null>(null);
  const columns = React.useMemo<ColumnDef<SignalListRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Signal",
        cell: ({ row }) => (
          <div className="max-w-[32rem]">
            <p className="font-medium">{row.original.title}</p>
            {row.original.summary && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {row.original.summary}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "domain",
        header: "Domain",
        cell: ({ row }) => formatLabel(row.original.domain),
      },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ row }) => <SeverityBadge level={row.original.severity} />,
      },
      {
        accessorKey: "snapshot.riskScore",
        header: "Risk score",
        cell: ({ row }) =>
          row.original.snapshot ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm tabular-nums">
                {Math.round(row.original.snapshot.riskScore)}
              </span>
              <SeverityBadge level={row.original.snapshot.riskLevel} />
            </div>
          ) : (
            muted
          ),
      },
      {
        accessorKey: "stalenessStatus",
        header: "Freshness",
        cell: ({ row }) => (
          <FreshnessBadge
            value={row.original.snapshot?.stalenessStatus ?? row.original.stalenessStatus}
          />
        ),
      },
      {
        accessorKey: "itemName",
        header: "Matched item",
        cell: ({ row }) => row.original.itemName ?? muted,
      },
      {
        accessorKey: "supplierName",
        header: "Supplier",
        cell: ({ row }) => row.original.supplierName ?? muted,
      },
      {
        accessorKey: "confidence",
        header: "Confidence",
        cell: ({ row }) =>
          row.original.confidence == null ? (
            muted
          ) : (
            <span className="font-mono tabular-nums">
              {Math.round(row.original.confidence * 100)}%
            </span>
          ),
      },
      {
        accessorKey: "lastFetchedAt",
        header: "Fetched",
        cell: ({ row }) => formatDate(row.original.lastFetchedAt),
      },
      {
        id: "evidence",
        header: "Evidence",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelected(row.original)}
          >
            <PanelRightOpen className="size-3.5" strokeWidth={1.75} />
            Review
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <DataTable columns={columns} data={data} filterPlaceholder="Filter signals..." />
      {selected && (
        <EvidenceDrawer row={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function EvidenceDrawer({
  row,
  onClose,
}: {
  row: SignalListRow;
  onClose: () => void;
}) {
  const snapshot = row.snapshot;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        aria-label="Close evidence drawer"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Evidence review
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{row.title}</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" strokeWidth={1.75} />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge level={row.severity} />
              <FreshnessBadge value={row.stalenessStatus} />
              <Badge variant="secondary">{formatLabel(row.domain)}</Badge>
            </div>
            {row.summary && (
              <p className="text-sm leading-6 text-muted-foreground">{row.summary}</p>
            )}
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Matched item" value={row.itemName} />
              <Detail label="Supplier" value={row.supplierName} />
              <Detail label="Observed" value={formatDateTime(row.observedAt)} />
              <Detail label="Fetched" value={formatDateTime(row.lastFetchedAt)} />
              <Detail
                label="Source published"
                value={formatDateTime(row.sourcePublishedAt)}
              />
              <Detail
                label="Signal confidence"
                value={formatPercent(row.confidence)}
              />
            </dl>
          </section>

          <section className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-medium">Score snapshot</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Deterministic score, version, freshness, and change metadata.
              </p>
            </div>
            {snapshot ? (
              <div className="space-y-4 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-3xl font-semibold tabular-nums">
                    {Math.round(snapshot.riskScore)}
                  </span>
                  <SeverityBadge level={snapshot.riskLevel} />
                  <FreshnessBadge value={snapshot.stalenessStatus} />
                </div>
                <p className="text-sm text-muted-foreground">{snapshot.rationale}</p>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Detail label="Version" value={snapshot.scoringVersion} />
                  <Detail label="Computed" value={formatDateTime(snapshot.computedAt)} />
                  <Detail
                    label="Snapshot confidence"
                    value={formatPercent(snapshot.confidence)}
                  />
                  <Detail
                    label="Previous snapshot"
                    value={snapshot.previousSnapshotId ? "Linked" : "None"}
                  />
                </dl>
                <ChangeSummary summary={snapshot.changeSummary} />
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Component breakdown</h4>
                  <div className="divide-y divide-border rounded-md border border-border">
                    {snapshot.components.map((component) => (
                      <div
                        key={component.factor}
                        className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_auto]"
                      >
                        <div>
                          <p className="font-medium">{formatLabel(component.factor)}</p>
                          <p className="text-xs text-muted-foreground">
                            {component.explanation}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums">
                          +{component.contribution.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                No score snapshot has been computed for this matched item yet.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-medium">Evidence artifacts</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Source evidence and computed score evidence stored for audit.
              </p>
            </div>
            <div className="divide-y divide-border">
              {row.evidence.length > 0 ? (
                row.evidence.map((evidence) => (
                  <div key={evidence.id} className="space-y-2 px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {evidence.title ?? formatLabel(evidence.type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {evidence.sourceName ?? "Unknown source"} -{" "}
                          {formatDateTime(evidence.capturedAt)}
                        </p>
                      </div>
                      {evidence.url && (
                        <a
                          href={evidence.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Open
                          <ExternalLink className="size-3.5" strokeWidth={1.75} />
                        </a>
                      )}
                    </div>
                    {evidence.contentHash && (
                      <p className="font-mono text-xs text-muted-foreground">
                        {evidence.contentHash.slice(0, 16)}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  No stored evidence artifact yet. Source links still appear when
                  a connector provides them.
                </p>
              )}
            </div>
          </section>

          {row.evidenceUrl && (
            <a
              href={row.evidenceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Open source evidence
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}

function FreshnessBadge({
  value,
}: {
  value: SignalListRow["stalenessStatus"];
}) {
  const variant = value === "fresh" ? "default" : "secondary";
  return <Badge variant={variant}>{formatLabel(value)}</Badge>;
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value ?? muted}</dd>
    </div>
  );
}

function ChangeSummary({
  summary,
}: {
  summary: Record<string, unknown> | null;
}) {
  if (!summary) return null;
  const changed = summary.changed === true;
  const direction = typeof summary.direction === "string" ? summary.direction : null;
  const delta =
    typeof summary.deltaScore === "number" ? summary.deltaScore.toFixed(1) : null;

  return (
    <div className="rounded-md bg-muted px-3 py-2 text-sm">
      <p className="font-medium">
        {changed ? "Changed since previous snapshot" : "No previous score change"}
      </p>
      {delta && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Score {direction ?? "changed"} by {delta} points.
        </p>
      )}
    </div>
  );
}

function formatDate(date: Date | string | null): React.ReactNode {
  const parsed = coerceDate(date);
  if (!parsed) return muted;
  return (
    <span className="font-mono text-xs tabular-nums">
      {new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(parsed)}
    </span>
  );
}

function formatDateTime(date: Date | string | null): React.ReactNode {
  const parsed = coerceDate(date);
  if (!parsed) return muted;
  return (
    <span className="font-mono text-xs tabular-nums">
      {new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(parsed)}
    </span>
  );
}

function formatPercent(value: number | null): React.ReactNode {
  if (value == null) return muted;
  return <span className="font-mono tabular-nums">{Math.round(value * 100)}%</span>;
}

function coerceDate(date: Date | string | null): Date | null {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
