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
      className={cn("group inline-flex items-center gap-2.5 font-semibold", className)}
    >
      <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_12px_24px_-18px_rgb(14_79_77/0.8)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-px">
        <Radar className="size-4" strokeWidth={1.75} />
      </span>
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Critical Supply
          </span>
          <span className="mt-1 text-sm tracking-tight">
            Resilience Monitor
          </span>
        </span>
      )}
    </Link>
  );
}
