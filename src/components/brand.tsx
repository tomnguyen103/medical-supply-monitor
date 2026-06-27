import Link from "next/link";
import { Radar } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({
  href = "/",
  showWordmark = true,
  className,
}: {
  href?: string;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 font-semibold", className)}
    >
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Radar className="size-4" />
      </span>
      {showWordmark && (
        <span className="text-sm tracking-tight">Supply Resilience Monitor</span>
      )}
    </Link>
  );
}
