"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { formatLabel } from "@/lib/utils";
import type { Facility } from "@/lib/db/schema";
import { DataTable } from "./data-table";

const muted = <span className="text-muted-foreground">-</span>;

const columns: ColumnDef<Facility>[] = [
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
    accessorKey: "city",
    header: "City",
    cell: ({ row }) => row.original.city || muted,
  },
  {
    accessorKey: "region",
    header: "Region",
    cell: ({ row }) => row.original.region || muted,
  },
  {
    accessorKey: "country",
    header: "Country",
    cell: ({ row }) => row.original.country || muted,
  },
];

export function FacilitiesTable({ data }: { data: Facility[] }) {
  return <DataTable columns={columns} data={data} filterPlaceholder="Filter facilities..." />;
}
