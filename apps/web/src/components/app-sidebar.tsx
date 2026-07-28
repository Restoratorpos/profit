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
import type { Messages } from "@/lib/i18n/dictionary";
import { isNavItemActive, NAV_ITEMS } from "@/lib/navigation";

interface AppSidebarProperties {
  messages: Messages;
}

export const AppSidebar = ({ messages }: AppSidebarProperties) => {
  // react-router's equivalent of next/navigation's usePathname().
  const { pathname } = useLocation();
  const { open } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-18 justify-center">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              className={cn(
                "flex h-12 items-center transition-all",
                open ? "px-3" : "justify-center px-0"
              )}
              to="/"
            >
              {/* Collapsed to the icon rail there is no room for the wordmark,
                  so the mark carries the brand on its own and the name survives
                  for screen readers. */}
              <Logo
                accentClassName="text-primary-accent"
                markClassName="size-8 shrink-0 text-primary"
                markOnly={!open}
                wordmarkClassName="text-xl"
              />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-1.5">
            {NAV_ITEMS.map((item) => {
              const label = messages[item.labelKey];
              const isActive = isNavItemActive(item.href, pathname);

              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      "relative h-13 text-sidebar-foreground/80",
                      "hover:text-sidebar-foreground",
                      // Active rows are a filled neon pill with near-black
                      // text — the same treatment the tab and pager buttons
                      // use, so "selected" looks identical everywhere instead
                      // of the sidebar inventing a green-text variant of it.
                      "data-[active=true]:bg-primary data-[active=true]:font-medium data-[active=true]:text-primary-foreground",
                      "data-[active=true]:hover:bg-primary/90 data-[active=true]:hover:text-primary-foreground",
                      "[&_svg]:data-[active=true]:text-primary-foreground"
                    )}
                    isActive={isActive}
                    tooltip={label}
                  >
                    <Link to={item.href}>
                      <item.icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Drag-to-collapse edge, so the sidebar is resizable without the trigger. */}
      <SidebarRail />
    </Sidebar>
  );
};
