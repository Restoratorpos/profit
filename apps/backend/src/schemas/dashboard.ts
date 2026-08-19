import { z } from "zod";

/**
 * The home screen.
 *
 * It owns no data of its own. Every figure on it is either composed from the
 * service that already owns it — so the dashboard and the screen it links to can
 * never disagree — or is a straight aggregate the dashboard is the only caller
 * of (who is inside right now, money by day).
 */

/**
 * The windows the range control offers. `1` is today.
 *
 * Four presets rather than a free date picker: the question the desk asks is
 * "how is the week going", not "what happened between the 3rd and the 11th". A
 * custom range belongs on a report, and there is no report screen yet.
 *
 * The default is today, because that is the figure the desk opens the screen
 * for. It matches what `apps/mobile` has always sent — the phone has used
 * `[1, 7, 30, 90]` defaulting to `1` since it shipped, and the web was the odd
 * one out.
 */
export const REVENUE_RANGES = [1, 7, 30, 90] as const;

export type RevenueRange = (typeof REVENUE_RANGES)[number];

export const DEFAULT_REVENUE_RANGE: RevenueRange = 1;

/**
 * `days` is validated as a bounded number rather than an enum of the three
 * presets. The presets are a UI decision and the chart copes with any width; the
 * bound is the thing that has to hold server-side, so a crafted `?days=100000`
 * cannot make the server assemble a hundred thousand buckets.
 */
export const revenueQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(366).default(DEFAULT_REVENUE_RANGE),
});

export type RevenueQuery = z.infer<typeof revenueQuerySchema>;
