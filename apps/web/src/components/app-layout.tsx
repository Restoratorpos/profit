import {
  SidebarInset,
  SidebarProvider,
} from "@repo/design-system/components/ui/sidebar";
import { Outlet } from "@tanstack/react-router";
import { readDeviceCookie } from "@/lib/device-prefs";
import { useLocale } from "@/lib/i18n/provider";
import { AppSidebar } from "./app-sidebar";
import { Topbar } from "./topbar";

/** The design system's SidebarProvider writes this itself; we only read it. */
const SIDEBAR_COOKIE = "sidebar_state";

/*
 * Read once at module load rather than per render. This is a device
 * preference — it cannot change without a reload, and reading document.cookie
 * on every render of the shell is a synchronous string parse for nothing.
 */
const sidebarOpen = readDeviceCookie(SIDEBAR_COOKIE) !== "false";

/**
 * The shell every signed-in route renders inside.
 *
 * The Next version of this was an async server component that called
 * `currentUser()` and redirected to /sign-in when there was no session. That
 * guard is Phase 3 — until per-user tokens exist on the backend there is no
 * session to check, and a guard that always passes is worse than none.
 */
export const AppLayout = () => {
  const { messages } = useLocale();

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar messages={messages} />
      {/*
       * The shell owns the viewport and never scrolls: `h-svh` plus
       * `overflow-hidden` pins it, so the only thing that can move is the
       * content area below. `svh` rather than `vh` because on a phone the
       * browser chrome collapses as you scroll, and `vh` would leave the header
       * hanging over content or a gap under the fold.
       */}
      <SidebarInset className="h-svh overflow-hidden">
        <Topbar messages={messages} />
        {/*
         * The single scroll container. Every page renders inside this, so a long
         * table scrolls under a header that stays put — rather than the whole
         * document moving and the header having to chase it with `sticky`.
         *
         * `min-h-0` is load-bearing: a flex child defaults to `min-height:auto`,
         * which refuses to shrink below its content, and the overflow would
         * silently move to the body instead.
         */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};
