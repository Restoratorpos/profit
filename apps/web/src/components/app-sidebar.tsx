import { Logo } from "@repo/design-system/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@repo/design-system/components/ui/sidebar";
import { cn } from "@repo/design-system/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import { isNavItemActive, NAV_ITEMS, type NavItem } from "@/lib/navigation";

interface AppSidebarProperties {
  messages: Messages;
}

/** One destination. Identical whichever side of the fold it is on. */
const NavRow = ({
  item,
  messages,
  pathname,
}: {
  item: NavItem;
  messages: Messages;
  pathname: string;
}) => {
  const label = messages[item.labelKey];

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className={cn(
          "relative h-13 text-sidebar-foreground/80",
          "hover:text-sidebar-foreground",
          // Active rows are a filled neon pill with near-black text — the same
          // treatment the tab and pager buttons use, so "selected" looks
          // identical everywhere instead of the sidebar inventing a green-text
          // variant of it.
          "data-[active=true]:bg-primary data-[active=true]:font-medium data-[active=true]:text-primary-foreground",
          "data-[active=true]:hover:bg-primary/90 data-[active=true]:hover:text-primary-foreground",
          "[&_svg]:data-[active=true]:text-primary-foreground"
        )}
        isActive={isNavItemActive(item.href, pathname)}
        tooltip={label}
      >
        <Link to={item.href}>
          <item.icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

const daily = NAV_ITEMS.filter((item) => item.group === "daily");
const advanced = NAV_ITEMS.filter((item) => item.group === "advanced");

export const AppSidebar = ({ messages }: AppSidebarProperties) => {
  // react-router's equivalent of next/navigation's usePathname().
  const { pathname } = useLocation();
  const { open } = useSidebar();

  /*
   * Folded away by default, and forced open when the page you are on lives
   * inside it — arriving at /products from a link would otherwise leave the whole
   * sidebar unlit, with no row to say where you are.
   */
  const isOnAdvanced = advanced.some((item) =>
    isNavItemActive(item.href, pathname)
  );
  const [isOpened, setOpened] = useState(false);
  const showAdvanced = isOpened || isOnAdvanced;

  const setShowAdvanced = (next: (current: boolean) => boolean) => {
    setOpened(next(showAdvanced));
  };

  return (
    <Sidebar collapsible="icon">
      {/* Same height as the topbar's `sm:h-14`, so the brand and the gym name
          sit on one line rather than a step. */}
      <SidebarHeader className="h-14 justify-center">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              className={cn(
                "flex h-9 items-center transition-all",
                open ? "px-3" : "justify-center px-0"
              )}
              to="/"
            >
              {/* Collapsed to the icon rail there is no room for the wordmark,
                  so the mark carries the brand on its own and the name survives
                  for screen readers. */}
              <Logo
                accentClassName="text-primary-accent"
                markClassName="size-7 shrink-0 text-primary"
                markOnly={!open}
                wordmarkClassName="text-lg"
              />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-1.5">
            {daily.map((item) => (
              <NavRow
                item={item}
                key={item.href}
                messages={messages}
                pathname={pathname}
              />
            ))}

            {/*
             * The fold. Products, inventory and plans are set up once and then
             * left alone, so they cost nothing here until asked for — and they
             * appear *below* this row rather than above it, so pressing it never
             * moves the daily destinations under the operator's finger.
             */}
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-expanded={showAdvanced}
                className={cn(
                  "h-13 text-sidebar-foreground/60",
                  "hover:text-sidebar-foreground"
                )}
                onClick={() => setShowAdvanced((current) => !current)}
                tooltip={messages["nav.more"]}
              >
                <MoreHorizontalIcon />
                <span>{messages["nav.more"]}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {showAdvanced
              ? advanced.map((item) => (
                  <NavRow
                    item={item}
                    key={item.href}
                    messages={messages}
                    pathname={pathname}
                  />
                ))
              : null}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Drag-to-collapse edge, so the sidebar is resizable without the trigger. */}
      <SidebarRail />
    </Sidebar>
  );
};
