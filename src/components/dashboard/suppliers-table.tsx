"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { formatLabel } from "@/lib/utils";
import type { Supplier } from "@/lib/db/schema";
import { DataTable } from "./data-table";

const muted = <span className="text-muted-foreground">-</span>;

const columns: ColumnDef<Supplier>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => <Badge variant="secondary">{formatLabel(row.original.type)}</Badge>,
  },
  {
    accessorKey: "countryOfOrigin",
    header: "Country",
    cell: ({ row }) => row.original.countryOfOrigin || muted,
  },
  {
    accessorKey: "duns",
    header: "DUNS",
    cell: ({ row }) =>
      row.original.duns ? (
        <span className="font-mono text-xs">{row.original.duns}</span>
      ) : (
        muted
      ),
  },
  {
    accessorKey: "externalId",
    header: "External ID",
    cell: ({ row }) => row.original.externalId || muted,
  },
];

export function SuppliersTable({ data }: { data: Supplier[] }) {
  return <DataTable columns={columns} data={data} filterPlaceholder="Filter suppliers..." />;
}
