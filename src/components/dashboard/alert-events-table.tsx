"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { SeverityBadge } from "@/components/severity-badge";
import { Badge } from "@/components/ui/badge";
import type { AlertEventListRow } from "@/lib/alerts/queries";
import { formatLabel } from "@/lib/utils";
import { DataTable } from "./data-table";

const muted = <span className="text-muted-foreground">-</span>;

const columns: ColumnDef<AlertEventListRow>[] = [
  {
    accessorKey: "title",
    header: "Event",
    cell: ({ row }) => (
      <div className="max-w-[34rem]">
        <p className="font-medium">{row.original.title}</p>
        {row.original.body && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {row.original.body}
          </p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "severity",
    header: "Severity",
    cell: ({ row }) => <SeverityBadge level={row.original.severity} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge variant="secondary">{formatLabel(row.original.status)}</Badge>,
  },
  {
    accessorKey: "channel",
    header: "Channel",
    cell: ({ row }) => formatLabel(row.original.channel),
  },
  {
    accessorKey: "itemName",
    header: "Item",
    cell: ({ row }) => row.original.itemName ?? muted,
  },
  {
    accessorKey: "riskScore",
    header: "Score",
    cell: ({ row }) =>
      row.original.riskScore == null ? (
        muted
      ) : (
        <span className="font-mono tabular-nums">
          {Math.round(row.original.riskScore)}
        </span>
      ),
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
    id: "freshness",
    header: "Freshness",
    cell: ({ row }) => formatFreshness(row.original.freshness),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
];

export function AlertEventsTable({ data }: { data: AlertEventListRow[] }) {
  return <DataTable columns={columns} data={data} filterPlaceholder="Filter events..." />;
}

function formatFreshness(freshness: Record<string, unknown>) {
  const status =
    typeof freshness.stalenessStatus === "string" ? freshness.stalenessStatus : null;
  return status ? <Badge variant="secondary">{formatLabel(status)}</Badge> : muted;
}

function formatDate(date: Date | string | null) {
  if (!date) return muted;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return muted;
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
