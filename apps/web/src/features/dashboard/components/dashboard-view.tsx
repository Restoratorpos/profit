import { Button } from "@repo/design-system/components/ui/button";
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  DoorOpenIcon,
  ReceiptIcon,
  ShoppingBagIcon,
  WalletIcon,
} from "lucide-react";
import type { MessageKey, Messages } from "@/lib/i18n/dictionary";
import {
  changeFrom,
  type DashboardSnapshot,
  formatAmount,
  RANGE_LABEL,
  REVENUE_RANGES,
  type RevenueRange,
  type RevenueReport,
} from "../types";
import { AttentionPanel } from "./attention-panel";
import { RevenuePanel } from "./revenue-panel";
import { StatTile } from "./stat-tile";
import { TopProducts } from "./top-products";

/**
 * The home screen, in two halves and one period.
 *
 * **The range at the top right governs the whole money half** — the tile row,
 * the trend and the best sellers all read the same window, so every figure
 * above the divider answers the same question. It used to govern only the
 * chart, which left today's tiles sitting above a thirty-day graph: two periods
 * on one screen with nothing saying so.
 *
 * What it deliberately does *not* govern is the band below. A debt is a balance
 * now, a shelf is empty now, and a membership runs out in the future — there is
 * no such thing as "shelves running low over the last 30 days". The attention
 * lists are always current, which is why they sit under their own heading with
 * the range control nowhere near them.
 *
 * "In the gym now" is the other permanent present tense, and it stays hung off
 * the visits tile, where the finer resolution belongs.
 *
 * This component holds no state. The range lives on the page because it is the
 * revenue query's key: what decides which window is fetched has to sit above
 * what fetches it.
 */

interface DashboardViewProperties {
  /** True while a new window loads. The panels dim rather than empty. */
  isRevenueStale: boolean;
  messages: Messages;
  onRangeChange: (next: RevenueRange) => void;
  range: RevenueRange;
  report: RevenueReport;
  snapshot: DashboardSnapshot;
}

/**
 * A money tile wears its unit in the label, once. `formatAmount` prints grouped
 * digits and no currency word, so the tiles do not say "UZS" over and over.
 */
const money = (messages: Messages, key: MessageKey): string =>
  `${messages[key]}, ${messages["common.currency"]}`;

const Heading = ({ children }: { children: string }) => (
  <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
    {children}
  </h2>
);

/** One "12 faol" pair. Several of these are a tile's breakdown line. */
const Detail = ({ label, value }: { label: string; value: string }) => (
  <span className="flex items-baseline gap-1">
    <span className="font-medium tabular-nums">{value}</span>
    <span className="text-muted-foreground">{label}</span>
  </span>
);

const Details = ({ children }: { children: React.ReactNode }) => (
  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption">
    {children}
  </span>
);

/**
 * The one period control on the screen, at the top where it can be seen to
 * govern everything under it rather than the single card it used to live in.
 */
const RangeControl = ({
  messages,
  onChange,
  range,
}: {
  messages: Messages;
  onChange: (next: RevenueRange) => void;
  range: RevenueRange;
}) => (
  <div className="flex items-center gap-1">
    {REVENUE_RANGES.map((days) => (
      <Button
        aria-pressed={days === range}
        className={cn(days === range && SELECTED_TINT)}
        key={days}
        onClick={() => onChange(days)}
        size="sm"
        type="button"
        variant="outline"
      >
        {messages[RANGE_LABEL[days]]}
      </Button>
    ))}
  </div>
);

/**
 * The whole money tile is the link, not an arrow in the corner of it.
 *
 * Deliberately no `aria-label`: one would *replace* the card's text as the
 * link's name, and the label and figure on the card are a better thing to hear.
 * The anchor wraps the tile, so its name is the tile.
 *
 * The focus ring is here rather than on the tile because the anchor is what
 * takes focus, and it restates `Button`'s ring so a keyboard lands on the same
 * outline everywhere in the app.
 */
const TILE_LINK =
  "rounded-xl outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export const DashboardView = ({
  isRevenueStale,
  messages,
  onRangeChange,
  range,
  report,
  snapshot,
}: DashboardViewProperties) => {
  const { attention, presence, receivables } = snapshot;
  const { activity, previous, previousActivity, totals } = report;

  /*
   * What members owe across both counters. It rides on the debtors card rather
   * than in a tile of its own: the list under it is who that money is with.
   */
  const owedToUs = Number(receivables.membership) + Number(receivables.shop);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">
          {messages["nav.dashboard"]}
        </h1>

        <RangeControl
          messages={messages}
          onChange={onRangeChange}
          range={range}
        />
      </header>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* The one figure the screen leads with. Everything else is context
              for it, and net hangs underneath because "what did we take" and
              "what was left of it" are one thought. */}
          <Link
            className={TILE_LINK}
            search={{ kind: "income" }}
            to="/transactions"
          >
            <StatTile
              delta={changeFrom(totals.revenue, previous.revenue)}
              deltaLabel={messages["dash.vsPrevious"]}
              hero
              icon={WalletIcon}
              interactive
              label={money(messages, "dash.periodRevenue")}
              value={formatAmount(totals.revenue)}
            >
              <Details>
                <Detail
                  label={messages["dash.periodNet"]}
                  value={formatAmount(totals.net)}
                />
              </Details>
            </StatTile>
          </Link>

          <Link
            className={TILE_LINK}
            search={{ kind: "expense" }}
            to="/transactions"
          >
            <StatTile
              delta={changeFrom(totals.expense, previous.expense)}
              deltaLabel={messages["dash.vsPrevious"]}
              icon={ReceiptIcon}
              interactive
              label={money(messages, "dash.periodExpense")}
              // Spending more is not good news, so the arrow that rises here is
              // the red one.
              upIsGood={false}
              value={formatAmount(totals.expense)}
            />
          </Link>

          <StatTile
            delta={changeFrom(activity.visits, previousActivity.visits)}
            deltaLabel={messages["dash.vsPrevious"]}
            icon={DoorOpenIcon}
            label={messages["dash.visits"]}
            value={String(activity.visits)}
          >
            {/* Who is inside *right now* — the one figure in this row the range
                cannot touch, which is why it says so in words. */}
            <Details>
              <span className="text-muted-foreground">
                {messages["dash.presence"]}
              </span>
              <Detail
                label={messages["dash.presenceMembers"]}
                value={String(presence.members)}
              />
              <Detail
                label={messages["dash.presenceWorkers"]}
                value={String(presence.workers)}
              />
            </Details>
          </StatTile>

          <StatTile
            delta={changeFrom(activity.orders, previousActivity.orders)}
            deltaLabel={messages["dash.vsPrevious"]}
            icon={ShoppingBagIcon}
            label={messages["dash.orders"]}
            value={String(activity.orders)}
          />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            {/* No range control and no totals of its own any more: the header
                above owns the period, and the tiles above are the totals. */}
            <RevenuePanel
              isStale={isRevenueStale}
              messages={messages}
              points={report.points}
            />
          </div>

          <TopProducts
            isStale={isRevenueStale}
            messages={messages}
            products={report.topProducts}
          />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <Heading>{messages["dash.attention"]}</Heading>

        <AttentionPanel
          debtorCount={attention.debtorCount}
          debtorNote={`${formatAmount(owedToUs)} ${messages["common.currency"]}`}
          debtors={attention.debtors}
          expiring={attention.expiring}
          expiringCount={attention.expiringCount}
          lowStock={attention.lowStock}
          lowStockCount={attention.lowStockCount}
          messages={messages}
        />
      </section>
    </div>
  );
};
