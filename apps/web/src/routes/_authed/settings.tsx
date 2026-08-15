import { createFileRoute } from "@tanstack/react-router";
import { gymSettingsQuery, SettingsPage } from "@/features/settings";

export const Route = createFileRoute("/_authed/settings")({
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(gymSettingsQuery);
  },
  component: SettingsPage,
});
