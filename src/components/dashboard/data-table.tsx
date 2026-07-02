"use client";

import * as React from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filterPlaceholder?: string;
}

/** Generic sortable + filterable table. Data is fetched server-side and passed in. */
export function DataTable<TData, TValue>({
  columns,
  data,
  filterPlaceholder = "Filter...",
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

  // TanStack Table's useReactTable returns functions the React Compiler can't
  // memoize; it auto-skips compiling this component, which is safe here because
  // the table instance is not passed to other memoized components.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="console-panel rounded-[1.75rem] p-1.5">
      <div className="console-panel-inner overflow-hidden rounded-[1.25rem]">
        <div className="flex flex-col gap-3 border-b border-border/80 bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.75}
              aria-hidden
            />
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={filterPlaceholder}
              className="pl-9"
              aria-label={filterPlaceholder.replace(/\.\.\.$/, "")}
            />
          </label>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {table.getFilteredRowModel().rows.length} of {data.length} shown
          </p>
        </div>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const headerLabel =
                    typeof header.column.columnDef.header === "string"
                      ? header.column.columnDef.header
                      : header.id;
                  const nextSortingOrder = header.column.getNextSortingOrder();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={getAriaSort(sorted)}
                      className={canSort ? "select-none" : undefined}
                    >
                      {header.isPlaceholder ? null : (
                        <HeaderContent
                          canSort={canSort}
                          headerLabel={headerLabel}
                          sorted={sorted}
                          nextSortingOrder={nextSortingOrder}
                          onToggle={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </HeaderContent>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  No matching records.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function HeaderContent({
  canSort,
  headerLabel,
  sorted,
  nextSortingOrder,
  onToggle,
  children,
}: {
  canSort: boolean;
  headerLabel: string;
  sorted: false | "asc" | "desc";
  nextSortingOrder: false | "asc" | "desc";
  onToggle: ((event: unknown) => void) | undefined;
  children: React.ReactNode;
}) {
  const content = (
    <span className="inline-flex items-center gap-1">
      {children}
      {canSort && <SortIcon sorted={sorted} />}
    </span>
  );

  if (!canSort) return content;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="-mx-2 inline-flex rounded-md px-2 py-1 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={sortButtonLabel(headerLabel, nextSortingOrder)}
    >
      {content}
    </button>
  );
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ChevronUp className="size-3.5" aria-hidden />;
  if (sorted === "desc") return <ChevronDown className="size-3.5" aria-hidden />;
  return <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />;
}

function getAriaSort(sorted: false | "asc" | "desc") {
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return undefined;
}

function sortButtonLabel(
  headerLabel: string,
  nextSortingOrder: false | "asc" | "desc",
) {
  if (nextSortingOrder === "asc") return `Sort ${headerLabel} ascending`;
  if (nextSortingOrder === "desc") return `Sort ${headerLabel} descending`;
  return `Clear ${headerLabel} sorting`;
}
