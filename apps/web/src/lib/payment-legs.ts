/**
 * Splitting a sale across more than one payment.
 *
 * Shared by the shop checkout and the plan sale because they ask the identical
 * question — some cash, then the rest on a card, then whatever is still short
 * left owed — and the two must not drift apart. What each screen keeps for
 * itself is what a settled sale *means* there: an order is settled or open, a
 * membership is charged at a price. See `settlementOf` in `lib/orders` and
 * `lib/members`.
 */

/** The four answers, identical on both screens. */
export type LegMethod = "card" | "cash" | "debt" | "free";

/** The two that are real drawers — the only places money can actually land. */
export type Till = "card" | "cash";

/** One leg of how a sale is being settled: a method and how much of it. */
export interface PaymentLeg {
  /** Blank means "whatever is left", which is what a last leg usually wants. */
  amount: string;
  method: LegMethod;
  /**
   * Which drawer a part payment on a **qarz** leg went into.
   *
   * Only a qarz needs this. Picking qarz and then typing a figure is the desk
   * saying "this sale is on credit, but they are handing over this much now" —
   * the same sale as a till leg with a qarz behind it, entered from the other
   * end, and the money still has to land somewhere real.
   */
  till?: Till;
}

/** A sale may be split three ways at most — the same cap the backend enforces. */
export const MAX_PAYMENT_LEGS = 3;

/** What a fresh form starts with: pay the lot, in cash. */
export const firstLeg = (): PaymentLeg[] => [{ amount: "", method: "cash" }];

/** Whether this method is a drawer in its own right. */
export const takesMoney = (method: LegMethod): boolean =>
  method === "cash" || method === "card";

/**
 * Whether nothing can follow this method: it has already answered for whatever
 * is left, as a debt or as a write-off.
 */
export const endsChain = (method: LegMethod): boolean => !takesMoney(method);

/**
 * Whether an amount can be typed against this method.
 *
 * Only a comp cannot: it charges nothing, so there is no figure to enter. A
 * qarz can — that is a part payment against a credit sale, which is ordinary.
 */
export const canTypeAmount = (method: LegMethod): boolean => method !== "free";

/** The typed figure, or null when the box is blank or unreadable. */
const typedAmount = (leg: PaymentLeg): number | null => {
  if (leg.amount.trim() === "") {
    return null;
  }

  const typed = Number(leg.amount);

  // An unreadable amount counts as nothing tendered, so the qoldiq reads as the
  // whole outstanding sum rather than quietly showing a settled sale.
  return Number.isFinite(typed) ? Math.max(typed, 0) : 0;
};

/** What a leg actually covers, given what is still outstanding when reached. */
export const legTakes = (leg: PaymentLeg, outstanding: number): number => {
  if (leg.method === "free") {
    return 0;
  }

  const typed = typedAmount(leg);

  // A blank box on a qarz takes nothing — the whole rest is owed. On a till it
  // means the opposite: whatever is left, which is the ordinary sale.
  if (typed === null) {
    return leg.method === "debt" ? 0 : outstanding;
  }

  // Overpaying settles the sale; it never books a credit.
  return Math.min(typed, outstanding);
};

/**
 * Whether this leg has to say which drawer its money went into.
 *
 * Only a qarz carrying a part payment: a till leg already names its own drawer,
 * and a qarz with an empty box took nothing. The final leg is excluded because
 * its qarz is the tail of the sale, not a payment.
 */
export const needsTill = (leg: PaymentLeg, index: number): boolean =>
  leg.method === "debt" && !isFinalLeg(index) && (typedAmount(leg) ?? 0) > 0;

/**
 * How many legs the form should show.
 *
 * Every leg that is still reachable, plus one more if the sale is short after
 * all of them. So the second row appears the moment a part payment is typed and
 * the third the moment that one is short too — and both disappear again the
 * moment an earlier leg is changed to cover the lot, rather than lingering with
 * a figure nobody can see the effect of.
 *
 * A qarz or a comp ends the count where it sits: it has already answered for
 * the rest, and another row would be offering to undo it.
 */
export const visibleLegCount = (
  total: number,
  legs: readonly PaymentLeg[]
): number => {
  let outstanding = total;
  let shown = 0;

  for (const leg of legs) {
    shown++;

    if (endsChain(leg.method)) {
      return shown;
    }

    outstanding -= legTakes(leg, outstanding);

    if (outstanding <= 0) {
      return shown;
    }
  }

  return Math.min(shown + 1, MAX_PAYMENT_LEGS);
};

/** One leg as the backend takes it: no `till`, and no blank amounts. */
export interface Payment {
  amount?: string;
  method: LegMethod;
}

/**
 * The legs as the backend wants them: paying methods first, then whatever is
 * left over.
 *
 * A qarz carrying a part payment is two legs there and one row here — the desk
 * thinks "a credit sale they paid something towards", the ledger records "a
 * payment, and a balance". Same sale, and this is where the two meet.
 *
 * Blank amounts stay blank: that means "whatever is left", which the server
 * works out from its own prices rather than trusting a figure from here.
 */
export const toPayments = (legs: readonly PaymentLeg[]): Payment[] =>
  legs.flatMap<Payment>((leg) => {
    const amount = leg.amount.trim();
    const typed =
      amount === "" || !canTypeAmount(leg.method) ? undefined : amount;

    if (leg.method !== "debt" || typed === undefined) {
      return [{ amount: typed, method: leg.method }];
    }

    return [
      { amount: typed, method: leg.till ?? "cash" },
      { amount: undefined, method: "debt" },
    ];
  });

/**
 * Writes one leg, and trims anything after it the change made pointless.
 *
 * The rows on screen run one ahead of the state — the next row is offered
 * before anybody has touched it — so a patch may land on an index that does not
 * exist yet. It has to be created rather than dropped: `map` alone silently
 * discards the operator's first tap on a new row, which reads as a dead
 * control.
 *
 * Trimming is the other half. A leg the operator has moved on from is not one
 * they mean to keep: switch the first back to covering the lot and the second
 * row's card payment must not still be sitting there, invisible, ready to be
 * submitted.
 */
export const withLeg = (
  total: number,
  legs: readonly PaymentLeg[],
  index: number,
  patch: Partial<PaymentLeg>
): PaymentLeg[] => {
  const next = [...legs];

  while (next.length <= index) {
    next.push({ amount: "", method: "cash" });
  }

  next[index] = { ...next[index], ...patch };

  return next.slice(0, Math.max(visibleLegCount(total, next), index + 1));
};

/**
 * Whether this is the last leg the form will ever offer.
 *
 * The final one takes whatever is left and cannot be typed into: there is no
 * fourth row to carry a shortfall, so letting the desk enter less than the rest
 * would be offering to leave money in a place that does not exist.
 */
export const isFinalLeg = (index: number): boolean =>
  index === MAX_PAYMENT_LEGS - 1;
