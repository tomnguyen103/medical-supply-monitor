"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";

export function Topbar({ clerkConfigured }: { clerkConfigured: boolean }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        {/* Mobile nav: horizontal scroll (sidebar is hidden under md) */}
        <nav className="flex items-center gap-1 overflow-x-auto md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-4" strokeWidth={1.75} />
                <span className="sr-only sm:not-sr-only">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden md:block" />

        <div className="flex items-center gap-3">
          {clerkConfigured ? (
            <>
              <OrganizationSwitcher
                hidePersonal
                afterSelectOrganizationUrl="/dashboard"
                afterCreateOrganizationUrl="/dashboard"
              />
              <UserButton />
            </>
          ) : (
            <Badge variant="secondary" className="font-normal">
              Demo: Clerk not configured
            </Badge>
          )}
        </div>
      </div>
    </header>
  );
}
