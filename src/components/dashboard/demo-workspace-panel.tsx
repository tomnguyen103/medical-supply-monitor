"use client";

import { useActionState } from "react";
import { DatabaseZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { seedDemoWorkspaceAction } from "@/lib/actions/demo";

export function DemoWorkspacePanel() {
  const [state, formAction, pending] = useActionState(seedDemoWorkspaceAction, null);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-medium">Demo workspace</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          In a demo or sandbox organization, seed non-PHI items, suppliers,
          signals, scores, and alert rules.
        </p>
      </div>
      <div className="space-y-4 px-5 py-4">
        <form action={formAction}>
          <Button type="submit" disabled={pending} size="sm">
            <DatabaseZap className="size-4" />
            {pending ? "Seeding..." : "Seed demo"}
          </Button>
        </form>
        {state && (
          <p
            className={
              state.ok
                ? "text-sm text-muted-foreground"
                : "text-sm text-amber-700 dark:text-amber-300"
            }
            role="status"
          >
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
