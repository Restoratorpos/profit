"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { FieldError } from "@repo/design-system/components/ui/field";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import { ClockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import { formatDay } from "@/lib/workers";
import { checkInAction, checkOutAction } from "../actions";

type Mode = "in" | "out";

const pad = (value: number): string => String(value).padStart(2, "0");

/** Row height in px. The wheel's arithmetic is all multiples of this. */
const ITEM_HEIGHT = 40;
/** Odd, so exactly one row sits in the middle with the same number either side. */
const VISIBLE_ITEMS = 5;
/**
 * Half the wheel's height, minus half a row: the blank space that lets the first
 * and last value reach the middle instead of stopping at the edge.
 */
const EDGE_PAD = ((VISIBLE_ITEMS - 1) / 2) * ITEM_HEIGHT;

const rangeCache = new Map<number, readonly number[]>();

/** `0..max-1`, built once per column length rather than on every render. */
const rangeOf = (max: number): readonly number[] => {
  const cached = rangeCache.get(max);

  if (cached) {
    return cached;
  }

  const values = Array.from({ length: max }, (_, index) => index);

  rangeCache.set(max, values);

  return values;
};

/**
 * A scrollable HH or MM column.
 *
 * Scrolled, not stepped. The old pair of chevrons moved one unit per press,
 * which is fine for "07" and absurd for "43" — checking somebody in at half past
 * cost the operator thirty clicks. Scroll snapping gives the whole column in one
 * gesture, and the mouse wheel, a trackpad, a drag and the arrow keys all reach
 * it. Clicking a visible value still selects it, because a number on screen that
 * does nothing when clicked reads as broken.
 */
const TimeWheel = ({
  ariaLabel,
  max,
  onChange,
  value,
}: {
  ariaLabel: string;
  /** Exclusive upper bound: 24 for hours, 60 for minutes. */
  max: number;
  onChange: (next: number) => void;
  value: number;
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  /*
   * Follows `value` when it is changed from outside — the "Now" button, or the
   * arrow keys below.
   *
   * The jump is deliberately instant. A smooth scroll emits a stream of scroll
   * events on the way, every one of which reports a half-way value back through
   * `onChange`, and the two then fight each other all the way down the column.
   */
  useEffect(() => {
    const list = listRef.current;

    if (!list) {
      return;
    }

    const target = value * ITEM_HEIGHT;

    if (Math.abs(list.scrollTop - target) > 1) {
      list.scrollTop = target;
    }
  }, [value]);

  const handleScroll = () => {
    const list = listRef.current;

    if (!list) {
      return;
    }

    const index = Math.min(
      max - 1,
      Math.max(0, Math.round(list.scrollTop / ITEM_HEIGHT))
    );

    // Guarding on a change is what keeps the effect above from looping: the
    // scroll it causes lands on exactly this index, so nothing is reported back.
    if (index !== value) {
      onChange(index);
    }
  };

  // Wrapping, as the chevrons did: 00 is one step below 23, not a dead end.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onChange((value - 1 + max) % max);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      onChange((value + 1) % max);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onChange(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onChange(max - 1);
    }
  };

  return (
    <div
      aria-label={ariaLabel}
      className="w-24 snap-y snap-mandatory overflow-y-auto rounded-xl [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-scrollbar]:hidden"
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
      ref={listRef}
      role="listbox"
      style={{ height: VISIBLE_ITEMS * ITEM_HEIGHT }}
      tabIndex={0}
    >
      <div aria-hidden="true" style={{ height: EDGE_PAD }} />

      {rangeOf(max).map((option) => (
        <Button
          aria-selected={option === value}
          className={cn(
            "w-full snap-center rounded-none text-2xl tabular-nums hover:bg-transparent",
            option === value
              ? "font-bold text-3xl text-foreground"
              : "font-medium text-foreground/80"
          )}
          key={option}
          onClick={() => onChange(option)}
          role="option"
          style={{ height: ITEM_HEIGHT }}
          tabIndex={-1}
          type="button"
          variant="ghost"
        >
          {pad(option)}
        </Button>
      ))}

      <div aria-hidden="true" style={{ height: EDGE_PAD }} />
    </div>
  );
};

export const CheckInDialog = ({
  locale,
  messages,
  mode,
  onOpenChange,
  worker,
}: {
  locale: Locale;
  messages: Messages;
  mode: Mode;
  onOpenChange: (open: boolean) => void;
  worker: { id: string; name: string } | null;
}) => {
  const router = useRouter();
  const now = new Date();
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(now.getMinutes());
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setNow = () => {
    const current = new Date();

    setHour(current.getHours());
    setMinute(current.getMinutes());
  };

  const submit = async () => {
    if (!worker) {
      return;
    }

    // The desk picks a wall-clock time today; build the instant from it.
    const at = new Date();

    at.setHours(hour, minute, 0, 0);

    setIsPending(true);
    setError(null);

    const result =
      mode === "in"
        ? await checkInAction(worker.id, at.toISOString())
        : await checkOutAction(worker.id, at.toISOString());

    setIsPending(false);

    if (result.ok) {
      onOpenChange(false);
      router.refresh();
      return;
    }

    setError(result.error ?? "Something went wrong.");
  };

  const title =
    mode === "in"
      ? messages["workers.checkInTime"]
      : messages["workers.checkOutTime"];

  return (
    <Dialog onOpenChange={onOpenChange} open={worker !== null}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center">
          <DialogTitle className="flex items-center gap-2 text-primary-accent">
            <ClockIcon className="size-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-center">
            <span className="block font-bold text-foreground text-xl">
              {worker?.name}
            </span>
            {formatDay(new Date().toISOString(), locale)}
          </DialogDescription>
        </DialogHeader>

        <div className="relative rounded-2xl border bg-muted/30 p-4">
          {/* One band across both columns, drawn behind them rather than on the
              selected row — so it stays put while the numbers move through it,
              and the colon reads as part of the selected time. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-lg bg-primary/15"
            style={{ height: ITEM_HEIGHT }}
          />

          <div className="relative flex items-center justify-center gap-2">
            <TimeWheel
              ariaLabel={messages["workers.hours"]}
              max={24}
              onChange={setHour}
              value={hour}
            />
            <span className="font-bold text-3xl text-foreground">:</span>
            <TimeWheel
              ariaLabel={messages["workers.minutes"]}
              max={60}
              onChange={setMinute}
              value={minute}
            />
          </div>
        </div>

        {error ? <FieldError role="alert">{error}</FieldError> : null}

        <DialogFooter className="flex-row gap-2">
          <Button
            className="flex-1"
            disabled={isPending}
            onClick={setNow}
            type="button"
            variant="outline"
          >
            {messages["workers.now"]}
          </Button>
          <Button
            className="flex-1"
            disabled={isPending}
            onClick={submit}
            type="button"
          >
            {isPending ? <Spinner /> : null}
            {mode === "in"
              ? messages["workers.checkIn"]
              : messages["workers.checkOut"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
