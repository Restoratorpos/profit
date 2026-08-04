import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MembersPage, membersPageQuery } from "@/features/members";
import {
  DEBT_FILTERS,
  MEMBER_FILTERS,
  memberQueryFrom,
} from "@/features/members/types";
import { plansQuery } from "@/features/plans";
import { searchText } from "@/lib/search-text";

/**
 * The roster opens on whatever the URL asks for, so another screen can point at
 * a slice of it — the dashboard's "muddati tugayotgan" card links here with
 * `filter=expiring`, and one of its rows with that member's own phone in `q`.
 *
 * Every field is optional and every field has a `.catch`, so `/members` on its
 * own still means the plain roster and a hand-edited `filter=nonsense` opens it
 * too rather than erroring. Both matter: optional keeps a bare `<Link
 * to="/members">` from having to name filters it does not care about, and the
 * catch is the right trade for a link somebody may have bookmarked or pasted —
 * this is a starting point, not a command.
 *
 * **The URL seeds the screen; it does not own it.** Typing in the search box
 * afterwards does not rewrite the address bar — the filters stay component
 * state, debounced, because a keystroke in the URL is a history entry per
 * character. So the link is reproducible when opened and stale as soon as it is
 * used, which is what a starting point should be.
 */
const searchSchema = z.object({
  debt: z.enum(DEBT_FILTERS).optional().catch(undefined),
  filter: z.enum(MEMBER_FILTERS).optional().catch(undefined),
  q: searchText,
});

export const Route = createFileRoute("/_authed/members")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, deps }) => {
    // The page the URL asks for, not the default one. Warming the default and
    // then landing on a filtered view is two round trips for one screen.
    queryClient.ensureQueryData(membersPageQuery(memberQueryFrom(deps)));
    queryClient.ensureQueryData(plansQuery);
  },
  component: MembersPage,
});
