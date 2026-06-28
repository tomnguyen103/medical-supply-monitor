"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { SeverityBadge } from "@/components/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approveAlertEventAction,
  rejectAlertEventAction,
} from "@/lib/actions/alerts";
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
    id: "evidence",
    header: "Evidence",
    enableSorting: false,
    cell: ({ row }) => (
      <details className="max-w-[20rem] text-xs">
        <summary className="cursor-pointer font-medium text-primary">View</summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-5 text-muted-foreground">
          {JSON.stringify(
            {
              evidence: row.original.evidence,
              freshness: row.original.freshness,
            },
            null,
            2,
          )}
        </pre>
      </details>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    id: "approval",
    header: "Approval",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.requiresApproval && row.original.status === "awaiting_approval" ? (
        <div className="flex flex-wrap gap-2">
          <form action={approveAlertEventAction.bind(null, row.original.id)}>
            <Button type="submit" size="sm">
              Approve
            </Button>
          </form>
          <form action={rejectAlertEventAction.bind(null, row.original.id)}>
            <Button type="submit" variant="outline" size="sm">
              Reject
            </Button>
          </form>
        </div>
      ) : (
        muted
      ),
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
