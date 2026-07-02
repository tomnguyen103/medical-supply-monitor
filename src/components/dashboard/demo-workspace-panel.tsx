"use client";

import { useActionState } from "react";
import { DatabaseZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { seedDemoWorkspaceAction } from "@/lib/actions/demo";

export function DemoWorkspacePanel() {
  const [state, formAction, pending] = useActionState(seedDemoWorkspaceAction, null);

  return (
    <div className="console-panel rounded-[1.75rem] p-1.5">
      <div className="console-panel-inner overflow-hidden rounded-[1.25rem]">
        <div className="border-b border-border/80 bg-muted/20 px-5 py-4">
          <p className="console-label">Sandbox</p>
          <h2 className="mt-2 font-semibold tracking-tight">Demo workspace</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
          In a demo or sandbox organization, seed non-PHI items, suppliers,
          signals, scores, and alert rules.
        </p>
      </div>
        <div className="space-y-4 px-5 py-5">
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
    </div>
  );
}
