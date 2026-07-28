import {
  SidebarInset,
  SidebarProvider,
} from "@repo/design-system/components/ui/sidebar";
import { Outlet } from "react-router";
import { BRANCH_COOKIE, PLACEHOLDER_BRANCHES } from "@/lib/branches";
import { readDeviceCookie } from "@/lib/device-prefs";
import { useLocale } from "@/lib/i18n/provider";
import { AppSidebar } from "./app-sidebar";
import { Topbar } from "./topbar";

/** The design system's SidebarProvider writes this itself; we only read it. */
const SIDEBAR_COOKIE = "sidebar_state";

/*
 * Read once at module load rather than per render. These are device
 * preferences — they cannot change without a reload, and reading document.cookie
 * on every render of the shell is a synchronous string parse for nothing.
 */
const sidebarOpen = readDeviceCookie(SIDEBAR_COOKIE) !== "false";
const activeBranchId =
  readDeviceCookie(BRANCH_COOKIE) ?? PLACEHOLDER_BRANCHES[0].id;

/**
 * The shell every signed-in route renders inside.
 *
 * The Next version of this was an async server component that called
 * `currentUser()` and redirected to /sign-in when there was no session. That
 * guard is Phase 3 — until per-user tokens exist on the backend there is no
 * session to check, and a guard that always passes is worse than none.
 */
export const AppLayout = () => {
  const { locale, messages } = useLocale();

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar messages={messages} />
      <SidebarInset>
        <Topbar
          activeBranchId={activeBranchId}
          branches={PLACEHOLDER_BRANCHES}
          locale={locale}
          messages={messages}
        />
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};
