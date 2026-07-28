import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { FileQuestionIcon } from "lucide-react";
import { createBrowserRouter, Link, RouterProvider } from "react-router";
import { AppLayout } from "@/components/app-layout";
import { NAV_ITEMS } from "@/lib/navigation";
import { Placeholder } from "@/routes/placeholder";

const NotFound = () => (
  <div className="flex flex-1 items-center justify-center p-8">
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestionIcon />
        </EmptyMedia>
        <EmptyTitle>404</EmptyTitle>
        <EmptyDescription>This page does not exist.</EmptyDescription>
      </EmptyHeader>
      <Button asChild variant="outline">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </Empty>
  </div>
);

/*
 * Every nav destination resolves to a Placeholder for now, generated from the
 * same NAV_ITEMS the sidebar renders — so the two cannot drift while the shell
 * is the only thing built. Phase 4 replaces these entries one at a time with
 * real routes; the dashboard and the 404 are spelled out because neither is a
 * nav item.
 */
const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Placeholder titleKey="nav.dashboard" /> },
      ...NAV_ITEMS.filter((item) => item.href !== "/").map((item) => ({
        path: item.href,
        element: <Placeholder titleKey={item.labelKey} />,
      })),
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export const App = () => <RouterProvider router={router} />;
