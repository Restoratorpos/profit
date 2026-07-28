import { createFileRoute } from "@tanstack/react-router";
import { AttendancePage, doorQuery } from "@/features/attendance";
import { membersPageQuery } from "@/features/members";
import { DEFAULT_MEMBER_QUERY } from "@/features/members/types";

export const Route = createFileRoute("/_authed/attendance")({
  loader: ({ context: { queryClient } }) => {
    /*
     * The door is warmed here so the queue is already on screen when the page
     * mounts — somebody may be standing at the terminal right now. The sessions
     * table is not: its key includes filters that are component state.
     */
    queryClient.ensureQueryData(doorQuery);
    queryClient.ensureQueryData(membersPageQuery(DEFAULT_MEMBER_QUERY));
  },
  component: AttendancePage,
});
