import { Separator } from "@repo/design-system/components/ui/separator";
import { SidebarTrigger } from "@repo/design-system/components/ui/sidebar";
import type { BranchOption } from "@/lib/branches";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import { BranchSwitcher } from "./branch-switcher";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeSwitcher } from "./theme-switcher";
import { UserMenu } from "./user-menu";

interface TopbarProperties {
  activeBranchId: string;
  branches: readonly BranchOption[];
  locale: Locale;
  messages: Messages;
}

export const Topbar = ({
  activeBranchId,
  branches,
  locale,
  messages,
}: TopbarProperties) => (
  /*
   * `shrink-0`, not `sticky`. The shell pins the viewport and the content below
   * is the only scroll container, so this header is simply always there — it
   * never has to chase a scrolling document.
   */
  <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-3 sm:h-18 sm:gap-3 sm:px-4">
    <SidebarTrigger />
    {/* Hidden on the narrowest screens: with the rail collapsed to an icon the
        trigger already reads as the edge of the nav, and the rule is one more
        thing competing for a 320px row. */}
    <Separator className="mr-1 hidden h-8 sm:block" orientation="vertical" />

    {/* min-w-0 lets the branch name truncate instead of pushing the controls on
        the right off the screen. */}
    <div className="min-w-0 flex-1">
      <BranchSwitcher
        activeBranchId={activeBranchId}
        branches={branches}
        messages={messages}
      />
    </div>

    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <LanguageSwitcher locale={locale} messages={messages} />
      <ThemeSwitcher messages={messages} />
      <Separator className="mx-1 hidden h-8 sm:block" orientation="vertical" />
      <UserMenu messages={messages} />
    </div>
  </header>
);
