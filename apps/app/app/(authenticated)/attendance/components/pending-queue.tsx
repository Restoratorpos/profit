"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import {
  ClockIcon,
  LogInIcon,
  ScanFaceIcon,
  ShieldAlertIcon,
  UserCheckIcon,
  WifiIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  type DoorState,
  type DuplicateScan,
  formatEntry,
  reasonMessage,
  type UnknownScan,
} from "@/lib/attendance";
import type { AttendanceEventView } from "@/lib/devices";
import type { Messages } from "@/lib/i18n/dictionary";

interface PendingQueueProperties {
  /** The id currently being decided, so its buttons can show the wait. */
  decidingId: number | null;
  /** One poll of the door: the queue, the last scan, the unnameable one. */
  door: DoorState;
  isRemovingUnknown: boolean;
  messages: Messages;
  onDecide: (sessionId: number, isAccepted: boolean) => void;
  onRemoveUnknown: () => void;
}

/**
 * How long the banner holds something the desk has to read — a repeat scan, a
 * refusal. Twenty seconds is long enough to look up and take it in, short
 * enough that "this is who is at the door" cannot quietly become "this is who
 * was at the door a few minutes ago".
 */
const NOTICE_MS = 20_000;

/**
 * An ordinary arrival gets half that. Nobody has to do anything about a member
 * the door let straight through, so it only has to be seen, not answered — and
 * the sooner it clears, the sooner the banner is telling the truth again.
 */
const ARRIVAL_MS = 10_000;

/**
 * When a notice about `time` stops being shown, or null when there is nothing
 * to time. Measured from the scan itself, not from when this page first drew
 * it: a banner's age is the door's, so a reload cannot restart the clock.
 */
const expiryOf = (
  time: string | null | undefined,
  life: number
): number | null => {
  if (!time) {
    return null;
  }

  const at = new Date(time).getTime();

  return Number.isFinite(at) ? at + life : null;
};

/** The soonest deadline still ahead of `now`, or null if none is. */
const soonestExpiry = (
  now: number,
  deadlines: readonly (number | null)[]
): number | null => {
  let soonest: number | null = null;

  for (const deadline of deadlines) {
    if (
      deadline !== null &&
      deadline > now &&
      (soonest === null || deadline < soonest)
    ) {
      soonest = deadline;
    }
  }

  return soonest;
};

/**
 * Render again the moment the banner is due to clear.
 *
 * Freshness read at render alone would only be re-read when the poll comes
 * back, so a twenty-second notice could stand for twenty-five. One timeout at
 * the exact deadline rather than a ticking interval: the banner has at most one
 * moment it has to change on its own.
 */
const useExpiryTick = (deadline: number | null): void => {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (deadline === null) {
      return;
    }

    const timer = setTimeout(
      () => setTick((count) => count + 1),
      Math.max(0, deadline - Date.now())
    );

    return () => clearTimeout(timer);
  }, [deadline]);
};

/**
 * The poll is the only thing keeping the banner current, so it says so — a
 * stale banner and a live one must not look identical.
 */
const LiveBadge = ({ label }: { label: string }) => (
  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 font-medium text-primary-accent text-xs">
    <WifiIcon className="size-3.5" />
    {label}
  </span>
);

/** One of the three things the door banner can be saying, fully styled. */
interface DoorView {
  /** The line under the name; empty when there is nothing to say. */
  detail: string;
  detailTone: string;
  frame: string;
  icon: ReactNode;
  name: string;
  nameTone: string;
  tile: string;
}

const line = (...parts: (string | null | undefined)[]): string =>
  parts.filter(Boolean).join(" · ");

const doorView = (
  repeat: DuplicateScan | null,
  scan: AttendanceEventView | null,
  messages: Messages
): DoorView => {
  if (repeat) {
    return {
      detail: line(
        repeat.reason === "inside"
          ? messages["attendance.alreadyInside"]
          : messages["attendance.alreadyScanned"],
        formatEntry(repeat.at).time,
        repeat.deviceName
      ),
      detailTone: "text-amber-700/90 dark:text-amber-400",
      frame: "border-amber-500/40 bg-amber-500/5",
      icon: <ClockIcon className="size-6" />,
      name: repeat.name,
      nameTone: "text-amber-700 dark:text-amber-300",
      tile: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    };
  }

  if (scan) {
    return {
      detail: line(
        scan.direction === "out"
          ? messages["devices.directionOutShort"]
          : messages["devices.directionInShort"],
        formatEntry(scan.time).time,
        scan.deviceName
      ),
      detailTone: "text-muted-foreground",
      frame: "",
      icon: <UserCheckIcon className="size-6" />,
      name: scan.personName ?? "",
      nameTone: "",
      tile: "bg-primary/15 text-primary-accent",
    };
  }

  return {
    detail: "",
    detailTone: "",
    frame: "",
    icon: <ScanFaceIcon className="size-6" />,
    name: messages["attendance.waitingScan"],
    nameTone: "",
    tile: "bg-muted text-muted-foreground",
  };
};

/**
 * Nobody is waiting on a decision, so the banner reports the door instead.
 * Three states, in the order the desk needs them: the same person scanning
 * twice, the face that just went through, or that it is watching for one.
 *
 * The repeat comes first because it is the only one that explains a lack of
 * change — behind it the last real scan is still on screen, and with nothing
 * said about the second beep the operator is looking at a terminal that appears
 * to have stopped working.
 *
 * Both arrive already timed out by the caller, so this only draws them.
 *
 * The banner itself is never removed. "The terminal is idle" and "this page
 * stopped polling" must not look the same — and a row that appears and
 * disappears would shift the filters under the operator's hand every time
 * somebody walks in. What expires is the name on it, not the row.
 */
const DoorBanner = ({
  duplicateScan,
  latestEvent,
  messages,
}: {
  duplicateScan: DuplicateScan | null;
  latestEvent: AttendanceEventView | null;
  messages: Messages;
}) => {
  const view = doorView(
    duplicateScan,
    latestEvent?.personName ? latestEvent : null,
    messages
  );

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border p-4",
        view.frame
      )}
    >
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-xl",
          view.tile
        )}
      >
        {view.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-semibold text-lg", view.nameTone)}>
          {view.name}
        </p>
        {view.detail ? (
          <p className={cn("truncate text-sm", view.detailTone)}>
            {view.detail}
          </p>
        ) : null}
      </div>

      <LiveBadge label={messages["attendance.live"]} />
    </div>
  );
};

/**
 * The door worked and the CRM cannot say for whom.
 *
 * Louder than a refusal on purpose: a refusal is the system doing its job, this
 * is a face that opens a door and belongs to nobody — almost always a member
 * deleted here whose photo is still on the terminal. The id is shown raw
 * because it is the only handle anybody has on them, and the one action that
 * fixes it is next to it.
 */
const UnknownScanBanner = ({
  isRemoving,
  messages,
  onRemove,
  scan,
}: {
  isRemoving: boolean;
  messages: Messages;
  onRemove: () => void;
  scan: UnknownScan;
}) => (
  <div className="flex items-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground">
      <ShieldAlertIcon className="size-6" />
    </span>

    <div className="min-w-0 flex-1">
      <p className="truncate font-semibold text-destructive text-lg">
        {messages["attendance.unknownScan"]}
      </p>
      <p className="truncate text-destructive/90 text-sm">
        {[`ID ${scan.employeeNo}`, formatEntry(scan.at).time, scan.deviceName]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>

    <div className="flex shrink-0 flex-col items-end gap-1">
      <LiveBadge label={messages["attendance.live"]} />
      <Button
        className="h-auto p-0 text-destructive text-xs"
        disabled={isRemoving}
        onClick={onRemove}
        variant="link"
      >
        {isRemoving ? <Spinner /> : null}
        {messages["attendance.removeFromTerminal"]}
      </Button>
    </div>
  </div>
);

/**
 * Somebody is standing at the door right now.
 *
 * The newest refusal gets a banner of its own above the queue — it is the thing
 * that just happened, and the desk needs to see it without reading a list. The
 * queue underneath holds everyone still waiting, oldest first, because they
 * arrived in that order.
 *
 * Everything on the banner is on a clock; nothing in the queue is. The banner
 * says what just happened, so it has to stop saying it — the queue is a list of
 * people nobody has answered yet, and that only clears when somebody does.
 * The unknown scan sits with the queue on this: it too waits for an answer.
 */
export const PendingQueue = ({
  decidingId,
  door,
  isRemovingUnknown,
  messages,
  onDecide,
  onRemoveUnknown,
}: PendingQueueProperties) => {
  const { duplicateScan, latestEvent, pending, unknownScan } = door;

  // Oldest first from the server, so the newest arrival is the last one.
  const latest = pending.at(-1);

  const now = Date.now();
  const repeatUntil = expiryOf(duplicateScan?.at, NOTICE_MS);
  const arrivalUntil = expiryOf(latestEvent?.time, ARRIVAL_MS);
  // A refusal is read, not answered, up here — the row for it in the queue is
  // what the desk acts on, and that one stays.
  const refusalUntil = expiryOf(latest?.at, NOTICE_MS);

  useExpiryTick(soonestExpiry(now, [repeatUntil, arrivalUntil, refusalUntil]));

  // An unrecognised scan takes the banner over: it is both what just happened at
  // the door and the one thing up here that needs answering.
  const unknownBanner = unknownScan ? (
    <UnknownScanBanner
      isRemoving={isRemovingUnknown}
      messages={messages}
      onRemove={onRemoveUnknown}
      scan={unknownScan}
    />
  ) : null;

  const refusalBanner =
    latest && refusalUntil !== null && refusalUntil > now ? (
      <div className="flex items-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground">
          <ShieldAlertIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-destructive text-lg">
            {latest.name}
          </p>
          <p className="truncate text-destructive/90 text-sm">
            {reasonMessage(latest.reason, messages)}
            {latest.accessFrom && latest.accessTo
              ? ` ${messages["attendance.allowedWindow"]}: ${latest.accessFrom}–${latest.accessTo}`
              : ""}
          </p>
        </div>
        <LiveBadge label={messages["attendance.live"]} />
      </div>
    ) : null;

  // Only once the louder two have had their turn — and the row stays either way,
  // so a banner running out never moves the page under the operator's hand.
  const doorBanner =
    unknownBanner || refusalBanner ? null : (
      <DoorBanner
        duplicateScan={
          repeatUntil !== null && repeatUntil > now ? duplicateScan : null
        }
        latestEvent={
          arrivalUntil !== null && arrivalUntil > now ? latestEvent : null
        }
        messages={messages}
      />
    );

  if (pending.length === 0) {
    return unknownBanner ?? doorBanner;
  }

  return (
    <div className="flex flex-col gap-3">
      {unknownBanner}
      {refusalBanner}
      {doorBanner}

      <div className="overflow-hidden rounded-xl border border-amber-500/40 bg-amber-500/5">
        <div className="flex items-center gap-2 border-amber-500/20 border-b px-4 py-2.5">
          <ShieldAlertIcon className="size-4 text-amber-600 dark:text-amber-400" />
          <p className="font-medium text-amber-700 text-sm dark:text-amber-400">
            {messages["attendance.pending"]}
          </p>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-medium text-amber-700 text-xs tabular-nums dark:text-amber-300">
            {pending.length}
          </span>
        </div>

        {pending.map((decision) => {
          const entry = formatEntry(decision.at);
          const isDeciding = decidingId === decision.sessionId;

          return (
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              key={decision.sessionId}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 font-medium text-amber-700 dark:text-amber-300">
                {decision.name.slice(0, 1).toUpperCase() || "?"}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{decision.name}</p>
                <p className="truncate text-amber-700 text-sm dark:text-amber-400">
                  {reasonMessage(decision.reason, messages)}
                </p>
              </div>

              <span className="shrink-0 text-muted-foreground text-sm tabular-nums">
                {entry.day} {entry.time}
              </span>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  className={cn("gap-2")}
                  disabled={isDeciding}
                  onClick={() => onDecide(decision.sessionId, true)}
                  size="sm"
                >
                  {isDeciding ? <Spinner /> : <LogInIcon className="size-4" />}
                  {messages["attendance.acceptAnyway"]}
                </Button>
                <Button
                  aria-label={`${messages["attendance.reject"]}: ${decision.name}`}
                  className="text-muted-foreground"
                  disabled={isDeciding}
                  onClick={() => onDecide(decision.sessionId, false)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <XIcon className="size-5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
