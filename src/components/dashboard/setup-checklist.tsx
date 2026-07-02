import { Check, Minus } from "lucide-react";

import { integrations } from "@/lib/env";
import { cn } from "@/lib/utils";

const CHECKS: Array<{ key: keyof typeof integrations; label: string; required: boolean }> = [
  { key: "clerk", label: "Clerk auth + organizations", required: true },
  { key: "database", label: "Neon Postgres (Drizzle)", required: true },
  { key: "sentry", label: "Sentry error monitoring", required: false },
  { key: "redis", label: "Upstash Redis (cache / rate limits)", required: false },
  { key: "inngest", label: "Inngest background jobs", required: false },
  { key: "langsmith", label: "LangSmith AI tracing", required: false },
  { key: "ai", label: "AI provider (OpenAI / Gemini / local)", required: false },
];

export function SetupChecklist() {
  return (
    <div className="console-panel rounded-[1.75rem] p-1.5">
      <div className="console-panel-inner overflow-hidden rounded-[1.25rem]">
        <div className="border-b border-border/80 bg-muted/20 px-5 py-4">
          <p className="console-label">Readiness</p>
          <h2 className="mt-2 font-semibold tracking-tight">Environment setup</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Each integration activates when its keys are present in{" "}
          <code className="font-mono">.env.local</code>.
        </p>
      </div>
        <ul className="divide-y divide-border/80">
        {CHECKS.map((check) => {
          const ok = integrations[check.key];
          return (
              <li key={check.key} className="flex items-center gap-3 px-5 py-3.5">
              <span
                className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border",
                  ok
                      ? "border-primary/25 bg-primary/12 text-primary"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {ok ? (
                  <Check className="size-3.5" strokeWidth={2.5} />
                ) : (
                  <Minus className="size-3.5" strokeWidth={2.5} />
                )}
              </span>
                <span className="flex-1 text-sm font-medium">{check.label}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                {ok ? "Configured" : check.required ? "Required" : "Optional"}
              </span>
            </li>
          );
        })}
      </ul>
      </div>
    </div>
  );
}
