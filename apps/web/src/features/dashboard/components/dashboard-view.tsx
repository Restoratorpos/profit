import {
  BanknoteIcon,
  CreditCardIcon,
  DoorOpenIcon,
  HandCoinsIcon,
  LandmarkIcon,
  PackageIcon,
  ReceiptIcon,
  ShoppingBagIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import type { MessageKey, Messages } from "@/lib/i18n/dictionary";
import {
  changeFrom,
  type DashboardSnapshot,
  formatAmount,
  type RevenueRange,
  type RevenueReport,
} from "../types";
import { AttentionPanel } from "./attention-panel";
import { RevenuePanel } from "./revenue-panel";
import { StatTile } from "./stat-tile";
import { TopProducts } from "./top-products";

/**
 * The home screen, in three answers and a to-do list.
 *
 * Top to bottom is newest-question-first: what has happened since midnight, how
 * the chosen window is trending, where the business stands, and finally what
 * somebody has to do about it. An operator who reads only the first row has read
 * the thing they opened the app for.
 *
 * This component holds no state. The range lives on the page because it is the
 * revenue query's key, and the two panels that read it are given it rather than
 * each keeping their own — two ranges on one screen is two periods being
 * compared with nothing saying so.
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
 * digits and no currency word, so nine tiles do not say "UZS" nine times.
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

export const DashboardView = ({
  isRevenueStale,
  messages,
  onRangeChange,
  range,
  report,
  snapshot,
}: DashboardViewProperties) => {
  const { attention, cashboxes, members, presence, receivables, stock, today } =
    snapshot;
  const { previous, totals } = report;

  const owedToUs = Number(receivables.membership) + Number(receivables.shop);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <h1 className="sr-only">{messages["nav.dashboard"]}</h1>

      <section className="flex min-w-0 flex-col gap-3">
        <Heading>{messages["dash.today"]}</Heading>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* The one figure the screen leads with. Everything else on the page
              is context for it. */}
          <StatTile
            hero
            icon={WalletIcon}
            label={money(messages, "dash.todayRevenue")}
            value={formatAmount(today.revenue)}
          />
          <StatTile
            icon={ReceiptIcon}
            label={money(messages, "dash.todayExpense")}
            value={formatAmount(today.expense)}
          />
          <StatTile
            icon={DoorOpenIcon}
            label={messages["dash.todayVisits"]}
            value={String(today.visits)}
          >
            {/* Who is inside *right now* hangs off today's visits because it is
                the same question at a finer resolution. */}
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
            icon={ShoppingBagIcon}
            label={messages["dash.todayOrders"]}
            value={String(today.orders)}
          />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        {/* The window's own totals, with the change against the window before
            it — the same range the chart and the best-sellers list read. */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile
            delta={changeFrom(totals.revenue, previous.revenue)}
            deltaLabel={messages["dash.vsPrevious"]}
            icon={WalletIcon}
            label={money(messages, "dash.periodRevenue")}
            value={formatAmount(totals.revenue)}
          />
          <StatTile
            delta={changeFrom(totals.expense, previous.expense)}
            deltaLabel={messages["dash.vsPrevious"]}
            icon={ReceiptIcon}
            label={money(messages, "dash.periodExpense")}
            // Spending more is not good news, so the arrow that goes up here
            // is the red one.
            upIsGood={false}
            value={formatAmount(totals.expense)}
          />
          <StatTile
            delta={changeFrom(totals.net, previous.net)}
            deltaLabel={messages["dash.vsPrevious"]}
            icon={HandCoinsIcon}
            label={money(messages, "dash.periodNet")}
            value={formatAmount(totals.net)}
          />
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <RevenuePanel
              isStale={isRevenueStale}
              messages={messages}
              onRangeChange={onRangeChange}
              points={report.points}
              range={range}
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
        <Heading>{messages["dash.standing"]}</Heading>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={BanknoteIcon}
            label={money(messages, "tx.cashboxCash")}
            value={formatAmount(cashboxes.cash)}
          />
          <StatTile
            icon={CreditCardIcon}
            label={money(messages, "tx.cashboxCard")}
            value={formatAmount(cashboxes.card)}
          />
          <StatTile
            icon={LandmarkIcon}
            label={money(messages, "tx.cashboxBank")}
            value={formatAmount(cashboxes.transfer)}
          />

          <StatTile
            icon={UsersIcon}
            label={messages["dash.members"]}
            value={String(members.total)}
          >
            <Details>
              <Detail
                label={messages["dash.membersActive"]}
                value={String(members.active)}
              />
              <Detail
                label={messages["dash.membersExpiring"]}
                value={String(members.expiring)}
              />
              <Detail
                label={messages["dash.membersLapsed"]}
                value={String(members.lapsed)}
              />
              <Detail
                label={messages["dash.membersJoined"]}
                value={String(members.joinedThisMonth)}
              />
            </Details>
          </StatTile>

          {/* Two directions, two tiles. Netting what members owe us against
              what we owe suppliers would hide both. */}
          <StatTile
            icon={HandCoinsIcon}
            label={money(messages, "dash.receivables")}
            value={formatAmount(owedToUs)}
          >
            <Details>
              <Detail
                label={messages["dash.recvMembership"]}
                value={formatAmount(receivables.membership)}
              />
              <Detail
                label={messages["dash.recvShop"]}
                value={formatAmount(receivables.shop)}
              />
            </Details>
          </StatTile>
          <StatTile
            icon={TruckIcon}
            label={money(messages, "dash.payables")}
            value={formatAmount(receivables.supplier)}
          />

          <StatTile
            icon={PackageIcon}
            label={messages["dash.stock"]}
            value={String(stock.low + stock.out)}
          >
            <Details>
              <Detail
                label={messages["dash.stockLow"]}
                value={String(stock.low)}
              />
              <Detail
                label={messages["dash.stockOut"]}
                value={String(stock.out)}
              />
            </Details>
          </StatTile>
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <Heading>{messages["dash.attention"]}</Heading>

        <AttentionPanel
          debtors={attention.debtors}
          expiring={attention.expiring}
          lowStock={attention.lowStock}
          messages={messages}
        />
      </section>
    </div>
  );
};
