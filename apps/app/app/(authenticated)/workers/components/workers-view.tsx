"use client";

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
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LogInIcon,
  LogOutIcon,
  MoreVerticalIcon,
  PencilIcon,
  SearchIcon,
  UserPlusIcon,
  UserRoundIcon,
  WalletIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { formatMoney } from "@/lib/catalog";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  DEFAULT_WORKER_QUERY,
  formatHours,
  monthOfDate,
  positionLabelKey,
  RANGE_PRESETS,
  type RangePreset,
  type WorkerFilter,
  type WorkerListItem,
  type WorkerPage,
  type WorkerQuery,
} from "@/lib/workers";
import { PAGE_SIZES } from "../../components/use-pagination";
import { loadWorkersAction, setWorkerActiveAction } from "../actions";
import { CheckInDialog } from "./check-in-dialog";
import { PayWorkerDialog } from "./pay-worker-dialog";
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

const RANGE_LABEL: Record<RangePreset, keyof Messages> = {
  "this-month": "workers.rangeThisMonth",
  "last-month": "workers.rangeLastMonth",
  "last-30": "workers.rangeLast30",
  custom: "workers.rangeCustom",
};

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
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();

  const [request, setRequest] = useState<WorkerQuery>(DEFAULT_WORKER_QUERY);
  const [page, setPage] = useState<WorkerPage>(initial);
  const [editing, setEditing] = useState<WorkerListItem | null>(null);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [detail, setDetail] = useState<WorkerListItem | null>(null);
  const [check, setCheck] = useState<{
    mode: "in" | "out";
    worker: WorkerListItem;
  } | null>(null);
  const [paying, setPaying] = useState<WorkerListItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  /*
   * Debounced, because the search changes on every keystroke and each change
   * is a round trip. The filters and paging ride the same timer — they change
   * one at a time, so the extra 250ms is not felt, and one code path is easier
   * to keep correct than two.
   *
   * The mount pass is skipped: the server component already fetched this exact
   * page, so running it would repeat a request whose answer is on screen.
   */
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;

      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      const next = await loadWorkersAction(request, { from, to });

      // A slow reply for an old query must not overwrite a newer one.
      if (!cancelled) {
        setPage(next);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [from, request, to]);

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
    const params = new URLSearchParams({ range: next });

    if (next === "custom" && rangeBounds) {
      params.set("from", rangeBounds.from);
      params.set("to", rangeBounds.to);
    }

    startTransition(() => router.push(`/workers?${params}`));
  };

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (worker: WorkerListItem) => {
    setEditing(worker);
    setSheetOpen(true);
  };

  const handleToggleActive = async (worker: WorkerListItem) => {
    setTogglingId(worker.id);
    await setWorkerActiveAction(worker.id, !worker.isActive);
    setTogglingId(null);
  };

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* The sidebar already says which page this is, so the heading only has
            to exist for a screen reader. */}
        <h1 className="sr-only">{messages["workers.title"]}</h1>

        <p className="whitespace-nowrap">
          <span className="font-semibold text-lg tabular-nums">
            {counts.active}
          </span>{" "}
          <span className="text-muted-foreground text-sm">
            {messages["workers.count"]}
          </span>
        </p>

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
                  {`${messages[option.labelKey]} (${counts[option.key]})`}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* The range drives the hours column, and changing it is a navigation —
            hence disabled while the new range is on its way, so a second pick
            cannot race the first. */}
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

        <div className="ml-auto flex items-center gap-3">
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
          <input
            className="rounded-lg border bg-transparent px-3 py-2 text-sm"
            onChange={(event) =>
              pushRange("custom", { from: event.target.value, to })
            }
            type="date"
            value={from}
          />
          <span className="text-muted-foreground">—</span>
          <input
            className="rounded-lg border bg-transparent px-3 py-2 text-sm"
            onChange={(event) =>
              pushRange("custom", { from, to: event.target.value })
            }
            type="date"
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
                      <button
                        className="flex items-center gap-2 text-left font-medium hover:underline"
                        onClick={() => setDetail(worker)}
                        type="button"
                      >
                        {worker.onShiftNow ? (
                          <span
                            aria-label={messages["workers.onShift"]}
                            className="size-2 shrink-0 rounded-full bg-primary"
                            role="img"
                          />
                        ) : null}
                        {worker.name}
                      </button>
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
                            disabled={!worker.isActive}
                            onClick={() => setCheck({ worker, mode: "in" })}
                            size="sm"
                            variant="outline"
                          >
                            <LogInIcon className="size-4" />
                            {messages["workers.checkIn"]}
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
          defaultPeriod={monthOfDate(from)}
          key={paying.id}
          locale={locale}
          messages={messages}
          onOpenChange={(open) => {
            if (!open) {
              setPaying(null);
            }
          }}
          onPaid={async () => {
            // The rows are held in state, so the earned/paid/balance columns
            // only catch up if this page is read again.
            setPage(await loadWorkersAction(request, { from, to }));
          }}
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
    </div>
  );
};
