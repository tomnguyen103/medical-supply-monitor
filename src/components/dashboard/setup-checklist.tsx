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
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-medium">Environment setup</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Each integration activates when its keys are present in{" "}
          <code className="font-mono">.env.local</code>.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {CHECKS.map((check) => {
          const ok = integrations[check.key];
          return (
            <li key={check.key} className="flex items-center gap-3 px-5 py-3">
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full",
                  ok
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {ok ? (
                  <Check className="size-3.5" strokeWidth={2.5} />
                ) : (
                  <Minus className="size-3.5" strokeWidth={2.5} />
                )}
              </span>
              <span className="flex-1 text-sm">{check.label}</span>
              <span className="text-xs text-muted-foreground">
                {ok ? "Configured" : check.required ? "Required" : "Optional"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
