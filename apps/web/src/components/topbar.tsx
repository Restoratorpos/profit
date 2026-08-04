import { SidebarTrigger } from "@repo/design-system/components/ui/sidebar";
import type { Messages } from "@/lib/i18n/dictionary";
import { GymBadge } from "./gym-badge";
import { UserMenu } from "./user-menu";

interface TopbarProperties {
  messages: Messages;
}

export const Topbar = ({ messages }: TopbarProperties) => (
  /*
   * `shrink-0`, not `sticky`. The shell pins the viewport and the content below
   * is the only scroll container, so this header is simply always there — it
   * never has to chase a scrolling document.
   */
  <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 sm:h-14 sm:gap-3 sm:px-4">
    {/*
     * Only below `md`, which is exactly where the sidebar stops being a rail and
     * becomes a sheet with no other way to open it. On a desktop the rail is
     * always on screen and can be dragged shut by its own edge, so a button
     * whose whole job is to hide the nav was spending the most prominent
     * position in the header on something nobody presses.
     */}
    <SidebarTrigger className="md:hidden" />

    {/* min-w-0 lets the gym name truncate instead of pushing the controls on
        the right off the screen. */}
    <div className="min-w-0 flex-1">
      <GymBadge messages={messages} />
    </div>

    {/*
     * Language and theme used to sit here, and the rule that fenced them off
     * from the account went with them. They are device preferences set once
     * when a terminal is installed, so they moved to the settings screen rather
     * than keeping two permanent controls in a header the desk reads all day.
     */}
    <UserMenu messages={messages} />
  </header>
);
