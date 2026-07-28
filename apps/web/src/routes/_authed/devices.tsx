import { createFileRoute } from "@tanstack/react-router";
import {
  DevicesPage,
  devicesQuery,
  insideCountQuery,
  recentEventsQuery,
} from "@/features/devices";

export const Route = createFileRoute("/_authed/devices")({
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(devicesQuery);
    queryClient.ensureQueryData(recentEventsQuery);
    queryClient.ensureQueryData(insideCountQuery);
  },
  component: DevicesPage,
});
