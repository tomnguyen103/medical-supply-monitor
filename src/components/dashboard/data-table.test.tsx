import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataTable } from "./data-table";
import type { ColumnDef } from "@tanstack/react-table";

interface TestRow {
  name: string;
  score: number;
}

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "score", header: "Score" },
];

describe("DataTable", () => {
  it("renders sortable headers as accessible buttons", () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        data={[{ name: "Sterile saline", score: 82 }]}
        filterPlaceholder="Filter rows..."
      />,
    );

    expect(html).toContain('aria-label="Filter rows"');
    expect(html).toContain('aria-label="Sort Name ascending"');
    expect(html).toContain('aria-label="Sort Score descending"');
    expect(html).toContain("<button");
  });
});
