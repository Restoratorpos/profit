import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon } from "lucide-react";
import { useState } from "react";
import { DateField } from "@/components/date-field";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { MessageKey, Messages } from "@/lib/i18n/dictionary";
import { useSalaryHistory, useWorkHistory } from "../api";
import {
  ALL_WORKERS,
  DEFAULT_SALARY_HISTORY_QUERY,
  formatDuration,
  formatMonth,
  formatStamp,
  HISTORY_TAB_LABEL,
  HISTORY_TABS,
  type HistoryTab,
  RANGE_LABEL,
  RANGE_PRESETS,
  type RangePreset,
  rangeForPreset,
  type SalaryHistoryQuery,
  type SalaryHistoryRow,
  salaryMethodLabelKey,
  type WorkHistoryRow,
} from "../types";

/** The name to print, or the id, or a dash — a row whose worker was deleted. */
const workerName = (row: {
  workerId: string | null;
  workerName: string | null;
}) => row.workerName ?? row.workerId ?? "—";

interface WorkerOption {
  id: string;
  name: string;
}

/**
 * One filter, so one list of names to filter by — the union of both sides.
 *
 * Each endpoint offers the staff *it* knows about: everyone ever paid, and
 * everyone who ever clocked in. Those are not the same people. Offering only the
 * active tab's list would blank the trigger the moment you switched to a tab the
 * chosen worker is absent from, which reads as "the filter reset itself" when it
 * did not — the query still carries them, and the table below is still theirs.
 */
const mergeWorkerOptions = (
  ...lists: (readonly WorkerOption[] | undefined)[]
): WorkerOption[] => {
  const byId = new Map<string, string>();

  for (const list of lists) {
    for (const option of list ?? []) {
      byId.set(option.id, option.name);
    }
  }

  return [...byId]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Every string that changes with the tab, in one table.
 *
 * As four `tab === "payments" ? … : …` ternaries scattered through the JSX,
 * adding a third view meant finding all four — and each one read as a local
 * decision rather than as the same decision made four times.
 */
const TAB_COPY: Record<
  HistoryTab,
  { desc: MessageKey; empty: MessageKey; title: MessageKey; total: MessageKey }
> = {
  payments: {
    desc: "workers.historyDesc",
    empty: "workers.historyEmpty",
    title: "workers.history",
    total: "workers.historyTotal",
  },
  shifts: {
    desc: "workers.shiftsDesc",
    empty: "workers.shiftsEmpty",
    title: "workers.shifts",
    total: "workers.shiftsTotal",
  },
};

/** The two halves of the drawer, as the control that swaps between them. */
const HistoryTabs = ({
  messages,
  onPick,
  tab,
}: {
  messages: Messages;
  onPick: (next: HistoryTab) => void;
  tab: HistoryTab;
}) => (
  /* The same segmented control the inventory screen uses — a muted track, the
     chosen half filled in the one green. Two buttons rather than a Tabs root
     because there is no panel to associate: both halves render into the same
     table frame below. */
  <div
    aria-label={messages["workers.history"]}
    className="mt-2 flex w-fit items-center gap-1 rounded-lg bg-muted p-1"
    role="tablist"
  >
    {HISTORY_TABS.map((option) => {
      const isActive = tab === option;

      return (
        <Button
          aria-selected={isActive}
          className={cn(!isActive && "text-muted-foreground")}
          key={option}
          onClick={() => onPick(option)}
          role="tab"
          size="sm"
          type="button"
          variant={isActive ? "default" : "ghost"}
        >
          {messages[HISTORY_TAB_LABEL[option]]}
        </Button>
      );
    })}
  </div>
);

/**
 * Who and when — the one set of filters both halves are read through.
 *
 * Lifted out of the drawer body so switching tabs visibly does not touch it:
 * the same component instance, the same state, above a table that changed.
 */
const HistoryFilters = ({
  custom,
  messages,
  onPickCustom,
  onPickPreset,
  onPickWorker,
  preset,
  workerId,
  workerOptions,
}: {
  custom: { from: string; to: string };
  messages: Messages;
  onPickCustom: (next: { from: string; to: string }) => void;
  onPickPreset: (next: RangePreset) => void;
  onPickWorker: (workerId: string) => void;
  preset: RangePreset;
  workerId: string;
  workerOptions: readonly WorkerOption[];
}) => (
  <div className="flex flex-wrap items-center gap-2 border-b p-4">
    <Select onValueChange={onPickWorker} value={workerId}>
      <SelectTrigger
        aria-label={messages["workers.colName"]}
        className="w-full sm:w-56"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={ALL_WORKERS}>
            {messages["workers.historyAll"]}
          </SelectItem>
          {workerOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>

    <Select
      onValueChange={(value) => onPickPreset(value as RangePreset)}
      value={preset}
    >
      <SelectTrigger
        aria-label={messages["workers.rangeLabel"]}
        className="w-full sm:w-44"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {RANGE_PRESETS.map((option) => (
            <SelectItem key={option} value={option}>
              {messages[RANGE_LABEL[option]]}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>

    {/* Only "Boshqa" needs bounds, so the two date fields appear under the row
        that asked for them rather than holding space always. */}
    {preset === "custom" ? (
      <div className="flex w-full flex-wrap items-center gap-2">
        <DateField
          aria-label={messages["workers.rangeLabel"]}
          className="w-full sm:w-44"
          onChange={(next) => onPickCustom({ from: next, to: custom.to })}
          value={custom.from}
        />
        <span className="hidden text-muted-foreground sm:inline">—</span>
        <DateField
          aria-label={messages["workers.rangeLabel"]}
          className="w-full sm:w-44"
          onChange={(next) => onPickCustom({ from: custom.from, to: next })}
          value={custom.to}
        />
      </div>
    ) : null}
  </div>
);

/** The shared frame both tables sit in: rounded, bordered, scrolls sideways. */
const TableFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-hidden rounded-xl border">
    <div className="overflow-x-auto">
      <Table>{children}</Table>
    </div>
  </div>
);

const PaymentsTable = ({
  locale,
  messages,
  rows,
}: {
  locale: Locale;
  messages: Messages;
  rows: readonly SalaryHistoryRow[];
}) => (
  <TableFrame>
    <TableHeader>
      <TableRow>
        <TableHead>{messages["workers.colName"]}</TableHead>
        <TableHead>{messages["workers.colPaidAt"]}</TableHead>
        <TableHead>{messages["workers.payPeriod"]}</TableHead>
        <TableHead>{messages["workers.payMethod"]}</TableHead>
        <TableHead className="text-right">
          {messages["workers.payAmount"]}
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row) => (
        <TableRow key={row.id}>
          <TableCell>
            <span className="font-medium">{workerName(row)}</span>
            {row.note ? (
              <span className="block text-muted-foreground text-xs">
                {row.note}
              </span>
            ) : null}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {formatStamp(row.paidAt, locale)}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {/* Null is a wage typed on the cashbox screen, which settles no
                particular month. */}
            {row.period ? formatMonth(row.period, locale) : "—"}
          </TableCell>
          <TableCell>
            <Badge variant="secondary">
              {messages[salaryMethodLabelKey(row.method)]}
            </Badge>
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatMoney(row.amount)}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </TableFrame>
);

const ShiftsTable = ({
  locale,
  messages,
  rows,
}: {
  locale: Locale;
  messages: Messages;
  rows: readonly WorkHistoryRow[];
}) => (
  <TableFrame>
    <TableHeader>
      <TableRow>
        <TableHead>{messages["workers.colName"]}</TableHead>
        <TableHead>{messages["workers.colCheckIn"]}</TableHead>
        <TableHead>{messages["workers.colCheckOut"]}</TableHead>
        <TableHead className="text-right">
          {messages["workers.colDuration"]}
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row) => (
        <TableRow key={row.id}>
          <TableCell>
            <span className="font-medium">{workerName(row)}</span>
          </TableCell>
          <TableCell className="text-muted-foreground">
            {formatStamp(row.checkIn, locale)}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {/* An open shift has no check-out yet. Saying so beats an em dash,
                which reads as "the tap was missed" — the opposite problem, and
                the one the desk would otherwise go and correct by hand. */}
            {row.open ? (
              <Badge variant="secondary">{messages["workers.shiftOpen"]}</Badge>
            ) : (
              formatStamp(row.checkOut, locale)
            )}
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatDuration(row.minutesWorked, locale)}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </TableFrame>
);

interface SalaryHistorySheetProperties {
  locale: Locale;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * Every wage the gym has handed over, across all staff.
 *
 * The staff table answers "what is this worker owed"; this answers "where did
 * the salary money go", which is the question that gets asked with a bookkeeper
 * on the phone and cannot be assembled by opening twenty workers one at a time.
 *
 * ## Its period is its own
 *
 * The drawer does not inherit the staff table's range. That range is in the URL
 * and changing it is a navigation — reusing it here would mean answering a
 * question about last quarter reshuffled the table you were working in, and
 * closing the drawer would leave you somewhere you did not ask to be. So this
 * keeps local state, opens on the current month, and leaves the page alone.
 */
export const SalaryHistorySheet = ({
  locale,
  messages,
  onOpenChange,
  open,
}: SalaryHistorySheetProperties) => {
  const [tab, setTab] = useState<HistoryTab>("payments");
  const [preset, setPreset] = useState<RangePreset>("this-month");
  const [custom, setCustom] = useState(() => rangeForPreset("this-month"));
  const [query, setQuery] = useState<SalaryHistoryQuery>(
    DEFAULT_SALARY_HISTORY_QUERY
  );

  const bounds = preset === "custom" ? custom : rangeForPreset(preset);

  // Both gated on `open` AND on the tab: each reads the whole gym, and the tab
  // nobody is looking at should not be kept warm. A staff page that never opens
  // the drawer pays for neither.
  const payments = useSalaryHistory(query, bounds, open && tab === "payments");
  const shifts = useWorkHistory(query, bounds, open && tab === "shifts");

  const active = tab === "payments" ? payments : shifts;
  const isPending = active.isPending;
  const copy = TAB_COPY[tab];

  const paymentRows = payments.data?.rows ?? [];
  const shiftRows = shifts.data?.rows ?? [];

  const total = active.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / query.pageSize));

  const workerOptions = mergeWorkerOptions(
    payments.data?.options,
    shifts.data?.options
  );

  /*
   * Every filter change returns to page 1. Narrowing while on page 4 of a wider
   * result set lands on a page that no longer exists, and an empty table reads
   * as "nobody was paid" rather than "you are past the end".
   */
  const pickWorker = (workerId: string) =>
    setQuery((current) => ({ ...current, page: 1, workerId }));

  const pickPreset = (next: RangePreset) => {
    // Carry the window already on screen into the date fields, so choosing
    // "Boshqa" starts from what you were looking at rather than from empty.
    if (next === "custom") {
      setCustom(bounds);
    }

    setPreset(next);
    setQuery((current) => ({ ...current, page: 1 }));
  };

  const pickCustom = (next: { from: string; to: string }) => {
    setCustom(next);
    setQuery((current) => ({ ...current, page: 1 }));
  };

  /*
   * Switching tabs keeps the worker and the period — that is the whole point of
   * the two living in one drawer — but returns to page 1. Page 4 of the wages
   * has nothing to do with page 4 of the shifts.
   */
  const pickTab = (next: HistoryTab) => {
    setTab(next);
    setQuery((current) => ({ ...current, page: 1 }));
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-3xl"
        side="right"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="size-5" />
            {messages[copy.title]}
          </SheetTitle>
          <SheetDescription>{messages[copy.desc]}</SheetDescription>

          <HistoryTabs messages={messages} onPick={pickTab} tab={tab} />
        </SheetHeader>

        <HistoryFilters
          custom={custom}
          messages={messages}
          onPickCustom={pickCustom}
          onPickPreset={pickPreset}
          onPickWorker={pickWorker}
          preset={preset}
          workerId={query.workerId}
          workerOptions={workerOptions}
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isPending ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : null}

          {isPending || total > 0 ? null : (
            <Empty className="border py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HistoryIcon />
                </EmptyMedia>
                <EmptyTitle>{messages[copy.empty]}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {tab === "shifts" && shiftRows.length > 0 ? (
            <ShiftsTable locale={locale} messages={messages} rows={shiftRows} />
          ) : null}

          {tab === "payments" && paymentRows.length > 0 ? (
            <PaymentsTable
              locale={locale}
              messages={messages}
              rows={paymentRows}
            />
          ) : null}
        </div>

        {/* The total is the backend's over the whole filter, not a sum of the
            page — a figure that changed as you paged would stop being trusted. */}
        <div className="flex flex-wrap items-center gap-3 border-t p-4">
          <span className="text-muted-foreground text-sm">
            {messages[copy.total]}
          </span>
          <span className="font-semibold text-lg tabular-nums">
            {tab === "payments"
              ? formatMoney(payments.data?.totalAmount ?? "0")
              : formatDuration(shifts.data?.totalMinutes ?? 0, locale)}
          </span>
          <span className="text-muted-foreground text-sm tabular-nums">
            ({total})
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Button
              aria-label={messages["common.prevPage"]}
              disabled={query.page <= 1}
              onClick={() =>
                setQuery((current) => ({
                  ...current,
                  page: Math.max(1, current.page - 1),
                }))
              }
              size="icon-sm"
              variant="outline"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <span className="text-sm tabular-nums">
              {query.page} / {lastPage}
            </span>
            <Button
              aria-label={messages["common.nextPage"]}
              disabled={query.page >= lastPage}
              onClick={() =>
                setQuery((current) => ({
                  ...current,
                  page: Math.min(lastPage, current.page + 1),
                }))
              }
              size="icon-sm"
              variant="outline"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
