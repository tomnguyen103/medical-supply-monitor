import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthNotConfigured({ mode }: { mode: "sign-in" | "sign-up" }) {
  const label = mode === "sign-in" ? "Sign-in" : "Sign-up";
  return (
    <Card className="w-full max-w-lg rounded-[1.75rem]">
      <CardHeader>
        <p className="console-label">Access control</p>
        <CardTitle className="mt-2 text-xl">Authentication is not configured</CardTitle>
        <CardDescription>
          {label} is disabled because Clerk keys are not set in this environment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Add your Clerk keys to <code className="font-mono">.env.local</code>,
          then restart the dev server:
        </p>
        <pre className="overflow-x-auto rounded-2xl border border-border bg-muted/70 p-4 font-mono text-xs text-foreground">
          {`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...`}
        </pre>
        <p>You can still preview the dashboard shell without signing in.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
            Preview dashboard
          </Link>
          <Link
            href="/"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to home
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
