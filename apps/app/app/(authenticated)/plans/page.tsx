import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import type { NamedOption, PlanListItem } from "@/lib/plans";
import { PlansView } from "./components/plans-view";

export const metadata: Metadata = {
  title: "Rejalar",
};

const PlansPage = async () => {
  // All independent, so they are in flight together rather than in sequence.
  const plansPromise = backendFetch<PlanListItem[]>("/plans");
  const hallsPromise = backendFetch<NamedOption[]>("/halls");
  const trainersPromise = backendFetch<NamedOption[]>("/trainers");
  const localePromise = getLocale();

  const [plans, halls, trainers, locale] = await Promise.all([
    plansPromise,
    hallsPromise,
    trainersPromise,
    localePromise,
  ]);

  return (
    <PlansView
      halls={halls}
      messages={getMessages(locale)}
      plans={plans}
      trainers={trainers}
    />
  );
};

export default PlansPage;
