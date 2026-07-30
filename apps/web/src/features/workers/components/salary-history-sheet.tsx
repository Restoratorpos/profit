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
import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon } from "lucide-react";
import { useState } from "react";
import { DateField } from "@/components/date-field";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import { useSalaryHistory } from "../api";
import {
  ALL_WORKERS,
  DEFAULT_SALARY_HISTORY_QUERY,
  formatMonth,
  formatStamp,
  RANGE_LABEL,
  RANGE_PRESETS,
  type RangePreset,
  rangeForPreset,
  type SalaryHistoryQuery,
  salaryMethodLabelKey,
} from "../types";

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
  const [preset, setPreset] = useState<RangePreset>("this-month");
  const [custom, setCustom] = useState(() => rangeForPreset("this-month"));
  const [query, setQuery] = useState<SalaryHistoryQuery>(
    DEFAULT_SALARY_HISTORY_QUERY
  );

  const bounds = preset === "custom" ? custom : rangeForPreset(preset);

  // Gated on `open`: this reads the whole gym's payroll, and a staff page that
  // never opens the drawer should not pay for it.
  const { data, isPending } = useSalaryHistory(query, bounds, open);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / query.pageSize));

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

  const workerName = (row: (typeof rows)[number]) =>
    row.workerName ?? row.workerId ?? "—";

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-3xl"
        side="right"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="size-5" />
            {messages["workers.history"]}
          </SheetTitle>
          <SheetDescription>{messages["workers.historyDesc"]}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <Select onValueChange={pickWorker} value={query.workerId}>
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
                {(data?.options ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) => pickPreset(value as RangePreset)}
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

          {/* Only "Boshqa" needs bounds, so the two date fields appear under
              the row that asked for them rather than holding space always. */}
          {preset === "custom" ? (
            <div className="flex w-full flex-wrap items-center gap-2">
              <DateField
                aria-label={messages["workers.rangeLabel"]}
                className="w-full sm:w-44"
                onChange={(next) => pickCustom({ from: next, to: custom.to })}
                value={custom.from}
              />
              <span className="hidden text-muted-foreground sm:inline">—</span>
              <DateField
                aria-label={messages["workers.rangeLabel"]}
                className="w-full sm:w-44"
                onChange={(next) => pickCustom({ from: custom.from, to: next })}
                value={custom.to}
              />
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isPending ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : null}

          {isPending || rows.length > 0 ? null : (
            <Empty className="border py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HistoryIcon />
                </EmptyMedia>
                <EmptyTitle>{messages["workers.historyEmpty"]}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {rows.length > 0 ? (
            <div className="overflow-hidden rounded-xl border">
              <div className="overflow-x-auto">
                <Table>
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
                          {/* Null is a wage typed on the cashbox screen, which
                              settles no particular month. */}
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
                </Table>
              </div>
            </div>
          ) : null}
        </div>

        {/* The total is the backend's over the whole filter, not a sum of the
            page — a figure that changed as you paged would stop being trusted. */}
        <div className="flex flex-wrap items-center gap-3 border-t p-4">
          <span className="text-muted-foreground text-sm">
            {messages["workers.historyTotal"]}
          </span>
          <span className="font-semibold text-lg tabular-nums">
            {formatMoney(data?.totalAmount ?? "0")}
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
