"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[17.5rem] shrink-0 flex-col border-r border-white/10 bg-console-rail text-white md:flex">
      <div className="px-4 pb-5 pt-5">
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]">
          <BrandMark
            href="/dashboard"
            className="text-white [&_span_span:first-child]:text-white/45"
          />
        </div>
      </div>
      <div className="px-4">
        <div className="console-rule opacity-45" aria-hidden />
      </div>
      <nav className="flex-1 space-y-1.5 p-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium outline-none transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:ring-2 focus-visible:ring-white/30 active:translate-y-px",
                active
                  ? "bg-white text-console-rail shadow-[0_18px_45px_-30px_rgb(255_255_255/0.8)]"
                  : "text-white/62 hover:bg-white/[0.065] hover:text-white",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-xl border transition-colors",
                  active
                    ? "border-console-line bg-console-surface-2 text-primary"
                    : "border-white/10 bg-white/[0.035] text-white/62 group-hover:text-white",
                )}
              >
                <item.icon className="size-4" strokeWidth={1.65} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4">
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">
            Operating mode
          </p>
          <p className="mt-2 text-sm font-medium text-white">Evidence first</p>
          <p className="mt-1 text-xs leading-5 text-white/52">
            Tenant-scoped catalog, deterministic scoring, human approval for critical alerts.
          </p>
        </div>
      </div>
    </aside>
  );
}
