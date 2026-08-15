import { formatPhone } from "@repo/auth/lib/countries";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  CalendarClockIcon,
  type LucideIcon,
  PackageXIcon,
  WalletMinimalIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import type {
  DebtorRow,
  ExpiringMembership,
  LowStockRow,
  StockStatus,
} from "../types";
import { daysUntil, formatAmount } from "../types";

/**
 * The three lists that are a to-do, not a report.
 *
 * Everything above these on the screen is a number to know; this is the part
 * somebody acts on before the end of the shift — a membership about to lapse, a
 * shelf that is empty, a tab that has not been settled. They are short on
 * purpose: the backend caps each at six rows, because a dashboard list long
 * enough to scroll is a screen of its own and each card links to it.
 *
 * A card with nothing in it still renders. Its empty state is the answer to the
 * question ("nothing runs out this week"), and hiding the card would leave the
 * operator unsure whether it was checked or simply missing.
 *
 * Every row here is a destination, not a readout. The card header opens the
 * screen behind it already narrowed to what the card is about, and each row
 * carries the one term that finds that member, product or tab again — because a
 * six-row list whose only exit is an unfiltered table makes the operator search
 * for what they were just looking at.
 */

interface AttentionCardProperties {
  children: ReactNode;
  /** Rendered instead of `children` when the list is empty. */
  count: number;
  emptyText: string;
  icon: LucideIcon;
  title: string;
  /**
   * The "see all" control, built by the caller rather than from a `to` prop:
   * each card narrows its destination differently, and passing a path and a
   * search object down through here would erase the router's own typing of the
   * pair — which is the thing that catches a link to a filter that no longer
   * exists.
   */
  viewAll: ReactNode;
}

const AttentionCard = ({
  children,
  count,
  emptyText,
  icon: Icon,
  title,
  viewAll,
}: AttentionCardProperties) => (
  <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
    <header className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <h3 className="truncate font-medium text-body">{title}</h3>
        {count > 0 ? (
          <Badge className="tabular-nums" variant="secondary">
            {count}
          </Badge>
        ) : null}
      </div>

      {viewAll}
    </header>

    {count === 0 ? (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle className="text-body">{emptyText}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    ) : (
      <div className="min-w-0 overflow-x-auto">{children}</div>
    )}
  </section>
);

/** The name in a row, as the link that finds it again on its own screen. */
const ROW_LINK = "truncate font-medium hover:underline";

/**
 * How long a membership has left, in whichever unit it is sold by.
 *
 * A visit pass has no end date and a monthly one has no visit count, so the same
 * column carries both — and an already-lapsed row says so in words rather than
 * showing "-3 kun", which reads as an arithmetic bug.
 */
const RemainingCell = ({
  messages,
  row,
}: {
  messages: Messages;
  row: ExpiringMembership;
}) => {
  if (row.state === "expired") {
    return <Badge variant="destructive">{messages["dash.expired"]}</Badge>;
  }

  const days = daysUntil(row.endsAt);

  return (
    <span className="flex flex-col items-end gap-0.5">
      {days === null ? null : (
        <span className="whitespace-nowrap font-medium tabular-nums">
          {days <= 0
            ? messages["dash.today"]
            : `${days} ${messages["dash.dayShort"]}`}
        </span>
      )}
      {row.remainingVisits === null ? null : (
        <span className="whitespace-nowrap text-caption text-muted-foreground tabular-nums">
          {row.remainingVisits} {messages["dash.visitShort"]}
        </span>
      )}
    </span>
  );
};

const STOCK_BADGE: Record<
  StockStatus,
  "destructive" | "outline" | "secondary"
> = {
  in: "outline",
  low: "secondary",
  out: "destructive",
};

interface AttentionPanelProperties {
  debtors: DebtorRow[];
  expiring: ExpiringMembership[];
  lowStock: LowStockRow[];
  messages: Messages;
}

export const AttentionPanel = ({
  debtors,
  expiring,
  lowStock,
  messages,
}: AttentionPanelProperties) => (
  <div className="grid min-w-0 gap-4 xl:grid-cols-3">
    <AttentionCard
      count={expiring.length}
      emptyText={messages["dash.expiringEmpty"]}
      icon={CalendarClockIcon}
      title={messages["dash.expiring"]}
      viewAll={
        <Button asChild size="sm" variant="ghost">
          {/* The roster's own "muddati tugayotgan" tab, so the six rows above
              open as the whole list they were the head of. */}
          <Link search={{ filter: "expiring" }} to="/members">
            {messages["dash.viewAll"]}
            <ArrowRightIcon />
          </Link>
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{messages["dash.colMember"]}</TableHead>
            <TableHead>{messages["dash.colPlan"]}</TableHead>
            <TableHead className="text-right">
              {messages["dash.colLeft"]}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expiring.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="max-w-40">
                <span className="flex min-w-0 flex-col">
                  {/* Searched by phone where there is one: two members can
                      share a name, and the desk is about to ring this one. */}
                  <Link
                    className={ROW_LINK}
                    search={{ q: row.phone ?? row.name }}
                    to="/members"
                  >
                    {row.name}
                  </Link>
                  {row.phone ? (
                    /* A real tel: link, not a printed number — on the desk's
                       tablet this is the call, and on the terminal it is still
                       the digits to read out. */
                    <a
                      className="truncate text-caption text-muted-foreground tabular-nums hover:underline"
                      href={`tel:+${row.phone}`}
                      title={messages["dash.call"]}
                    >
                      {formatPhone(row.phone)}
                    </a>
                  ) : null}
                </span>
              </TableCell>
              <TableCell className="max-w-32 truncate text-muted-foreground">
                {row.plan}
              </TableCell>
              <TableCell className="text-right">
                <RemainingCell messages={messages} row={row} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AttentionCard>

    <AttentionCard
      count={lowStock.length}
      emptyText={messages["dash.lowStockEmpty"]}
      icon={PackageXIcon}
      title={messages["dash.lowStock"]}
      viewAll={
        <Button asChild size="sm" variant="ghost">
          {/* Sorted, not filtered: this card mixes "kam qoldi" with "tugagan"
              and the stock screen's filter is one status at a time, so picking
              one would hide half of what was just on screen. Ascending stock
              puts the same rows on top and keeps the rest reachable. */}
          <Link search={{ sort: "stock" }} to="/inventory">
            {messages["dash.viewAll"]}
            <ArrowRightIcon />
          </Link>
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{messages["dash.colProduct"]}</TableHead>
            <TableHead className="text-right">
              {messages["dash.colStock"]}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lowStock.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="max-w-48">
                <Link
                  className={ROW_LINK}
                  search={{ q: row.name }}
                  to="/inventory"
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell className="text-right">
                {/* The badge says which of the two states this is; the figure
                    alone cannot, because "low" is a per-product threshold. */}
                <span className="flex items-center justify-end gap-2">
                  <span className="whitespace-nowrap tabular-nums">
                    {formatAmount(row.stock)}
                    {row.unit ? (
                      <span className="text-muted-foreground"> {row.unit}</span>
                    ) : null}
                  </span>
                  <Badge variant={STOCK_BADGE[row.status]}>
                    {row.status === "out"
                      ? messages["dash.stockOut"]
                      : messages["dash.stockLow"]}
                  </Badge>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AttentionCard>

    <AttentionCard
      count={debtors.length}
      emptyText={messages["dash.debtorsEmpty"]}
      icon={WalletMinimalIcon}
      title={messages["dash.debtors"]}
      viewAll={
        <Button asChild size="sm" variant="ghost">
          <Link search={{ filter: "unpaid" }} to="/orders">
            {messages["dash.viewAll"]}
            <ArrowRightIcon />
          </Link>
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{messages["dash.colWho"]}</TableHead>
            <TableHead className="text-right">
              {messages["dash.colDebt"]}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {debtors.map((row) => (
            <TableRow key={`${row.type}:${row.id}`}>
              <TableCell className="max-w-48">
                <span className="flex min-w-0 flex-col">
                  {/* The unpaid tab, narrowed to this one tab-holder — the
                      orders list searches names and carries staff as well as
                      members, so both kinds of row land somewhere real. */}
                  <Link
                    className={ROW_LINK}
                    search={{ filter: "unpaid", q: row.name }}
                    to="/orders"
                  >
                    {row.name}
                  </Link>
                  {/* Members and staff both run tabs, and chasing one is not
                      the same conversation as chasing the other. */}
                  <span className="text-caption text-muted-foreground">
                    {row.type === "worker"
                      ? messages["dash.typeWorker"]
                      : messages["dash.typeMember"]}
                  </span>
                </span>
              </TableCell>
              <TableCell
                className={cn(
                  "whitespace-nowrap text-right font-medium tabular-nums",
                  Number(row.remaining) > 0 && "text-destructive"
                )}
              >
                {formatAmount(row.remaining)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AttentionCard>
  </div>
);
