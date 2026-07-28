import {
  ArrowLeftRightIcon,
  CalendarCheckIcon,
  LayersIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  PackageIcon,
  ScanFaceIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  TagIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";
import type { MessageKey } from "./i18n/dictionary";

/**
 * `daily` is what the front desk touches every shift; `advanced` is setup and
 * management. Nothing filters on this yet — every item renders — but the split
 * lives here so the planned "show advanced" toggle is a change to one filter,
 * not a restructure of the nav.
 */
export type NavGroup = "daily" | "advanced";

export interface NavItem {
  group: NavGroup;
  href: string;
  icon: LucideIcon;
  labelKey: MessageKey;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/",
    labelKey: "nav.dashboard",
    icon: LayoutDashboardIcon,
    group: "daily",
  },
  {
    href: "/orders/new",
    labelKey: "nav.newOrder",
    icon: ShoppingBagIcon,
    group: "daily",
  },
  {
    href: "/orders",
    labelKey: "nav.orders",
    icon: ShoppingCartIcon,
    group: "daily",
  },
  {
    href: "/products",
    labelKey: "nav.products",
    icon: TagIcon,
    group: "advanced",
  },
  {
    href: "/inventory",
    labelKey: "nav.inventory",
    icon: PackageIcon,
    group: "advanced",
  },
  {
    href: "/workers",
    labelKey: "nav.staff",
    icon: UserCogIcon,
    group: "advanced",
  },
  {
    href: "/devices",
    labelKey: "nav.devices",
    icon: ScanFaceIcon,
    group: "advanced",
  },
  {
    href: "/members",
    labelKey: "nav.members",
    icon: UsersIcon,
    group: "daily",
  },
  {
    href: "/plans",
    labelKey: "nav.plans",
    icon: LayersIcon,
    group: "advanced",
  },
  {
    href: "/attendance",
    labelKey: "nav.attendance",
    icon: CalendarCheckIcon,
    group: "daily",
  },
  {
    href: "/transactions",
    labelKey: "nav.transactions",
    icon: ArrowLeftRightIcon,
    group: "daily",
  },
] as const;

/** Whether this route is the item's own, or somewhere below it. */
const covers = (href: string, pathname: string): boolean => {
  // `/` only ever matches itself, or it would light up on every route.
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
};

/**
 * Longest match wins, so `/members/abc` highlights `/members` — and `/orders/new`
 * highlights the new-order row rather than lighting up both it and `/orders`.
 *
 * The comparison is across the whole nav rather than per item, because "is this
 * one active" cannot be answered by looking at one item: two of them can cover
 * the same route, and only the more specific one is where the operator is.
 */
export const isNavItemActive = (href: string, pathname: string): boolean => {
  if (!covers(href, pathname)) {
    return false;
  }

  return !NAV_ITEMS.some(
    (item) => item.href.length > href.length && covers(item.href, pathname)
  );
};
