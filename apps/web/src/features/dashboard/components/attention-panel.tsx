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
 */

interface AttentionCardProperties {
  children: ReactNode;
  /** Rendered instead of `children` when the list is empty. */
  count: number;
  emptyText: string;
  icon: LucideIcon;
  linkLabel: string;
  title: string;
  to: "/inventory" | "/members" | "/orders";
}

const AttentionCard = ({
  children,
  count,
  emptyText,
  icon: Icon,
  linkLabel,
  title,
  to,
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

      <Button asChild size="sm" variant="ghost">
        <Link to={to}>
          {linkLabel}
          <ArrowRightIcon />
        </Link>
      </Button>
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
      linkLabel={messages["dash.viewAll"]}
      title={messages["dash.expiring"]}
      to="/members"
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
              <TableCell className="max-w-40 truncate font-medium">
                {row.name}
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
      linkLabel={messages["dash.viewAll"]}
      title={messages["dash.lowStock"]}
      to="/inventory"
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
              <TableCell className="max-w-48 truncate font-medium">
                {row.name}
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
      linkLabel={messages["dash.viewAll"]}
      title={messages["dash.debtors"]}
      to="/orders"
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
                  <span className="truncate font-medium">{row.name}</span>
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
