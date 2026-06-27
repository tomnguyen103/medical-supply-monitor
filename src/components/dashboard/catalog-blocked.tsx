import Link from "next/link";
import { Database, LogIn } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "./primitives";

export function CatalogBlocked({ reason }: { reason: "no-db" | "no-org" }) {
  if (reason === "no-db") {
    return (
      <EmptyState
        icon={Database}
        title="Database not connected"
        body="Set DATABASE_URL in .env.local and run npm run db:migrate to enable the catalog. The page renders without it so you can explore the structure."
      />
    );
  }
  return (
    <EmptyState
      icon={LogIn}
      title="No active organization"
      body="Sign in and select an organization to manage your catalog."
    >
      <Link href="/sign-in" className={buttonVariants({ size: "sm" })}>
        Sign in
      </Link>
    </EmptyState>
  );
}
