import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { plansQuery } from "@/features/plans";
import { useLocale } from "@/lib/i18n/provider";
import { useMembersPage } from "../api";
import { memberQueryFrom, type PlanOption } from "../types";
import { MembersView } from "./members-view";

const route = getRouteApi("/_authed/members");

/**
 * What `app/(authenticated)/members/page.tsx` was.
 *
 * The plan list is read through the plans feature's own query rather than a
 * second definition here — one source for "what plans exist" means the picker
 * in this sheet cannot disagree with the plans screen.
 *
 * The URL decides which slice of the roster opens; see the route for why it
 * only seeds the view rather than owning its filters.
 */
export const MembersPage = () => {
  const { locale, messages } = useLocale();
  const seed = memberQueryFrom(route.useSearch());
  const first = useMembersPage(seed);
  const plans = useQuery(plansQuery);

  /*
   * Only three fields of a plan reach the sheet. The Next version trimmed this
   * to keep the rest of the row from being serialized into the page; here it is
   * simply the shape the picker wants.
   */
  const planOptions: PlanOption[] = (plans.data ?? [])
    .filter((plan) => plan.isActive)
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      price: plan.price ?? "0",
    }));

  if (first.error) {
    return (
      <p
        className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
        role="alert"
      >
        {first.error.message}
      </p>
    );
  }

  if (!first.data) {
    return (
      <output
        aria-label={messages["nav.members"]}
        className="flex flex-1 items-center justify-center py-20"
      >
        <Spinner className="size-8" />
      </output>
    );
  }

  return (
    /*
     * Keyed by the seed so a change of URL re-applies it. Navigating within one
     * route does not remount the component, so without this the dashboard's
     * `?filter=expiring` would stick after the sidebar's plain "A'zolar" link
     * had already cleared it from the address bar — the screen saying one thing
     * and the URL another. Remounting also closes any open sheet, which is the
     * right answer for a deliberate navigation.
     */
    <MembersView
      initial={first.data}
      key={`${seed.filter}|${seed.debt}|${seed.query}`}
      locale={locale}
      messages={messages}
      plans={planOptions}
      seed={seed}
    />
  );
};
