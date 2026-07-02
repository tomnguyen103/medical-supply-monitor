"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";

export function Topbar({ clerkConfigured }: { clerkConfigured: boolean }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/82 backdrop-blur-xl">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6">
        {/* Mobile nav: horizontal scroll (sidebar is hidden under md) */}
        <nav className="flex items-center gap-2 overflow-x-auto md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium whitespace-nowrap",
                  active
                    ? "border-primary/20 bg-primary text-primary-foreground"
                    : "border-border bg-background/70 text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-4" strokeWidth={1.75} />
                <span className="sr-only sm:not-sr-only">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck className="size-3.5" strokeWidth={1.75} />
            No PHI
          </Badge>
          <Badge variant="outline">Tenant scoped</Badge>
        </div>

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
            <Badge variant="secondary" className="font-medium">
              Demo: Clerk not configured
            </Badge>
          )}
        </div>
      </div>
    </header>
  );
}
