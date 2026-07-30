import { formatPhone } from "@repo/auth/lib/countries";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import { cn } from "@repo/design-system/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DateField } from "@/components/date-field";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  type DatePreset,
  formatDateTime,
  hasDebt,
  isWithinRange,
  type MemberOrderSummary,
  type OrderFilter,
  type PosProduct,
  rangeForPreset,
} from "../types";
import { OrderDetailSheet } from "./order-detail-sheet";
import { OrderEditSheet } from "./order-edit-sheet";

interface OrdersViewProperties {
  locale: Locale;
  messages: Messages;
  /** The catalog the edit sheet's "Add product" picker offers. */
  products: readonly PosProduct[];
  summaries: readonly MemberOrderSummary[];
}

const FILTERS: readonly { key: OrderFilter; labelKey: keyof Messages }[] = [
  { key: "unpaid", labelKey: "orders.filterUnpaid" },
  { key: "paid", labelKey: "orders.filterPaid" },
  { key: "all", labelKey: "orders.filterAll" },
];

const PRESETS: readonly { key: DatePreset; labelKey: keyof Messages }[] = [
  { key: "today", labelKey: "orders.rangeToday" },
  { key: "week", labelKey: "orders.rangeWeek" },
  { key: "month", labelKey: "orders.rangeMonth" },
  { key: "year", labelKey: "orders.rangeYear" },
  { key: "all", labelKey: "orders.rangeAll" },
];

const PAGE_SIZES = [25, 50, 100] as const;

export const OrdersView = ({
  locale,
  messages,
  products,
  summaries,
}: OrdersViewProperties) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("unpaid");
  const [preset, setPreset] = useState<DatePreset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<MemberOrderSummary | null>(null);
  const [editing, setEditing] = useState<MemberOrderSummary | null>(null);

  // Everything with an order in the active date range; the tab counts are read
  // off this set so they reflect the range the operator is looking at.
  const inRange = useMemo(
    () =>
      summaries.filter((summary) =>
        isWithinRange(summary.latestOrderAt, from, to)
      ),
    [from, summaries, to]
  );

  const counts = useMemo(() => {
    let unpaid = 0;

    for (const summary of inRange) {
      if (hasDebt(summary.remaining)) {
        unpaid += 1;
      }
    }

    return { all: inRange.length, paid: inRange.length - unpaid, unpaid };
  }, [inRange]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return inRange.filter((summary) => {
      if (filter === "unpaid" && !hasDebt(summary.remaining)) {
        return false;
      }

      if (filter === "paid" && hasDebt(summary.remaining)) {
        return false;
      }

      if (needle.length === 0) {
        return true;
      }

      return (
        summary.name.toLowerCase().includes(needle) ||
        (summary.phone ?? "").includes(needle)
      );
    });
  }, [filter, inRange, query]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageRows = visible.slice(start, start + pageSize);

  const applyPreset = (next: DatePreset) => {
    const range = rangeForPreset(next);

    setPreset(next);
    setFrom(range.from);
    setTo(range.to);
    setPage(0);
  };

  const editDates = (which: "from" | "to", value: string) => {
    // Editing a bound by hand is a custom range — no preset is highlighted.
    setPreset("all");
    setPage(0);

    if (which === "from") {
      setFrom(value);
    } else {
      setTo(value);
    }
  };

  const changeFilter = (next: OrderFilter) => {
    setFilter(next);
    setPage(0);
  };

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      {/*
       * One toolbar of two rows rather than two toolbars, and the rows are ranked:
       * which orders, then which period. Both "pick one of these" controls are the
       * same segmented group the till's Bar/Do'kon tabs use — they were an outline
       * row and a ghost row before, which made one set of tabs look like buttons
       * and the other like links.
       */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div
            aria-label={messages["nav.orders"]}
            className="flex items-center gap-1 rounded-lg bg-muted p-1"
            role="radiogroup"
          >
            {FILTERS.map((option) => {
              const active = filter === option.key;

              return (
                <Button
                  aria-checked={active}
                  className={cn("gap-2", !active && "text-muted-foreground")}
                  key={option.key}
                  onClick={() => changeFilter(option.key)}
                  role="radio"
                  size="sm"
                  type="button"
                  variant={active ? "default" : "ghost"}
                >
                  {messages[option.labelKey]}
                  <span className="font-semibold tabular-nums opacity-70">
                    {counts[option.key]}
                  </span>
                </Button>
              );
            })}
          </div>

          {/* Sized, not stretched — the same rule the roster's search follows. */}
          <div className="w-72 max-w-full">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <SearchIcon className="size-5" />
              </InputGroupAddon>
              <InputGroupInput
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder={messages["orders.search"]}
                value={query}
              />
            </InputGroup>
          </div>

          <Button asChild className="ml-auto">
            <Link to="/orders/new">
              <PlusIcon className="size-5" />
              {messages["orders.newOrder"]}
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            aria-label={messages["orders.rangeAll"]}
            className="flex items-center gap-1 rounded-lg bg-muted p-1"
            role="radiogroup"
          >
            {PRESETS.map((option) => {
              const active = preset === option.key;

              return (
                <Button
                  aria-checked={active}
                  className={cn(!active && "text-muted-foreground")}
                  key={option.key}
                  onClick={() => applyPreset(option.key)}
                  role="radio"
                  size="sm"
                  type="button"
                  variant={active ? "default" : "ghost"}
                >
                  {messages[option.labelKey]}
                </Button>
              );
            })}
          </div>

          {/* The two ends carry their own labels as placeholders. Empty and
              unlabelled, they were two wide boxes holding a calendar glyph and
              nothing else — which reads as a control that failed to load rather
              than as "no bound set". */}
          <div className="flex items-center gap-2">
            <DateField
              aria-label={messages["orders.rangeStart"]}
              className="w-40"
              onChange={(next) => editDates("from", next)}
              placeholder={messages["orders.rangeStart"]}
              value={from}
            />
            <span className="text-muted-foreground">—</span>
            <DateField
              aria-label={messages["orders.rangeEnd"]}
              className="w-40"
              onChange={(next) => editDates("to", next)}
              placeholder={messages["orders.rangeEnd"]}
              value={to}
            />
          </div>
        </div>
      </div>

      {pageRows.length === 0 ? (
        <p className="rounded-xl border py-16 text-center text-muted-foreground">
          {summaries.length === 0
            ? messages["orders.empty"]
            : messages["orders.noResults"]}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pageRows.map((summary) => {
            const owes = hasDebt(summary.remaining);
            const isWorker = summary.userType === "worker";

            return (
              <li
                className={cn(
                  "flex items-center gap-4 rounded-xl border border-l-4 px-4 py-3",
                  // The left edge says who is buying, not what they owe — the
                  // amount on the right already carries that.
                  isWorker ? "border-l-amber-500" : "border-l-primary"
                )}
                key={`${summary.userType}:${summary.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-lg">
                    <span className="truncate">
                      {summary.name || formatPhone(summary.phone) || summary.id}
                    </span>
                    {/* Colour alone must not carry the distinction. */}
                    {isWorker ? (
                      <Badge
                        className="shrink-0 border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-500"
                        variant="secondary"
                      >
                        {messages["orders.staffBadge"]}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {formatDateTime(summary.latestOrderAt, locale)}
                  </p>
                </div>

                <div className="text-right">
                  {owes ? (
                    <span className="font-bold text-destructive text-xl">
                      {formatMoney(summary.remaining)}
                    </span>
                  ) : (
                    <Badge variant="secondary">
                      <CheckIcon className="size-3.5" />
                      {messages["orders.paidBadge"]}
                    </Badge>
                  )}
                </div>

                {/* Only unsettled orders are editable — a fully-paid member has
                    nothing open to correct, so they get no pencil. */}
                {owes ? (
                  <Button
                    aria-label={messages["common.edit"]}
                    onClick={() => setEditing(summary)}
                    size="icon"
                    variant="ghost"
                  >
                    <PencilIcon className="size-5" />
                  </Button>
                ) : null}

                <Button
                  onClick={() => setSelected(summary)}
                  variant={owes ? "default" : "outline"}
                >
                  {owes ? (
                    <>
                      <CheckIcon className="size-5" />
                      {messages["orders.pay"]}
                    </>
                  ) : (
                    messages["orders.view"]
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {messages["orders.rows"]}
          </span>
          {PAGE_SIZES.map((size) => (
            <Button
              aria-checked={pageSize === size}
              key={size}
              onClick={() => {
                setPageSize(size);
                setPage(0);
              }}
              role="radio"
              size="sm"
              type="button"
              variant={pageSize === size ? "default" : "ghost"}
            >
              {size}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3 text-muted-foreground text-sm">
          <span>
            {visible.length === 0 ? 0 : start + 1}–
            {Math.min(start + pageSize, visible.length)} / {visible.length}
          </span>
          <Button
            aria-label={messages["orders.prevPage"]}
            disabled={safePage === 0}
            onClick={() => setPage((current) => Math.max(current - 1, 0))}
            size="icon"
            variant="ghost"
          >
            <ChevronLeftIcon className="size-5" />
          </Button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <Button
            aria-label={messages["orders.nextPage"]}
            disabled={safePage >= pageCount - 1}
            onClick={() =>
              setPage((current) => Math.min(current + 1, pageCount - 1))
            }
            size="icon"
            variant="ghost"
          >
            <ChevronRightIcon className="size-5" />
          </Button>
        </div>
      </div>

      <OrderDetailSheet
        key={selected?.id ?? "none"}
        locale={locale}
        messages={messages}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        summary={selected}
      />

      <OrderEditSheet
        key={`edit-${editing?.id ?? "none"}`}
        locale={locale}
        messages={messages}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        products={products}
        summary={editing}
      />
    </div>
  );
};
