/**
 * The parts the member detail panel is built from.
 *
 * Kept in the feature rather than in `components/`: the orders drawer draws its
 * own balance its own way, so nothing outside members uses these. See the layout
 * rules in `apps/web/.claude/CLAUDE.md`.
 */

import {
  SheetDescription,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { cn } from "@repo/design-system/lib/utils";
import { type ReactNode, useRef } from "react";
import { formatMoney } from "@/lib/format";
import { initialOf, type MemberListItem } from "../types";

/** A decimal string as a number, with anything unparseable treated as zero. */
export const toAmount = (value: string): number => {
  const amount = Number(value);

  return Number.isFinite(amount) ? amount : 0;
};

/**
 * The member the panel is showing, held for as long as it is on screen.
 *
 * Closing sets the prop to null while Radix keeps the content mounted through the
 * slide-out, so reading the prop directly emptied the panel to a blank sheet for
 * the length of the animation, every time. Queries keyed on this value also stay
 * put across the close rather than being disabled mid-exit.
 */
export const useRetainedMember = (
  member: MemberListItem | null
): MemberListItem | null => {
  const last = useRef(member);

  if (member !== null) {
    last.current = member;
  }

  return member ?? last.current;
};

/**
 * Who the panel is about: an initial, a name, and the two things that identify a
 * person to the front desk.
 *
 * Centred, with the code and number on one line directly under the name — the
 * desk reads the three together when it is checking it has the right person, and
 * stacked labels made that three separate glances. The number is text rather than
 * a `tel:` link; this runs on a desk PC with no dialer.
 */
export const MemberIdentity = ({
  code,
  name,
  phone,
}: {
  code: string | null;
  name: string;
  phone: string | null;
}) => (
  <div className="flex flex-col items-center gap-1.5 text-center">
    <span
      aria-hidden="true"
      className="flex size-11 items-center justify-center rounded-full bg-primary/10 font-semibold text-base text-primary-accent"
    >
      {initialOf(name)}
    </span>

    <SheetTitle className="max-w-full truncate text-base">{name}</SheetTitle>

    <SheetDescription className="flex flex-wrap items-center justify-center gap-x-2 tabular-nums">
      {/* Semibold and in the interface font, like the chip in the table — a code
          is read out loud, and the monospace face made that harder. */}
      {code ? (
        <span className="font-semibold text-foreground">{code}</span>
      ) : null}
      {code && phone ? <span aria-hidden="true">·</span> : null}
      {phone ? <span>{phone}</span> : null}
    </SheetDescription>
  </div>
);

/**
 * One figure and what it is — the tile the top of the panel is built from.
 *
 * Drawn whether or not there is anything in it: a figure that appears only when
 * non-zero makes "nothing owed" indistinguishable from "the screen did not say",
 * and the front desk reads that difference out loud to the member.
 */
const MoneyTile = ({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "debt" | "paid";
  value: string;
}) => (
  <div
    className={cn(
      "flex flex-col gap-0.5 rounded-xl border px-3 py-2",
      tone === "debt"
        ? "border-destructive/30 bg-destructive/5"
        : "border-primary/30 bg-primary/5"
    )}
  >
    <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {label}
    </span>
    <span
      className={cn(
        "font-semibold text-lg tabular-nums",
        tone === "debt" ? "text-destructive" : "text-primary-accent"
      )}
    >
      {formatMoney(value)}
    </span>
  </div>
);

/** The two tiles side by side, which is how the panel opens. */
export const MoneyTiles = ({
  debt,
  debtLabel,
  paid,
  paidLabel,
}: {
  debt: string;
  debtLabel: string;
  paid: string;
  paidLabel: string;
}) => (
  <div className="grid grid-cols-2 gap-3">
    <MoneyTile label={debtLabel} tone="debt" value={debt} />
    <MoneyTile label={paidLabel} tone="paid" value={paid} />
  </div>
);

/**
 * A section label: what the block below it is, and how many of them there are.
 *
 * The count is omitted rather than zero while a list is still loading — "0"
 * beside a spinner is a figure the screen does not yet know.
 */
export const PanelHeading = ({
  count,
  title,
}: {
  count?: number;
  title: string;
}) => (
  <div className="flex items-baseline gap-2">
    <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
      {title}
    </h3>
    {count === undefined ? null : (
      <span className="text-muted-foreground text-xs tabular-nums">
        {count}
      </span>
    )}
  </div>
);

/**
 * One labelled fact: what it is on the left, what it says on the right.
 *
 * Every row reads the same way down a card, so the eye finds a given line by
 * position rather than by reading each one. Belongs inside a `dl`.
 */
export const PanelRow = ({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-muted-foreground text-sm">{label}:</dt>
    <dd className="text-right font-medium text-sm tabular-nums">{value}</dd>
  </div>
);
