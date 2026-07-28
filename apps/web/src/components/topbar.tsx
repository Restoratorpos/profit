import { Separator } from "@repo/design-system/components/ui/separator";
import { SidebarTrigger } from "@repo/design-system/components/ui/sidebar";
import type { BranchOption } from "@/lib/branches";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import { BranchSwitcher } from "./branch-switcher";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeSwitcher } from "./theme-switcher";

interface TopbarProperties {
  activeBranchId: string;
  branches: readonly BranchOption[];
  locale: Locale;
  messages: Messages;
}

/*
 * UserMenu is deliberately absent until Phase 3.
 *
 * It renders the signed-in worker and the sign-out action, both of which come
 * from next-auth's useSession() in the Next app. There is no session here yet —
 * putting a placeholder in its slot would make the shell look finished when the
 * auth layer has not been built.
 */
export const Topbar = ({
  activeBranchId,
  branches,
  locale,
  messages,
}: TopbarProperties) => (
  <header className="sticky top-0 z-10 flex h-18 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
    <SidebarTrigger />
    <Separator className="mr-1 h-8" orientation="vertical" />
    <BranchSwitcher
      activeBranchId={activeBranchId}
      branches={branches}
      messages={messages}
    />

    <div className="ml-auto flex items-center gap-2">
      <LanguageSwitcher locale={locale} messages={messages} />
      <ThemeSwitcher messages={messages} />
    </div>
  </header>
);
