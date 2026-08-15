import { formatPhone } from "@repo/auth/lib/countries";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Separator } from "@repo/design-system/components/ui/separator";
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DateField } from "@/components/date-field";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  DATE_PRESETS,
  type DatePreset,
  formatDateTime,
  formatDayShort,
  hasDebt,
  isWithinRange,
  type MemberOrderSummary,
  type OrderFilter,
  type OrderSeed,
  type PosProduct,
  presetOf,
  rangeForPreset,
} from "../types";
import { OrderDetailSheet } from "./order-detail-sheet";
import { OrderEditSheet } from "./order-edit-sheet";

interface OrdersViewProperties {
  locale: Locale;
  messages: Messages;
  /** The catalog the edit sheet's "Add product" picker offers. */
  products: readonly PosProduct[];
  /**
   * What the URL asked for, read once as the opening tab and search. Later
   * edits stay here rather than going back to the address bar.
   */
  seed: OrderSeed;
  summaries: readonly MemberOrderSummary[];
}

const FILTERS: readonly { key: OrderFilter; labelKey: keyof Messages }[] = [
  { key: "unpaid", labelKey: "orders.filterUnpaid" },
  { key: "paid", labelKey: "orders.filterPaid" },
  { key: "all", labelKey: "orders.filterAll" },
];

/**
 * Total over `DatePreset`, so adding a preset without a label is a compile
 * error. This replaces the old parallel `PRESETS` array — the presets are now
 * iterated straight off `DATE_PRESETS`, so there is no second list to fall out
 * of step with the first.
 */
const PRESET_LABEL: Record<DatePreset, keyof Messages> = {
  any: "orders.rangeAny",
  month: "orders.rangeMonth",
  today: "orders.rangeToday",
  week: "orders.rangeWeek",
  year: "orders.rangeYear",
};

const PAGE_SIZES = [25, 50, 100] as const;

export const OrdersView = ({
  locale,
  messages,
  products,
  seed,
  summaries,
}: OrdersViewProperties) => {
  const [query, setQuery] = useState(seed.q);
  const [filter, setFilter] = useState<OrderFilter>(seed.filter);
  /*
   * `preset` used to live here beside the bounds. It is gone: it was the second
   * half of one value and it lied — see `presetOf` in ../types.
   */
  const [rangeOpen, setRangeOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<MemberOrderSummary | null>(null);
  const [editing, setEditing] = useState<MemberOrderSummary | null>(null);

  // Everything with an order in the active date range, before the tab and the
  // search box narrow it further.
  const inRange = useMemo(
    () =>
      summaries.filter((summary) =>
        isWithinRange(summary.latestOrderAt, from, to)
      ),
    [from, summaries, to]
  );

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

  /** Whether the list is narrowed in time at all — what tints the trigger. */
  const isRanged = from.length > 0 || to.length > 0;

  /** Which preset the live range *is*, not which one was last pressed. */
  const activePreset = useMemo(() => presetOf(from, to), [from, to]);

  /**
   * What the trigger and the popover's footer both say.
   *
   * The whole safety case for collapsing the date filter behind one control
   * rests on this string, so the trigger never degrades to a bare icon at any
   * width: a collapsed filter that does not say what it is filtering to is a
   * list quietly hiding rows.
   */
  const rangeText = useMemo(() => {
    if (activePreset !== "custom") {
      return messages[PRESET_LABEL[activePreset]];
    }

    // An open-ended bound is punctuation, not copy — it needs no key.
    const start = from.length > 0 ? formatDayShort(from, locale) : "…";
    const end = to.length > 0 ? formatDayShort(to, locale) : "…";

    return `${start} – ${end}`;
  }, [activePreset, from, locale, messages, to]);

  const applyPreset = (next: DatePreset) => {
    // A preset is the whole interaction, so one tap picks it and dismisses.
    setRangeOpen(false);

    // Re-picking what is already chosen costs nothing — see `changeFilter`.
    if (next === activePreset) {
      return;
    }

    const range = rangeForPreset(next);

    setFrom(range.from);
    setTo(range.to);
    setPage(0);
  };

  /**
   * Typing a bound by hand **is** the custom range. It no longer writes a preset
   * alongside the bound, because there is no longer a preset to write: `presetOf`
   * simply stops matching any of them and no row is checked.
   */
  const editBound = (which: "from" | "to", value: string) => {
    setPage(0);

    if (which === "from") {
      setFrom(value);
    } else {
      setTo(value);
    }
  };

  const clearRange = () => {
    setFrom("");
    setTo("");
    setPage(0);
  };

  const changeFilter = (next: OrderFilter) => {
    /*
     * A second tap on the tab already showing must cost nothing. It used to run
     * `setPage(0)` unconditionally, so an operator on page 3 of a long debtor
     * list who fat-fingered the tab they were already on lost their place with
     * nothing to say why.
     */
    if (next === filter) {
      return;
    }

    setFilter(next);
    setPage(0);
  };

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      {/*
       * One rail, answering the screen's questions left to right: which orders,
       * who, when, then act.
       *
       * The period used to be a second full-width row — five buttons and two
       * date boxes — whose "Barchasi" sat directly under the status row's
       * "Barchasi", the same word in the same paint meaning two different
       * things. It is now a single trigger that writes the period it is
       * enforcing on its own face, so collapsing it never hides that the list
       * is narrowed.
       *
       * Nothing here is `variant="default"` except the one control that
       * navigates. Solid green means "something happens when you press this";
       * SELECTED_TINT means "this is currently true". Five solid greens on one
       * screen left the eye no way to find the one that did something.
       */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Which orders. The screen's primary question — it never collapses. */}
        <div
          aria-label={messages["orders.filterLabel"]}
          className="flex w-full items-center gap-1 rounded-lg bg-muted p-0.5 sm:w-auto"
          role="radiogroup"
        >
          {FILTERS.map((option) => {
            const active = filter === option.key;

            return (
              <Button
                aria-checked={active}
                className={cn(
                  "flex-1 gap-2 sm:flex-none",
                  active ? SELECTED_TINT : "text-muted-foreground"
                )}
                key={option.key}
                onClick={() => changeFilter(option.key)}
                role="radio"
                size="sm"
                type="button"
                variant={active ? "outline" : "ghost"}
              >
                {/*
                 * The label alone. Each tab used to carry a count in a pill,
                 * which put three numbers in the toolbar that nobody acts on —
                 * the list below is the answer, and its own pager already says
                 * how many rows are in it.
                 */}
                {messages[option.labelKey]}
              </Button>
            );
          })}
        </div>

        {/* Who. The elastic member: it takes the slack and gives it back, so the
            action lands against a control instead of across an `ml-auto` void. */}
        <div className="w-full sm:min-w-44 sm:flex-1 sm:basis-56">
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
            {query.length > 0 ? (
              <InputGroupAddon align="inline-end">
                {/* Under the usual target floor on purpose: it lives inside the
                    field it clears. Emptying that box used to mean holding
                    backspace through a twelve-digit phone number, once per
                    customer, all shift. */}
                <InputGroupButton
                  aria-label={messages["orders.clearSearch"]}
                  onClick={() => {
                    setQuery("");
                    setPage(0);
                  }}
                  size="icon-sm"
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </div>

        {/* When. Five buttons and two fields, folded into one control that
            states its own answer. */}
        <Popover onOpenChange={setRangeOpen} open={rangeOpen}>
          <PopoverTrigger asChild>
            <Button
              /*
               * The visible text is contained in the accessible name (WCAG
               * 2.5.3) and the subject rides along with it. A bare "Davr" would
               * tell a screen reader the question and never the answer — which
               * is the one thing collapsing this control had to preserve.
               */
              aria-label={`${messages["orders.rangeLabel"]}: ${rangeText}`}
              className={cn(
                "flex-1 gap-2 font-normal sm:flex-none",
                isRanged && SELECTED_TINT
              )}
              type="button"
              variant="outline"
            >
              <CalendarIcon className="size-5 shrink-0" />
              <span className="max-w-40 truncate sm:max-w-56">{rangeText}</span>
              <ChevronDownIcon className="size-4 shrink-0 opacity-70" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0"
            onInteractOutside={(event) => {
              /*
               * Each DateField below opens its own popover, portalled to the
               * body — so a tap on a calendar day is dispatched *outside* this
               * panel and would close the range out from under the operator's
               * finger mid-pick.
               *
               * Radix dispatches this on the real clicked node and hands it over
               * in `detail.originalEvent`; read it from there rather than from
               * `event.target`, which is whichever node Radix chose to dispatch
               * from. This panel is a `[data-slot=popover-content]` itself, but
               * the event only fires for interactions *outside* it — so a match
               * can only ever be a nested popover, never this one.
               */
              const target = event.detail.originalEvent
                .target as HTMLElement | null;

              if (target?.closest?.("[data-slot=popover-content]")) {
                event.preventDefault();
              }
            }}
          >
            <div
              aria-label={messages["orders.rangeLabel"]}
              className="flex flex-col gap-1 p-2"
              role="radiogroup"
            >
              {DATE_PRESETS.map((option) => {
                const active = activePreset === option;

                return (
                  <Button
                    aria-checked={active}
                    className={cn(
                      "h-11 w-full justify-between px-3",
                      active ? SELECTED_TINT : "text-muted-foreground"
                    )}
                    key={option}
                    onClick={() => applyPreset(option)}
                    role="radio"
                    size="sm"
                    type="button"
                    variant={active ? "outline" : "ghost"}
                  >
                    {messages[PRESET_LABEL[option]]}
                    {/* A second signal for the chosen row: on a cheap panel
                        viewed off-axis the wash alone is a weak tell. */}
                    {active ? <CheckIcon className="size-4" /> : null}
                  </Button>
                );
              })}
            </div>

            <Separator />

            {/*
             * The two bounds are not a second, independent way of asking the
             * question — they are the same value written by hand, which is why
             * they live in the panel the presets live in rather than on a row of
             * their own. Picking a preset fills these in front of the operator;
             * typing in one simply stops any preset from matching. There is
             * nothing left for them to disagree about.
             *
             * Two DateFields rather than a range calendar: `calendar.tsx` fixes
             * its day cells at 32px, and a range wants two precise hits on
             * those. These are full-width targets that open the ordinary
             * one-day picker the desk already knows from six other screens.
             */}
            <div className="flex flex-col gap-2 p-2">
              <p className="px-1 font-medium text-caption text-muted-foreground">
                {messages["orders.rangeCustom"]}
              </p>
              <DateField
                aria-label={messages["orders.rangeStart"]}
                onChange={(next) => editBound("from", next)}
                placeholder={messages["orders.rangeStart"]}
                value={from}
              />
              <DateField
                aria-label={messages["orders.rangeEnd"]}
                onChange={(next) => editBound("to", next)}
                placeholder={messages["orders.rangeEnd"]}
                value={to}
              />
            </div>

            <Separator />

            {/* The echo. After the first of two bounds the list has already
                refiltered, no preset is checked, and the trigger that carried
                the answer is covered by this panel — so the panel says it in
                words. "Tayyor" is also the only exit that is not Escape, which
                a terminal with no keyboard needs for an open-ended range. */}
            <div className="flex items-center justify-between gap-2 p-2">
              <span className="min-w-0 truncate px-1 text-caption text-muted-foreground">
                {rangeText}
              </span>
              <Button
                onClick={() => setRangeOpen(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {messages["orders.rangeDone"]}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Act. A rule separates it from the filters — `ml-auto` only ever made
            it look dropped off the end of the row. */}
        <Separator className="hidden h-8 lg:block" orientation="vertical" />

        <Button asChild className="flex-1 sm:flex-none">
          <Link to="/orders/new">
            <PlusIcon className="size-5" />
            {messages["orders.newOrder"]}
          </Link>
        </Button>
      </div>

      {pageRows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border py-16 text-center">
          <p className="text-muted-foreground">
            {summaries.length === 0
              ? messages["orders.empty"]
              : messages["orders.noResults"]}
          </p>
          {/*
           * The one real danger of collapsing a filter: a period gets tapped by
           * accident, the list empties, and the only trace of the cause is a
           * tinted button the operator has to already know to look at. Note that
           * `isWithinRange` hides every debtor with no order date the moment any
           * bound is set, so a stray tap on "Bugun" can empty this screen
           * outright.
           *
           * The escape sits here rather than as an ✕ welded to the trigger: a
           * destructive control appearing flush against the edge the finger was
           * just aiming at is a wipe waiting to happen. Here it is surrounded by
           * whitespace and exists only when it is the answer.
           */}
          {isRanged ? (
            <Button
              onClick={clearRange}
              size="sm"
              type="button"
              variant="outline"
            >
              <XIcon className="size-4" />
              {messages["orders.rangeClear"]}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {pageRows.map((summary) => {
            const owes = hasDebt(summary.remaining);
            const isWorker = summary.userType === "worker";

            return (
              <li
                className={cn(
                  "flex items-center gap-4 rounded-xl border border-l-4 px-4 py-3",
                  // The left edge alone says who is buying — the right edge is
                  // the card's own rule and stays that way.
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
                    // The minus carries the meaning, not the colour: a wall of red
                    // figures is the ordinary state of this screen — it lists
                    // debtors — so red stopped marking anything out and only made
                    // the number harder to read.
                    <span className="font-semibold text-lg tabular-nums">
                      −{formatMoney(summary.remaining)}
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
        {/* These three carried `role="radio"` with no group ancestor at all,
            which is invalid ARIA — three loose radios announced as belonging to
            nothing. And a solid green page size below a toolbar that has just
            reserved solid green for actions would undo the whole point. */}
        <div
          aria-label={messages["orders.rows"]}
          className="flex items-center gap-2"
          role="radiogroup"
        >
          <span className="text-muted-foreground text-sm">
            {messages["orders.rows"]}
          </span>
          {PAGE_SIZES.map((size) => (
            <Button
              aria-checked={pageSize === size}
              className={cn(
                pageSize === size ? SELECTED_TINT : "text-muted-foreground"
              )}
              key={size}
              onClick={() => {
                setPageSize(size);
                setPage(0);
              }}
              role="radio"
              size="sm"
              type="button"
              variant={pageSize === size ? "outline" : "ghost"}
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
