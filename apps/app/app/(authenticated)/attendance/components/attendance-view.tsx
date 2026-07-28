"use client";

import { formatPhone } from "@repo/auth/lib/countries";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Input } from "@repo/design-system/components/ui/input";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "@/lib/attendance";
import type { Messages } from "@/lib/i18n/dictionary";
import type { MemberListItem } from "@/lib/members";
import { IdCode } from "../../components/id-code";
import {
  decidePendingAction,
  loadAttendanceAction,
  loadDoorAction,
  removeUnknownScanAction,
} from "../actions";
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
const POLL_MS = 5000;

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
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  // Two different counts: `total` is members (what the pager walks through),
  // `visits` is entries (what the header says out loud).
  const [total, setTotal] = useState(0);
  const [visits, setVisits] = useState(0);
  const [door, setDoor] = useState<DoorState>({
    duplicateScan: null,
    latestEvent: null,
    pending: [],
    unknownScan: null,
  });
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [isRemovingUnknown, setIsRemovingUnknown] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);

  const refreshList = useCallback(async () => {
    const result = await loadAttendanceAction({
      // Widened to the whole local day at both ends. A bare "2026-07-26" parses
      // as UTC midnight, which in this timezone would drop the last day of the
      // range entirely — the one the desk is usually looking at.
      from: dayStart(from).toISOString(),
      page,
      pageSize,
      query,
      to: dayEnd(to).toISOString(),
    });

    setRows(result.page.rows);
    setTotal(result.page.total);
    setVisits(result.page.visits);
  }, [from, page, pageSize, query, to]);

  // Debounced, because `query` changes on every keystroke and each change is a
  // round trip. The range and paging changes ride along on the same timer.
  useEffect(() => {
    const timer = setTimeout(refreshList, 250);

    return () => clearTimeout(timer);
  }, [refreshList]);

  // Kept in a ref so the poll can pull the table forward without depending on
  // the filters, which would restart the interval on every keystroke.
  const refreshListRef = useRef(refreshList);

  useEffect(() => {
    refreshListRef.current = refreshList;
  }, [refreshList]);

  /**
   * The id of the newest scan the page has already seen. A ref rather than
   * state: it decides whether to refetch, and re-rendering because it changed
   * would be a render caused by its own effect.
   */
  const lastEventIdRef = useRef<number | null>(null);

  const refreshDoor = useCallback(async () => {
    const state = await loadDoorAction();

    setDoor(state);

    const eventId = state.latestEvent?.id ?? null;
    const seenId = lastEventIdRef.current;

    lastEventIdRef.current = eventId;

    /*
     * A member the terminal let straight through never reaches the decision
     * queue — their scan becomes an open session and nothing else. So the
     * arrival of a new event id is what tells this page the table below is one
     * row out of date. The first poll only establishes the baseline; refetching
     * there would be a second identical query on every page load.
     */
    if (seenId !== null && eventId !== null && eventId !== seenId) {
      await refreshListRef.current();
    }
  }, []);

  // Kept in a ref so the interval never re-subscribes when the callback changes.
  const pollRef = useRef(refreshDoor);

  useEffect(() => {
    pollRef.current = refreshDoor;
  }, [refreshDoor]);

  useEffect(() => {
    pollRef.current();

    const timer = setInterval(() => pollRef.current(), POLL_MS);

    return () => clearInterval(timer);
  }, []);

  const applyPreset = (preset: RangePreset) => {
    const range = presetRange(preset);

    setFrom(range.from);
    setTo(range.to);
    setPage(1);
  };

  const handleDecide = async (sessionId: number, isAccepted: boolean) => {
    setDecidingId(sessionId);

    await decidePendingAction(sessionId, isAccepted);

    setDecidingId(null);
    // Both lists move: the queue loses a row and, on an accept, the table gains
    // the visit it just became.
    await Promise.all([refreshDoor(), refreshList()]);
  };

  const handleRemoveUnknown = async () => {
    setIsRemovingUnknown(true);

    await removeUnknownScanAction();

    setIsRemovingUnknown(false);
    // The banner clears only if the terminal actually forgot them, so it is the
    // re-read that decides — not the click.
    await refreshDoor();
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
    <div className="flex flex-1 flex-col gap-4 p-6">
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
          <Input
            aria-label={messages["attendance.today"]}
            className="w-40"
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            type="date"
            value={from}
          />
          <span className="text-muted-foreground">—</span>
          <Input
            aria-label={messages["attendance.month"]}
            className="w-40"
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            type="date"
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
        onRecorded={refreshList}
        open={isManualOpen}
      />
    </div>
  );
};
