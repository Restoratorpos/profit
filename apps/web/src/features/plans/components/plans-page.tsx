import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useLocale } from "@/lib/i18n/provider";
import { useHalls, usePlans, useTrainers } from "../api";
import { PlansView } from "./plans-view";

/**
 * What `app/(authenticated)/plans/page.tsx` was: fetch the three lists the page
 * needs, then render the view.
 *
 * The server component awaited all three with `Promise.all` so none waited on
 * another. Three `useQuery` calls are already concurrent, so that property is
 * preserved without arranging for it.
 *
 * Only the plans list gates rendering. Halls and trainers populate pickers
 * inside the edit sheet, so holding the whole table back for them would trade a
 * visible table for a spinner nobody asked for — they arrive before anyone
 * opens the sheet.
 */
export const PlansPage = () => {
  const { messages } = useLocale();
  const plans = usePlans();
  const halls = useHalls();
  const trainers = useTrainers();

  if (plans.isPending) {
    return (
      <output
        aria-label={messages["nav.plans"]}
        className="flex flex-1 items-center justify-center py-20"
      >
        <Spinner className="size-8" />
      </output>
    );
  }

  if (plans.error) {
    return (
      <p
        className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
        role="alert"
      >
        {plans.error.message}
      </p>
    );
  }

  return (
    <PlansView
      halls={halls.data ?? []}
      messages={messages}
      plans={plans.data}
      trainers={trainers.data ?? []}
    />
  );
};
