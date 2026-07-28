import { createFileRoute } from "@tanstack/react-router";
import { MembersPage, membersPageQuery } from "@/features/members";
import { DEFAULT_MEMBER_QUERY } from "@/features/members/types";
import { plansQuery } from "@/features/plans";

export const Route = createFileRoute("/_authed/members")({
  loader: ({ context: { queryClient } }) => {
    // The first page only. Every filter after that is a different key, fetched
    // on demand with the previous page held on screen.
    queryClient.ensureQueryData(membersPageQuery(DEFAULT_MEMBER_QUERY));
    queryClient.ensureQueryData(plansQuery);
  },
  component: MembersPage,
});
