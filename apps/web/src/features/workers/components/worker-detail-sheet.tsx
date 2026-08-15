import { formatPhone } from "@repo/auth/lib/countries";
import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Separator } from "@repo/design-system/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRightIcon, CalendarDaysIcon, PhoneIcon } from "lucide-react";
import { useState } from "react";
import { DateField } from "@/components/date-field";
import {
  durationParts,
  formatDay,
  formatDuration,
  formatTime,
  toDate,
  toDateInput,
} from "@/lib/date";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import { type RangeBounds, useWorkerDetail } from "../api";
import {
  type AttendanceSessionView,
  initialOf,
  positionLabelKey,
  RANGE_LABEL,
  RANGE_PRESETS,
  type RangePreset,
  rangeForPreset,
  type WorkerDetail,
  type WorkerListItem,
} from "../types";

/**
 * Worked time as the headline it is: the number large, the unit words small
 * beside it. Three stat boxes of the same size used to sit here — hire date,
 * session count, hours — which gave the one figure the panel exists for the
 * same weight as the two nobody opened it to read.
 */
const WorkedTime = ({
  locale,
  minutes,
}: {
  locale: Locale;
  minutes: number;
}) => {
  const parts = durationParts(minutes, locale);

  /* "65h" in English, "65 soat" in Uzbek — the unit sits as close to its
     number as the language writes it. */
  const pair = cn(
    "flex items-baseline",
    parts.gap === "" ? "gap-0.5" : "gap-1.5"
  );
  const unit = "font-normal text-base text-muted-foreground";

  return (
    <p className="flex items-baseline gap-2 font-semibold text-4xl tabular-nums">
      {parts.hours > 0 ? (
        <span className={pair}>
          {parts.hours}
          <span className={unit}>{parts.hourUnit}</span>
        </span>
      ) : null}
      <span className={pair}>
        {parts.minutes}
        <span className={unit}>{parts.minuteUnit}</span>
      </span>
    </p>
  );
};

/**
 * One line of the payslip: what the figure is on the left, the figure itself on
 * the right. The same row `PayrollSummary` states its figures in — the pay
 * window and this panel answer the same question about the same person one
 * screen apart, and reading them in two different layouts is how a desk ends up
 * checking one against the other by hand.
 *
 * The label gives and the money holds: `truncate` on the left, `nowrap` on the
 * right. `formatMoney` puts a space before "UZS", and a free break there would
 * set the currency on its own line under a number.
 */
const FigureRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="min-w-0 truncate text-muted-foreground text-sm">
      {label}
    </span>
    <span className="whitespace-nowrap font-medium tabular-nums">{value}</span>
  </div>
);

/**
 * How long this person worked over the chosen range, and what is still owed for
 * it — read top to bottom as the subtraction it is: earned, less what has
 * already been handed over, leaves the balance.
 *
 * Money earned is labelled `workers.payEarned` ("Hisoblandi"), never
 * `workers.colEarned`. In Uzbek `colEarned` is "Ishlangan" — the same string as
 * `detailWorked` directly above it — so the panel printed one word over a
 * duration and again over a sum of money, and read as one figure restated.
 * "Berilgan" and "Qoldiq" come from the pay window's keys for the same reason:
 * identical in Uzbek, but in Russian the difference is real ("Выплачено", not
 * "Выдано").
 *
 * Which days these figures cover is stated by the range control above, as that
 * control's own answer, so it is not repeated here.
 *
 * The rate is deliberately absent. It is the same number on every row of this
 * person's life, it is already on the staff table and in the pay window, and
 * printing it beside a total that changes with the range invited the two to be
 * read as one sum.
 */
const WorkedPanel = ({
  detail,
  locale,
  messages,
}: {
  detail: WorkerDetail;
  locale: Locale;
  messages: Messages;
}) => {
  const { worker } = detail;

  /*
   * Null, not zero, for a monthly salary: the backend will not guess what a
   * part-worked month is worth (see `WorkerListItem.earned`), so the row is an
   * em dash and stays grey. A null must never be coloured like a settled debt.
   */
  const balance = worker.balance === null ? null : Number(worker.balance);
  const isOwed = balance !== null && balance > 0;
  const isOverpaid = balance !== null && balance < 0;

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          {messages["workers.detailWorked"]}
        </span>
        <WorkedTime locale={locale} minutes={detail.totalMinutes} />
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        {/* The rate leads the ledger rather than sitting beside the headline:
            here it is the first line of the arithmetic — this much an hour,
            over that many hours, is what was earned — instead of a second
            figure competing with the worked time for the eye. Assembled as one
            string, the way the pay window states the same row. */}
        <FigureRow
          label={messages["workers.payRate"]}
          value={`${formatMoney(worker.salaryAmount)} / ${
            worker.salaryType === "hourly"
              ? messages["workers.perHour"]
              : messages["workers.perMonth"]
          }`}
        />
        <FigureRow
          label={messages["workers.payEarned"]}
          value={formatMoney(worker.earned)}
        />
        <FigureRow
          label={messages["workers.payPaidAlready"]}
          value={formatMoney(worker.paid)}
        />
      </div>

      <Separator />

      {/* The one figure the desk acts on, so it is the only one with a colour
          and the last thing on the way down to the shifts. Green only when
          money is actually owed: a dash and a zero both mean "nothing to hand
          over", and neither is news worth colouring. */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium text-sm">
          {isOverpaid
            ? messages["workers.payOverpaid"]
            : messages["workers.payRemaining"]}
        </span>
        <span
          className={cn(
            "whitespace-nowrap font-bold text-xl tabular-nums",
            isOwed ? "text-primary-accent" : "text-muted-foreground"
          )}
        >
          {balance === null
            ? formatMoney(null)
            : formatMoney(String(Math.abs(balance)))}
        </span>
      </div>
    </section>
  );
};

/*
 * One `id` per date field, so each end of the range has a label of its own.
 * All three controls in this region used to share `aria-label="Davr"`, which is
 * three controls a screen reader cannot tell apart.
 */
const RANGE_FROM_ID = "worker-range-from";
const RANGE_TO_ID = "worker-range-to";

/**
 * The range every figure below is computed over, and the days it came to.
 *
 * One full-width control on its own line rather than a row of three. At 344px a
 * select and two 144px date buttons wrapped into two ragged lines and each
 * button clipped its own label to "01 Avg 2...", so neither end of the range
 * could actually be read. Stacked, every control gets the whole column.
 *
 * The resolved days sit under the preset because they are that preset's answer.
 * They used to be printed inside the summary card, which is why the card looked
 * like it was explaining itself.
 *
 * Nothing here carries a `sm:` variant, and nothing may. The sheet is 384px
 * wide while the *viewport* is 1080 or more, so every `sm:` utility is already
 * active inside the narrow panel and cannot distinguish the two cases — that is
 * exactly how the old `sm:items-end` produced a centred, orphaned balance
 * column. The one thing that does re-flow keys off the sheet's own width
 * through an auto-fit grid.
 *
 * It opens on whatever the staff table was showing — that choice is the
 * question the operator already asked — and then belongs to this panel. Moving
 * it here does not move the table underneath: looking at one person's July is
 * not a decision about the list you came from.
 */
const RangePicker = ({
  bounds,
  locale,
  messages,
  onChange,
  preset,
}: {
  bounds: RangeBounds;
  locale: Locale;
  messages: Messages;
  onChange: (next: { bounds: RangeBounds; preset: RangePreset }) => void;
  preset: RangePreset;
}) => {
  /* A single day is a range too, and "3 avgust — 3 avgust" reads like a bug. */
  const days =
    bounds.from === bounds.to
      ? formatDay(bounds.from, locale)
      : `${formatDay(bounds.from, locale)} — ${formatDay(bounds.to, locale)}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Select
          onValueChange={(value) => {
            const next = value as RangePreset;

            onChange({
              preset: next,
              /* "Boshqa" keeps the days already on screen rather than emptying
                 both fields — the operator is about to nudge one of them, not
                 start from nothing. `rangeForPreset("custom")` returns empty
                 bounds and would blank both buttons. */
              bounds: next === "custom" ? bounds : rangeForPreset(next),
            });
          }}
          value={preset}
        >
          {/* The value has to be told to grow. The trigger is `justify-between`,
              so with an icon in front of it the three children would otherwise
              spread across the row and leave the chevron floating in the
              middle. `flex-1` is a different tailwind-merge group from the
              base's `flex`, so both survive — do not "tidy" this away. */}
          <SelectTrigger
            aria-label={messages["workers.rangeLabel"]}
            className="w-full *:data-[slot=select-value]:flex-1"
          >
            <CalendarDaysIcon className="size-5 shrink-0 text-muted-foreground" />
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

        {/* Under "Boshqa" the two fields below hold the days and are editable;
            printing them here as well would make one of the two look like the
            one that counts. */}
        {preset === "custom" ? null : (
          <p className="text-muted-foreground text-sm tabular-nums">{days}</p>
        )}
      </div>

      {preset === "custom" ? (
        /* `auto-fit` at 11rem: two tracks need 2×176 + 8 = 360px and the panel
           has 344px, so at today's width this is one full-width column per
           field — 286px of label budget against the ~97px the longest date in
           any of the three locales needs ("30 Iyun 2026"). Widen the sheet and
           the two pair up at ~312px each. It keys off the sheet's width, not
           the window's, which is the trap `sm:` fell into. */
        <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2">
          <Field>
            <FieldLabel htmlFor={RANGE_FROM_ID}>
              {messages["common.rangeFrom"]}
            </FieldLabel>
            {/* No width class: `Field` is `*:w-full` and the picker's own button
                is `w-full`, so the grid cell sizes it. */}
            <DateField
              id={RANGE_FROM_ID}
              /* Re-picking the day already selected makes the calendar commit
                 `""`, which would ask the API for a range with no start and
                 render `formatDay("")` as an em dash where a date belongs. A
                 range always has two ends; clearing one keeps the day it had. */
              onChange={(next) =>
                onChange({
                  preset,
                  bounds: { ...bounds, from: next || bounds.from },
                })
              }
              value={bounds.from}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={RANGE_TO_ID}>
              {messages["common.rangeTo"]}
            </FieldLabel>
            <DateField
              id={RANGE_TO_ID}
              onChange={(next) =>
                onChange({
                  preset,
                  bounds: { ...bounds, to: next || bounds.to },
                })
              }
              value={bounds.to}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
};

/** `"23 iyul → 26 iyul"` when a shift crossed midnight, `"3 avgust"` when not. */
const sessionDayLabel = (
  session: AttendanceSessionView,
  locale: Locale
): string => {
  const start = toDate(session.checkIn);
  const end = toDate(session.checkOut);
  const startLabel = formatDay(session.checkIn, locale);

  if (!(start && end) || toDateInput(start) === toDateInput(end)) {
    return startLabel;
  }

  return `${startLabel} — ${formatDay(session.checkOut, locale)}`;
};

/**
 * One shift: the day, the clock at each end, and how long it ran — with a bar
 * scaled against the longest shift in the list, so a run of them reads as
 * shapes before it reads as numbers.
 */
const SessionRow = ({
  locale,
  longest,
  messages,
  session,
}: {
  locale: Locale;
  longest: number;
  messages: Messages;
  session: AttendanceSessionView;
}) => {
  const share =
    longest > 0 ? Math.max(4, (session.minutesWorked / longest) * 100) : 0;

  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">
          {sessionDayLabel(session, locale)}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground text-sm tabular-nums">
          {formatTime(session.checkIn)}
          <ArrowRightIcon className="size-3.5 shrink-0" />
          {session.open ? (
            <Badge className="border-transparent bg-primary/15 text-primary-accent">
              {messages["workers.onShift"]}
            </Badge>
          ) : (
            formatTime(session.checkOut)
          )}
        </span>
      </div>

      <div className="flex w-32 shrink-0 flex-col items-end gap-1.5 sm:w-40">
        <span className="font-semibold tabular-nums">
          {formatDuration(session.minutesWorked, locale)}
        </span>
        <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary/70"
            style={{ width: `${share}%` }}
          />
        </span>
      </div>
    </li>
  );
};

const AttendanceList = ({
  detail,
  locale,
  messages,
}: {
  detail: WorkerDetail;
  locale: Locale;
  messages: Messages;
}) => {
  if (detail.sessions.length === 0) {
    return (
      <p className="rounded-xl border py-8 text-center text-muted-foreground text-sm">
        {messages["workers.noAttendance"]}
      </p>
    );
  }

  /* One pass for the longest shift — the bars are drawn against it. */
  let longest = 0;

  for (const session of detail.sessions) {
    if (session.minutesWorked > longest) {
      longest = session.minutesWorked;
    }
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {detail.sessions.map((session) => (
        <SessionRow
          key={session.id}
          locale={locale}
          longest={longest}
          messages={messages}
          session={session}
        />
      ))}
    </ul>
  );
};

/**
 * Everything below the header, and the range it is all computed over.
 *
 * The range is state here rather than a prop because the panel can change it.
 * It is mounted per worker (the sheet is keyed on the row), so each open starts
 * again from whatever the staff table is showing.
 */
const DetailBody = ({
  locale,
  messages,
  seed,
  workerId,
}: {
  locale: Locale;
  messages: Messages;
  seed: { bounds: RangeBounds; preset: RangePreset };
  workerId: string;
}) => {
  const [range, setRange] = useState(seed);

  /*
   * Keyed by the worker *and* the range: the attendance rows and totals are
   * computed over the range being asked about, so changing it is a different
   * answer rather than the same one re-sorted. The `cancelled` flag the effect
   * carried is unnecessary now that a stale reply belongs to another key.
   */
  const {
    data: detail,
    error: loadError,
    isPending,
  } = useWorkerDetail(workerId, range.bounds);

  const renderFigures = () => {
    if (isPending) {
      return (
        <div className="flex flex-1 items-center justify-center py-16">
          <Spinner aria-label={messages["workers.title"]} />
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="flex flex-1 items-center justify-center py-16">
          <FieldError role="alert">{loadError.message}</FieldError>
        </div>
      );
    }

    if (!detail) {
      return null;
    }

    return (
      <>
        <WorkedPanel detail={detail} locale={locale} messages={messages} />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {messages["workers.recentAttendance"]}
            </h3>
            <span className="text-muted-foreground text-xs">
              {detail.sessionCount} {messages["workers.entries"]}
            </span>
          </div>
          <AttendanceList detail={detail} locale={locale} messages={messages} />
        </div>
      </>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
      {/* Outside the loading branch: the control that caused the fetch must not
          vanish while it runs, or the range cannot be corrected until the
          answer to the wrong one arrives. */}
      <RangePicker
        bounds={range.bounds}
        locale={locale}
        messages={messages}
        onChange={setRange}
        preset={range.preset}
      />

      {renderFigures()}
    </div>
  );
};

export const WorkerDetailSheet = ({
  from,
  locale,
  messages,
  onOpenChange,
  preset,
  summary,
  to,
}: {
  from: string;
  locale: Locale;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  preset: RangePreset;
  summary: WorkerListItem | null;
  to: string;
}) => (
  <Sheet onOpenChange={onOpenChange} open={summary !== null}>
    {/* `data-[side=right]:w-full`, not a plain `w-full`: SheetContent's base
        carries `data-[side=right]:w-3/4`, and a bare utility loses to an
        attribute-compound selector however the classes are ordered — so
        tailwind-merge kept both and the sheet was 75% of a phone's viewport,
        with a strip of the list showing beside it. Matching the modifier chain
        is what lets the merge drop the base class. No `max-w` here at all: the
        base's `data-[side=right]:sm:max-w-sm` holds, and this panel is drawn
        for that 384px. The `sm:max-w-2xl` that used to sit here never applied
        for the same specificity reason — a dead class claiming a width the
        panel never had. */}
    <SheetContent
      className="flex flex-col gap-0 p-0 data-[side=right]:w-full"
      side="right"
    >
      <SheetHeader className="border-b">
        <SheetTitle className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-semibold text-lg text-primary-accent">
            {initialOf(summary?.name ?? "")}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="truncate">{summary?.name}</span>
              {summary?.onShiftNow ? (
                <Badge className="border-transparent bg-primary/15 font-normal text-primary-accent">
                  {messages["workers.onShift"]}
                </Badge>
              ) : null}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-normal text-muted-foreground text-sm">
              {summary?.role ? (
                <span>{messages[positionLabelKey(summary.role)]}</span>
              ) : null}
              {summary?.phone ? (
                <span className="flex items-center gap-1.5 tabular-nums">
                  <PhoneIcon className="size-3.5 shrink-0" />
                  {formatPhone(summary.phone)}
                </span>
              ) : null}
            </span>
          </span>
        </SheetTitle>
        <SheetDescription className="sr-only">{summary?.name}</SheetDescription>
      </SheetHeader>

      {/* Mounted only with a worker to show, so the body's range state starts
            from the table's choice every time the panel opens. */}
      {summary ? (
        <DetailBody
          locale={locale}
          messages={messages}
          seed={{ bounds: { from, to }, preset }}
          workerId={summary.id}
        />
      ) : null}
    </SheetContent>
  </Sheet>
);
