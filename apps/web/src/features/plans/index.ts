/**
 * The plans vertical's public surface.
 *
 * Routes and other features import from here, never from a file inside
 * `components/` — so the internals can be rearranged without a hunt through
 * unrelated folders for the imports that broke.
 */
export { hallsQuery, plansQuery, trainersQuery } from "./api";
export { PlansPage } from "./components/plans-page";
export type { NamedOption, PlanListItem, PlanMember } from "./types";
