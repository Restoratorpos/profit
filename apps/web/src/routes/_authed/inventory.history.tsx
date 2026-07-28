import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage, movementsQuery } from "@/features/inventory";

export const Route = createFileRoute("/_authed/inventory/history")({
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(movementsQuery);
  },
  component: HistoryPage,
});
