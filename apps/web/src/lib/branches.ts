/**
 * Which branch this terminal is pointed at.
 *
 * Device-scoped, like the sidebar and locale: a POS terminal sits in one
 * branch, so the machine remembers it rather than making whoever is on shift
 * pick it again.
 *
 * The list itself is real — it arrives with `GET /gym` — but **nothing is
 * scoped by it yet.** Every backend query filters by `gym_id` alone, so the
 * choice is remembered and displayed and changes no data. Wiring it up means
 * sending the branch on the feature queries and filtering there; until then,
 * treat a switch as a statement of intent rather than a filter.
 */
export const BRANCH_COOKIE = "profit-branch";
