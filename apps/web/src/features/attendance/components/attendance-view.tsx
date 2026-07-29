import { formatPhone } from "@repo/auth/lib/countries";
import { Button } from "@repo/design-system/components/ui/button";
import { DatePicker } from "@repo/design-system/components/ui/date-picker";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import {
  CalendarCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  LogInIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IdCode } from "@/components/id-code";
import type { MemberListItem } from "@/features/members/types";
import type { Messages } from "@/lib/i18n/dictionary";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  useAttendanceSessions,
  useDecidePending,
  useDoor,
  useRemoveUnknownScan,
} from "../api";
import {
  type AttendanceRow,
  type DoorState,
  dayEnd,
  dayStart,
  formatEntry,
  PAGE_SIZES,
  presetRange,
  type RangePreset,
  toCsv,
} from "../types";
import { ManualVisitSheet } from "./manual-visit-sheet";
import { PendingQueue } from "./pending-queue";

interface AttendanceViewProperties {
  members: readonly MemberListItem[];
  messages: Messages;
}

/**
 * How often the queue is re-read. Somebody is physically waiting at a door, so
 * this is short — but it is a poll rather than a socket because the backend is
 * one process on a LAN and a five-second request costs less than the machinery
 * a push channel would need.
 */

export const AttendanceView = ({
  members,
  messages,
}: AttendanceViewProperties) => {
  const initial = useMemo(() => presetRange("month"), []);

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [isManualOpen, setIsManualOpen] = useState(false);

  /*
   * Debounced, because `query` changes on every keystroke and each change is a
   * round trip. The range and paging ride the same timer — they change one at a
   * time, so the extra 250ms is not felt.
   *
   * The dates are widened to the whole local day at both ends. A bare
   * "2026-07-26" parses as UTC midnight, which in this timezone would drop the
   * last day of the range entirely — the one the desk is usually looking at.
   */
  const filters = useMemo(
    () => ({
      from: dayStart(from).toISOString(),
      page,
      pageSize,
      query,
      to: dayEnd(to).toISOString(),
    }),
    [from, page, pageSize, query, to]
  );

  const sessions = useAttendanceSessions(useDebouncedValue(filters));

  // Two different counts: `total` is members (what the pager walks through),
  // `visits` is entries (what the header says out loud).
  const rows: AttendanceRow[] = sessions.data?.rows ?? [];
  const total = sessions.data?.total ?? 0;
  const visits = sessions.data?.visits ?? 0;

  /*
   * The door polls itself — see doorQuery. What the Next version needed a
   * setInterval, two refs-to-latest-callback and a manual baseline for is now
   * an interval the query owns, and it pauses when the tab is hidden.
   */
  const doorState = useDoor();
  const door: DoorState = doorState.data ?? {
    duplicateScan: null,
    latestEvent: null,
    pending: [],
    unknownScan: null,
  };

  const decidePending = useDecidePending();
  const removeUnknown = useRemoveUnknownScan();

  const decidingId = decidePending.isPending
    ? decidePending.variables.sessionId
    : null;
  const isRemovingUnknown = removeUnknown.isPending;

  /**
   * The id of the newest scan the page has already seen.
   *
   * A member the terminal lets straight through never reaches the decision
   * queue — their scan becomes an open session and nothing else. So a new event
   * id is the only signal that the table below is a row out of date. A ref
   * rather than state: it decides whether to refetch, and re-rendering because
   * it changed would be a render caused by its own effect.
   */
  const lastEventIdRef = useRef<number | null>(null);
  const eventId = door.latestEvent?.id ?? null;

  useEffect(() => {
    const seenId = lastEventIdRef.current;

    lastEventIdRef.current = eventId;

    // The first poll only establishes the baseline; refetching there would be a
    // second identical query on every page load.
    if (seenId !== null && eventId !== null && eventId !== seenId) {
      sessions.refetch();
    }
  }, [eventId, sessions.refetch]);

  const applyPreset = (preset: RangePreset) => {
    const range = presetRange(preset);

    setFrom(range.from);
    setTo(range.to);
    setPage(1);
  };

  /*
   * Neither of these refetches by hand any more. Both mutations invalidate the
   * whole attendance feature, so the queue and the table move together — on an
   * accept the queue loses a row and the table gains the visit it became.
   *
   * That also preserves the property the unknown-scan banner depends on: it
   * clears only if the terminal actually forgot the face, because it is the
   * re-read that decides rather than the click.
   */
  const handleDecide = (sessionId: number, isAccepted: boolean) => {
    decidePending.mutate({ isAccepted, sessionId });
  };

  const handleRemoveUnknown = () => {
    removeUnknown.mutate();
  };

  const handleExport = () => {
    const blob = new Blob([toCsv(rows, messages)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.download = `attendance-${from}_${to}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="sr-only">{messages["attendance.title"]}</h1>

      <PendingQueue
        decidingId={decidingId}
        door={door}
        isRemovingUnknown={isRemovingUnknown}
        messages={messages}
        onDecide={handleDecide}
        onRemoveUnknown={handleRemoveUnknown}
      />

      <div className="flex flex-wrap items-center gap-3">
        <p className="whitespace-nowrap">
          <span className="font-semibold text-lg tabular-nums">{visits}</span>{" "}
          <span className="text-muted-foreground text-sm">
            {messages["attendance.visits"]}
          </span>
        </p>

        <div className="flex items-center gap-2">
          <DatePicker
            aria-label={messages["attendance.today"]}
            className="w-full sm:w-44"
            onChange={(next) => {
              setFrom(next);
              setPage(1);
            }}
            value={from}
          />
          <span className="hidden text-muted-foreground sm:inline">—</span>
          <DatePicker
            aria-label={messages["attendance.month"]}
            className="w-full sm:w-44"
            onChange={(next) => {
              setTo(next);
              setPage(1);
            }}
            value={to}
          />
        </div>

        <div className="flex items-center gap-1">
          {(["today", "week", "month"] as const).map((preset) => (
            <Button
              key={preset}
              onClick={() => applyPreset(preset)}
              size="sm"
              variant="outline"
            >
              {messages[`attendance.${preset}`]}
            </Button>
          ))}
        </div>

        <div className="min-w-64 flex-1">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-5" />
            </InputGroupAddon>
            <InputGroupInput
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={messages["attendance.search"]}
              value={query}
            />
          </InputGroup>
        </div>

        <Button
          aria-label={messages["attendance.manual"]}
          onClick={() => setIsManualOpen(true)}
          size="icon"
        >
          <LogInIcon className="size-5" />
        </Button>
        <Button
          aria-label={messages["attendance.export"]}
          disabled={rows.length === 0}
          onClick={handleExport}
          size="icon"
          variant="outline"
        >
          <DownloadIcon className="size-5" />
        </Button>
      </div>

      {rows.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarCheckIcon />
            </EmptyMedia>
            <EmptyTitle className="text-base">
              {messages["attendance.empty"]}
            </EmptyTitle>
            <EmptyDescription>
              {messages["attendance.emptyHint"]}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">
                    {messages["attendance.colId"]}
                  </TableHead>
                  <TableHead>{messages["attendance.colMember"]}</TableHead>
                  <TableHead>{messages["attendance.colLastEntry"]}</TableHead>
                  {/* Beside the visit count, not beside the entry time: both
                      describe the member rather than this one entry, and
                      together they are the renewal conversation. */}
                  <TableHead className="text-right">
                    {messages["attendance.colVisits"]}
                  </TableHead>
                  <TableHead className="text-right">
                    {messages["attendance.colRemaining"]}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const entry = formatEntry(row.at);

                  return (
                    <TableRow key={row.memberId}>
                      <TableCell>
                        <IdCode code={row.uniqueId} />
                      </TableCell>
                      <TableCell>
                        <p className="truncate font-medium">{row.name}</p>
                        <p className="truncate text-muted-foreground text-sm tabular-nums">
                          {row.phone ? formatPhone(row.phone) : "—"}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="text-muted-foreground">
                          {entry.day}
                        </span>{" "}
                        <span className="font-medium tabular-nums">
                          {entry.time}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {row.visits}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {/* A dash, not a zero: a member on a time-based plan has
                            no session counter, which is not "none left". */}
                        {row.remainingVisits ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">
                {messages["attendance.rows"]}:
              </span>
              {PAGE_SIZES.map((size) => (
                <Button
                  aria-pressed={pageSize === size}
                  className={cn(pageSize !== size && "text-muted-foreground")}
                  key={size}
                  onClick={() => {
                    setPageSize(size);
                    setPage(1);
                  }}
                  size="sm"
                  variant={pageSize === size ? "default" : "ghost"}
                >
                  {size}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                aria-label="←"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                size="icon-sm"
                variant="outline"
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <span className="text-sm tabular-nums">
                {page} / {lastPage}
              </span>
              <Button
                aria-label="→"
                disabled={page >= lastPage}
                onClick={() =>
                  setPage((current) => Math.min(lastPage, current + 1))
                }
                size="icon-sm"
                variant="outline"
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <ManualVisitSheet
        members={members}
        messages={messages}
        onOpenChange={setIsManualOpen}
        open={isManualOpen}
      />
    </div>
  );
};
