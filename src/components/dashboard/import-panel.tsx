"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImportOutcome } from "@/lib/actions/import";

export function ImportPanel({
  action,
  entityLabel,
  template,
  templateFilename,
}: {
  action: (prev: ImportOutcome | null, formData: FormData) => Promise<ImportOutcome>;
  entityLabel: string;
  template: string;
  templateFilename: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  function downloadTemplate() {
    const blob = new Blob([template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateFilename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="console-panel rounded-[1.75rem] p-1.5">
      <div className="console-panel-inner overflow-hidden rounded-[1.25rem]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 bg-muted/20 px-5 py-4">
          <div>
            <p className="console-label">Bulk import</p>
            <h2 className="mt-2 font-semibold tracking-tight">Import {entityLabel}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Upload a CSV. Headers are matched flexibly; unknown columns are ignored.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" />
            Template
          </Button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <form action={formAction} className="flex flex-wrap items-center gap-3">
            <Input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="max-w-xs"
              aria-label={`${entityLabel} CSV file`}
            />
            <Button type="submit" disabled={pending}>
              <Upload className="size-4" />
              {pending ? "Importing..." : "Import"}
            </Button>
          </form>

          {state && (
            <div className={cnState(state.ok)} role="status">
              <div className="flex items-center gap-2 text-sm font-medium">
                {state.ok ? (
                  <CheckCircle2 className="size-4 text-primary" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                )}
                {state.message}
              </div>
              {(state.inserted > 0 || state.skipped > 0) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {state.inserted} inserted · {state.skipped} skipped (duplicates) ·{" "}
                  {state.errors.length} row error(s)
                </p>
              )}
              {state.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {state.errors.slice(0, 8).map((e, i) => (
                    <li key={i}>
                      Row {e.row}
                      {e.field ? ` (${e.field})` : ""}: {e.message}
                    </li>
                  ))}
                  {state.errors.length > 8 && <li>and {state.errors.length - 8} more...</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function cnState(ok: boolean): string {
  return [
    "rounded-2xl border p-4",
    ok
      ? "border-border bg-muted/55"
      : "border-amber-300/60 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
  ].join(" ");
}
