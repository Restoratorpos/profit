import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import {
  DEFAULT_MEMBER_QUERY,
  type MemberPage,
  type PlanOption,
} from "@/lib/members";
import type { PlanListItem } from "@/lib/plans";
import { MembersView } from "./components/members-view";

export const metadata: Metadata = {
  title: "A'zolar",
};

const MembersPage = async () => {
  /*
   * The first page is fetched here rather than by the view on mount, so the
   * table arrives with the document instead of flashing empty. Every change to
   * the query after that goes through `loadMembersAction`.
   *
   * Independent of the plan list, so neither waits on the other.
   */
  const membersPromise = backendFetch<MemberPage>(
    `/members/page?filter=${DEFAULT_MEMBER_QUERY.filter}&page=1&pageSize=${DEFAULT_MEMBER_QUERY.pageSize}`
  );
  const plansPromise = backendFetch<PlanListItem[]>("/plans");
  const localePromise = getLocale();

  const [initial, plans, locale] = await Promise.all([
    membersPromise,
    plansPromise,
    localePromise,
  ]);

  // Only three fields of a plan cross the RSC boundary; the rest of the row
  // would be serialized into the page for nothing.
  const planOptions: PlanOption[] = plans
    .filter((plan) => plan.isActive)
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      price: plan.price ?? "0",
    }));

  return (
    <MembersView
      initial={initial}
      messages={getMessages(locale)}
      plans={planOptions}
    />
  );
};

export default MembersPage;
