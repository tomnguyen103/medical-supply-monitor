import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="console-panel rounded-[1.75rem] p-1.5">
      <div className="console-panel-inner rounded-[1.25rem] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
            <p className="console-label">Command console</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
              {title}
            </h1>
        {description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
        )}
      </div>
      {children}
        </div>
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "console-panel console-card-hover rounded-[1.5rem] p-1.5",
        className,
      )}
    >
      <div className="console-panel-inner rounded-[1.05rem] p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="console-label">{label}</p>
          <span aria-hidden className="mt-1 h-1.5 w-8 rounded-full bg-primary/35" />
        </div>
        <p className="mt-4 font-mono text-3xl font-semibold tracking-[-0.04em] tabular-nums">
          {value}
        </p>
        {hint && <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="console-panel flex flex-col items-center justify-center rounded-[1.75rem] border-dashed px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-border bg-muted text-muted-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.45)]">
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <h2 className="mt-5 font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
