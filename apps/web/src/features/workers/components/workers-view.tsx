import { formatPhone } from "@repo/auth/lib/countries";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HistoryIcon,
  LogInIcon,
  LogOutIcon,
  MoreVerticalIcon,
  PencilIcon,
  SearchIcon,
  UserPlusIcon,
  UserRoundIcon,
  WalletIcon,
} from "lucide-react";
import { useState } from "react";
import { DateField } from "@/components/date-field";
import { PAGE_SIZES } from "@/components/use-pagination";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { usePayday, useSetWorkerActive, useWorkersPage } from "../api";
import {
  DEFAULT_WORKER_QUERY,
  formatHours,
  monthOfDate,
  positionLabelKey,
  RANGE_LABEL,
  RANGE_PRESETS,
  type RangePreset,
  type WorkerFilter,
  type WorkerListItem,
  type WorkerPage,
  type WorkerQuery,
} from "../types";
import { CheckInDialog } from "./check-in-dialog";
import { PayWorkerDialog } from "./pay-worker-dialog";
import { PaydayDialog } from "./payday-dialog";
import { SalaryHistorySheet } from "./salary-history-sheet";
import { WorkerDetailSheet } from "./worker-detail-sheet";
import { WorkerSheet } from "./worker-sheet";

const STATUS_FILTERS: readonly {
  key: WorkerFilter;
  labelKey: keyof Messages;
}[] = [
  { key: "active", labelKey: "workers.filterActive" },
  { key: "on-shift", labelKey: "workers.filterOnShift" },
  { key: "inactive", labelKey: "workers.filterInactive" },
  { key: "all", labelKey: "workers.filterAll" },
];

/**
 * A money figure, or a dash when there is nothing to state — which covers both
 * "not known" (a monthly salary's earnings) and "nothing yet" (never paid). A
 * zero would read as a real, settled figure in either case.
 */
const MoneyCell = ({
  strong,
  value,
}: {
  strong?: boolean;
  value: string | null;
}) => (
  <TableCell
    className={
      strong
        ? "text-right font-semibold tabular-nums"
        : "text-right tabular-nums"
    }
  >
    {value === null || Number(value) === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      formatMoney(value)
    )}
  </TableCell>
);

interface WorkersViewProperties {
  from: string;
  /** The first page, fetched by the server component so nothing flashes. */
  initial: WorkerPage;
  locale: Locale;
  messages: Messages;
  preset: RangePreset;
  to: string;
}

export const WorkersView = ({
  from,
  initial,
  locale,
  messages,
  preset,
  to,
}: WorkersViewProperties) => {
  const navigate = useNavigate();

  const [request, setRequest] = useState<WorkerQuery>(DEFAULT_WORKER_QUERY);
  const [editing, setEditing] = useState<WorkerListItem | null>(null);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [detail, setDetail] = useState<WorkerListItem | null>(null);
  const [check, setCheck] = useState<{
    mode: "in" | "out";
    worker: WorkerListItem;
  } | null>(null);
  const [paying, setPaying] = useState<WorkerListItem | null>(null);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [isPaydayOpen, setPaydayOpen] = useState(false);

  const payday = usePayday();

  const setWorkerActive = useSetWorkerActive();

  // `variables` is the argument of the in-flight call — exactly the row to spin.
  const togglingId = setWorkerActive.isPending
    ? setWorkerActive.variables.workerId
    : null;

  /*
   * `request` moves per keystroke so the inputs stay responsive; `debounced`
   * lags behind and is what the query is keyed by, because each change is a
   * server round trip. The date range is not debounced — it changes by button,
   * not by typing — but it is part of the key, so a range change refetches.
   *
   * The `cancelled` flag the old effect carried is gone: a slow reply for a
   * stale query belongs to a different cache key and cannot land here.
   */
  const workersPage = useWorkersPage(useDebouncedValue(request), { from, to });
  const isNavigating = workersPage.isFetching;
  const page = workersPage.data ?? initial;

  /** Any change but the page itself returns to page one. */
  const narrow = (patch: Partial<WorkerQuery>) => {
    setRequest((current) => ({ ...current, ...patch, page: 1 }));
  };

  const counts = page.counts;

  const lastPage = Math.max(1, Math.ceil(page.total / request.pageSize));

  const pushRange = (
    next: RangePreset,
    rangeBounds?: { from: string; to: string }
  ) => {
    /*
     * The range lives in the URL so it survives a reload and can be shared —
     * "show me last month's hours" is a link. Typed search params rather than a
     * hand-built query string: the route validates them, so a bad `range=` is
     * caught at the boundary instead of silently falling back deep in a render.
     */
    navigate({
      to: "/workers",
      search:
        next === "custom" && rangeBounds
          ? { range: next, from: rangeBounds.from, to: rangeBounds.to }
          : { range: next },
    });
  };

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (worker: WorkerListItem) => {
    setEditing(worker);
    setSheetOpen(true);
  };

  const handleToggleActive = (worker: WorkerListItem) => {
    setWorkerActive.mutate({ isActive: !worker.isActive, workerId: worker.id });
  };

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* The sidebar already says which page this is, so the heading only has
            to exist for a screen reader. */}
        <h1 className="sr-only">{messages["workers.title"]}</h1>

        {/* The range leads the row. It drives the hours, earnings and payment
            columns, so it decides what every figure in the table means — and
            changing it is a navigation, hence disabled while the new range is
            on its way so a second pick cannot race the first. */}
        <Select
          disabled={isNavigating}
          onValueChange={(value) =>
            pushRange(value as RangePreset, { from, to })
          }
          value={preset}
        >
          <SelectTrigger
            aria-label={messages["workers.rangeLabel"]}
            className="w-44"
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

        <div className="w-96 max-w-full">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-5" />
            </InputGroupAddon>
            <InputGroupInput
              onChange={(event) => narrow({ query: event.target.value })}
              placeholder={messages["workers.search"]}
              value={request.query}
            />
          </InputGroup>
        </div>

        {/* Which slice of the staff is showing. */}
        <Select
          onValueChange={(value) => narrow({ status: value as WorkerFilter })}
          value={request.status}
        >
          <SelectTrigger
            aria-label={messages["workers.title"]}
            className="w-44"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {STATUS_FILTERS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {messages[option.labelKey]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-3">
          {/* Carries its current value, because the setting is the answer —
              opening a dialog to find out which day it is would be a round
              trip for something that fits in the button. */}
          <Button onClick={() => setPaydayOpen(true)} variant="outline">
            <CalendarDaysIcon className="size-5" />
            {messages["workers.payday"]}
            <span className="font-semibold tabular-nums">
              {payday.data?.payday ?? "—"}
            </span>
          </Button>

          {/* Whole-gym payroll, so it sits beside the list rather than on a
              row: it is not about any one worker. */}
          <Button
            aria-label={messages["workers.history"]}
            onClick={() => setHistoryOpen(true)}
            size="icon"
            title={messages["workers.history"]}
            variant="outline"
          >
            <HistoryIcon className="size-5" />
          </Button>
          <Button
            aria-label={messages["workers.add"]}
            onClick={openCreate}
            size="icon"
            title={messages["workers.add"]}
          >
            <UserPlusIcon className="size-5" />
          </Button>
        </div>
      </div>

      {/* Only "Boshqa" needs bounds, so the two date fields appear under the
          row that asked for them rather than holding space all the time. */}
      {preset === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <DateField
            aria-label={messages["workers.rangeLabel"]}
            className="w-full sm:w-44"
            onChange={(next) => pushRange("custom", { from: next, to })}
            value={from}
          />
          <span className="hidden text-muted-foreground sm:inline">—</span>
          <DateField
            aria-label={messages["workers.rangeLabel"]}
            className="w-full sm:w-44"
            onChange={(next) => pushRange("custom", { from, to: next })}
            value={to}
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{messages["workers.colName"]}</TableHead>
                <TableHead>{messages["workers.colPosition"]}</TableHead>
                <TableHead>{messages["workers.colPhone"]}</TableHead>
                <TableHead className="text-right">
                  {messages["workers.colSalary"]}
                </TableHead>
                <TableHead className="text-right">
                  {messages["workers.colHours"]}
                </TableHead>
                <TableHead className="text-right">
                  {messages["workers.colEarned"]}
                </TableHead>
                <TableHead className="text-right">
                  {messages["workers.colPaid"]}
                </TableHead>
                <TableHead className="text-right">
                  {messages["workers.colBalance"]}
                </TableHead>
                <TableHead className="text-right">
                  {messages["workers.colActions"]}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={9}
                  >
                    {counts.all === 0
                      ? messages["workers.empty"]
                      : messages["workers.noResults"]}
                  </TableCell>
                </TableRow>
              ) : (
                page.rows.map((worker) => (
                  <TableRow key={worker.id}>
                    <TableCell>
                      <Button
                        className="h-auto justify-start gap-2 p-0 text-left font-medium hover:underline"
                        onClick={() => setDetail(worker)}
                        type="button"
                        variant="link"
                      >
                        {worker.onShiftNow ? (
                          <span
                            aria-label={messages["workers.onShift"]}
                            className="size-2 shrink-0 rounded-full bg-primary"
                            role="img"
                          />
                        ) : null}
                        {worker.name}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {messages[positionLabelKey(worker.role)]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {worker.phone ? formatPhone(worker.phone) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-medium">
                        {formatMoney(worker.salaryAmount)}
                      </span>
                      {worker.salaryType === "hourly" ? (
                        <span className="text-muted-foreground text-xs">
                          {" "}
                          / {messages["workers.perHour"]}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatHours(worker.minutesWorked)}
                    </TableCell>
                    <MoneyCell value={worker.earned} />
                    <MoneyCell value={worker.paid} />
                    <MoneyCell strong value={worker.balance} />
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {worker.onShiftNow ? (
                          <Button
                            onClick={() => setCheck({ worker, mode: "out" })}
                            size="sm"
                            variant="outline"
                          >
                            <LogOutIcon className="size-4" />
                            {messages["workers.checkOut"]}
                          </Button>
                        ) : (
                          <Button
                            aria-label={messages["workers.checkIn"]}
                            disabled={!worker.isActive}
                            onClick={() => setCheck({ worker, mode: "in" })}
                            size="icon-sm"
                            title={messages["workers.checkIn"]}
                            variant="outline"
                          >
                            <LogInIcon className="size-4" />
                          </Button>
                        )}

                        {/* Writes an `expenses` row against this worker —
                            already what the "Berilgan" column counts. */}
                        <Button
                          aria-label={messages["workers.pay"]}
                          onClick={() => setPaying(worker)}
                          size="icon-sm"
                          title={messages["workers.pay"]}
                        >
                          <WalletIcon className="size-4" />
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label={messages["workers.colActions"]}
                              className="text-muted-foreground"
                              disabled={togglingId === worker.id}
                              size="icon"
                              variant="ghost"
                            >
                              <MoreVerticalIcon className="size-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onSelect={() => setDetail(worker)}
                              >
                                <UserRoundIcon />
                                {messages["workers.recentAttendance"]}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => openEdit(worker)}
                              >
                                <PencilIcon />
                                {messages["common.edit"]}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => handleToggleActive(worker)}
                              >
                                {worker.isActive
                                  ? messages["workers.deactivate"]
                                  : messages["workers.activate"]}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              {messages["common.rows"]}:
            </span>
            {PAGE_SIZES.map((size) => (
              <Button
                aria-pressed={request.pageSize === size}
                className={
                  request.pageSize === size
                    ? undefined
                    : "text-muted-foreground"
                }
                key={size}
                onClick={() => narrow({ pageSize: size })}
                size="sm"
                variant={request.pageSize === size ? "default" : "ghost"}
              >
                {size}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              aria-label={messages["common.prevPage"]}
              disabled={request.page <= 1}
              onClick={() =>
                setRequest((current) => ({
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
              {request.page} / {lastPage}
            </span>
            <Button
              aria-label={messages["common.nextPage"]}
              disabled={request.page >= lastPage}
              onClick={() =>
                setRequest((current) => ({
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
      </div>

      <WorkerSheet
        key={editing?.id ?? "new"}
        messages={messages}
        onOpenChange={setSheetOpen}
        open={isSheetOpen}
        worker={editing}
      />

      <WorkerDetailSheet
        from={from}
        key={detail?.id ?? "none"}
        locale={locale}
        messages={messages}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
          }
        }}
        summary={detail}
        to={to}
      />

      {/* Keyed by worker, so the month and the amount box start clean for the
          next person rather than carrying the last one's over. */}
      {paying ? (
        <PayWorkerDialog
          /* The month the range *ends* in, not the one it starts in. Under
             "Butun davr" the start is 1 January and settling a wage against
             January by default would be wrong every month but one; the end is
             today, which is the month a payment handed over now belongs to.
             It also quietly fixes "Oxirgi 30 kun", which used to default to
             last month whenever the window crossed a month boundary. */
          defaultPeriod={monthOfDate(to)}
          key={paying.id}
          locale={locale}
          messages={messages}
          onOpenChange={(open) => {
            if (!open) {
              setPaying(null);
            }
          }}
          /* No onPaid refetch: the pay mutation invalidates the worker queries
             itself, so the earned/paid/balance columns catch up on their own.
             The rows are no longer held in state to go stale. */
          worker={paying}
        />
      ) : null}

      {check ? (
        <CheckInDialog
          locale={locale}
          messages={messages}
          mode={check.mode}
          onOpenChange={(open) => {
            if (!open) {
              setCheck(null);
            }
          }}
          worker={check.worker}
        />
      ) : null}

      {/* Kept mounted rather than conditional: its own filters are worth
          keeping across a close and reopen, and the query is gated on `open`
          so a closed drawer costs nothing. */}
      <SalaryHistorySheet
        locale={locale}
        messages={messages}
        onOpenChange={setHistoryOpen}
        open={isHistoryOpen}
      />

      <PaydayDialog
        messages={messages}
        onOpenChange={setPaydayOpen}
        open={isPaydayOpen}
      />
    </div>
  );
};
