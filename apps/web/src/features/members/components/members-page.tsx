import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { plansQuery } from "@/features/plans";
import { useLocale } from "@/lib/i18n/provider";
import { useMembersPage } from "../api";
import { DEFAULT_MEMBER_QUERY, type PlanOption } from "../types";
import { MembersView } from "./members-view";

/**
 * What `app/(authenticated)/members/page.tsx` was.
 *
 * The plan list is read through the plans feature's own query rather than a
 * second definition here — one source for "what plans exist" means the picker
 * in this sheet cannot disagree with the plans screen.
 */
export const MembersPage = () => {
  const { locale, messages } = useLocale();
  const first = useMembersPage(DEFAULT_MEMBER_QUERY);
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
    <MembersView
      initial={first.data}
      locale={locale}
      messages={messages}
      plans={planOptions}
    />
  );
};
