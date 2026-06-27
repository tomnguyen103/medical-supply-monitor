"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";

import { SeverityBadge } from "@/components/severity-badge";
import { Badge } from "@/components/ui/badge";
import { formatLabel } from "@/lib/utils";
import type { SignalListRow } from "@/lib/signals";
import { DataTable } from "./data-table";

const muted = <span className="text-muted-foreground">-</span>;

const columns: ColumnDef<SignalListRow>[] = [
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
    accessorKey: "stalenessStatus",
    header: "Freshness",
    cell: ({ row }) => <FreshnessBadge value={row.original.stalenessStatus} />,
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
    cell: ({ row }) =>
      row.original.evidenceUrl ? (
        <a
          href={row.original.evidenceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open
          <ExternalLink className="size-3.5" strokeWidth={1.75} />
        </a>
      ) : (
        muted
      ),
  },
];

export function SignalsTable({ data }: { data: SignalListRow[] }) {
  return <DataTable columns={columns} data={data} filterPlaceholder="Filter signals..." />;
}

function FreshnessBadge({
  value,
}: {
  value: SignalListRow["stalenessStatus"];
}) {
  const variant = value === "fresh" ? "default" : "secondary";
  return <Badge variant={variant}>{formatLabel(value)}</Badge>;
}

function formatDate(date: Date | null): React.ReactNode {
  if (!date) return muted;
  return (
    <span className="font-mono text-xs tabular-nums">
      {new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date)}
    </span>
  );
}
