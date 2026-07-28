import { currentUser } from "@repo/auth/server";
import {
  SidebarInset,
  SidebarProvider,
} from "@repo/design-system/components/ui/sidebar";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BRANCH_COOKIE, PLACEHOLDER_BRANCHES } from "@/lib/branches";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { AppSidebar } from "./components/app-sidebar";
import { Topbar } from "./components/topbar";

interface AppLayoutProperties {
  readonly children: ReactNode;
}

const SIDEBAR_COOKIE = "sidebar_state";

const AppLayout = async ({ children }: AppLayoutProperties) => {
  // Independent, so start them together rather than in sequence.
  const userPromise = currentUser();
  const localePromise = getLocale();
  const cookiePromise = cookies();

  const user = await userPromise;

  if (!user) {
    redirect("/sign-in");
  }

  const [locale, cookieStore] = await Promise.all([
    localePromise,
    cookiePromise,
  ]);

  const messages = getMessages(locale);

  // Both are read on the server so the shell paints in its final state — no
  // flash of an open sidebar collapsing, or of the wrong language.
  const sidebarOpen = cookieStore.get(SIDEBAR_COOKIE)?.value !== "false";
  const activeBranchId =
    cookieStore.get(BRANCH_COOKIE)?.value ?? PLACEHOLDER_BRANCHES[0].id;

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
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AppLayout;
