import { Bell, Boxes, Factory, LayoutDashboard, Radar } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/items", label: "Items", icon: Boxes },
  { href: "/dashboard/suppliers", label: "Suppliers", icon: Factory },
  { href: "/dashboard/signals", label: "Risk signals", icon: Radar },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
];

/** Active when the path equals the item (Overview) or is nested under it. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
