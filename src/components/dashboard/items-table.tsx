"use client";

import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye, EyeOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatLabel } from "@/lib/utils";
import { setItemWatched } from "@/lib/actions/items";
import type { Item } from "@/lib/db/schema";
import { DataTable } from "./data-table";

function WatchToggle({ id, watched }: { id: string; watched: boolean }) {
  const [isPending, startTransition] = React.useTransition();
  const [on, setOn] = React.useState(watched);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      aria-pressed={on}
      title={on ? "Watching" : "Not watching"}
      onClick={() => {
        const next = !on;
        setOn(next); // optimistic
        startTransition(async () => {
          const result = await setItemWatched(id, next);
          if (!result.ok) setOn(!next); // revert on failure
        });
      }}
    >
      {on ? (
        <Eye className="size-4 text-primary" />
      ) : (
        <EyeOff className="size-4 text-muted-foreground" />
      )}
      <span className="sr-only">{on ? "Watching" : "Not watching"}</span>
    </Button>
  );
}

const muted = <span className="text-muted-foreground">-</span>;

const columns: ColumnDef<Item>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => formatLabel(row.original.category),
  },
  {
    accessorKey: "criticality",
    header: "Criticality",
    cell: ({ row }) => (
      <Badge variant="secondary">{formatLabel(row.original.criticality)}</Badge>
    ),
  },
  {
    accessorKey: "internalSku",
    header: "SKU",
    cell: ({ row }) => row.original.internalSku || muted,
  },
  {
    accessorKey: "parLevel",
    header: "Par",
    cell: ({ row }) =>
      row.original.parLevel == null ? (
        muted
      ) : (
        <span className="font-mono tabular-nums">{row.original.parLevel}</span>
      ),
  },
  {
    id: "watch",
    header: "Watch",
    enableSorting: false,
    cell: ({ row }) => <WatchToggle id={row.original.id} watched={row.original.isWatched} />,
  },
];

export function ItemsTable({ data }: { data: Item[] }) {
  return <DataTable columns={columns} data={data} filterPlaceholder="Filter items..." />;
}
