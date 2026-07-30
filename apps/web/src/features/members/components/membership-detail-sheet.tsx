import { formatPhone } from "@repo/auth/lib/countries";
import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Progress } from "@repo/design-system/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { useMemberVisits } from "../api";
import {
  formatLongDay,
  formatVisit,
  hasDebt,
  type MemberListItem,
  type MemberMembership,
  type MembershipState,
  type MemberVisit,
} from "../types";
import {
  MemberIdentity,
  MoneyTiles,
  PanelHeading,
  PanelRow,
  toAmount,
  useRetainedMember,
} from "./panel-bits";

interface MembershipDetailSheetProperties {
  /** The member whose badge or debt was clicked; null keeps the panel closed. */
  member: MemberListItem | null;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
}

const STATE_BADGE: Record<MembershipState, string> = {
  active: "border-primary/40 bg-primary/10 text-primary-accent",
  expiring:
    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  expired: "border-border bg-muted text-muted-foreground",
};

/**
 * The state, again, as a stripe down the edge of the card.
 *
 * The badge already says it in words; this is what makes a lapsing membership
 * findable in a stack of them without reading any of them. Same three colours as
 * the badge and as the roster's own badges — one idea, one palette.
 */
const STATE_ACCENT: Record<MembershipState, string> = {
  active: "border-l-primary/60",
  expiring: "border-l-amber-500/60",
  expired: "border-l-border",
};

/**
 * How much of this membership has been collected, 0–100.
 *
 * A comp — charged nothing, paid nothing — is full rather than empty: there is
 * nothing outstanding, and an empty bar beside "to'lovsiz" reads as unpaid. An
 * overpayment is clamped, because a bar cannot say "more than all of it".
 */
const paidPercent = (paid: number, price: number): number => {
  if (price <= 0) {
    return 100;
  }

  return Math.min(100, Math.round((paid / price) * 100));
};

/**
 * Where this member stands across everything they hold, at the top of the panel.
 *
 * The panel opens from a membership badge or from the membership-debt figure, and
 * either way the desk's next question is "how much" — so both totals sit above
 * the cards rather than being added up from them.
 *
 * Two tiles rather than one, because "owes 200,000" and "has paid 660,000" are
 * different questions and the desk asks both: one before chasing a balance, the
 * other before arguing about whether a payment landed.
 *
 * Memberships only. Shop debt is a different balance with a panel of its own,
 * and folding it in here would produce a total that none of the cards below it
 * account for.
 */
const MoneySummary = ({
  member,
  messages,
}: {
  member: MemberListItem;
  messages: Messages;
}) => {
  let paid = 0;

  for (const membership of member.memberships) {
    paid += toAmount(membership.paid);
  }

  return (
    <MoneyTiles
      debt={member.membershipDebt}
      debtLabel={messages["members.debtShort"]}
      paid={paid.toFixed(2)}
      paidLabel={messages["members.paidLabel"]}
    />
  );
};

/**
 * `"17ta qoldi (30tadan)"` — what is left of a visit pass, in words.
 *
 * A template per locale rather than a number and a suffix glued together in
 * code: Uzbek puts the count first and Russian puts it last, and either order
 * hard-coded here reads as broken in the other language. The sold total is left
 * out when there isn't one — "17ta qoldi (0tadan)" is not a fact.
 */
const visitsRemainingText = (
  membership: MemberMembership,
  messages: Messages
): string => {
  const left = String(membership.remainingVisits);

  if (!membership.totalVisits) {
    return messages["members.visitsRemainingOnly"].replace("{left}", left);
  }

  return messages["members.visitsRemaining"]
    .replace("{left}", left)
    .replace("{total}", String(membership.totalVisits));
};

/**
 * What this one membership cost and what has actually been taken against it.
 *
 * Per membership, not per member. The tiles at the top are the sums across
 * everything someone holds, and a single figure cannot say whether the gym plan
 * is settled and the sauna package untouched or the other way round — which is
 * the question the desk asks before it chases anyone.
 *
 * A settled membership says nothing at all beyond what it was paid: "to'liq
 * to'langan" was a line of text restating a figure printed directly above it,
 * and every card carried it. A qoldiq row appears only when there *is* one, so
 * the row itself is the alarm.
 *
 * A comp is not a sale that went unpaid: nothing was charged, so it says
 * "to'lovsiz" rather than "0 of 0 paid". `price` is the charged amount, so the
 * distinction survives all the way from the backend.
 */
const MembershipMoney = ({
  membership,
  messages,
}: {
  membership: MemberMembership;
  messages: Messages;
}) => {
  const price = toAmount(membership.price);

  if (price <= 0) {
    return (
      <PanelRow
        label={messages["members.paidLabel"]}
        value={
          <span className="font-normal text-muted-foreground">
            {messages["members.paymentFree"]}
          </span>
        }
      />
    );
  }

  const isOwing = hasDebt(membership.debt);

  return (
    <>
      {/* What came off, when something did. Above the paid row because it is what
          made the charged figure what it is — without it, a 350,000 charge against
          a 400,000 plan looks like a missing 50,000. */}
      {membership.discount && Number(membership.discount) > 0 ? (
        <PanelRow
          label={messages["orders.discountLabel"]}
          value={
            <span className="font-semibold text-primary-accent">
              −{formatMoney(membership.discount)}
            </span>
          }
        />
      ) : null}

      {/* Paid over charged on one line: either number alone is half a fact,
          and the pair is what "how much of it is paid" actually means. */}
      <PanelRow
        label={messages["members.paidLabel"]}
        value={
          <>
            <span className="font-semibold">
              {formatMoney(membership.paid)}
            </span>
            <span className="font-normal text-muted-foreground">
              {" / "}
              {formatMoney(membership.price)}
            </span>
          </>
        }
      />

      {isOwing ? (
        <PanelRow
          label={messages["members.debtLabel"]}
          value={
            <span className="font-semibold text-destructive">
              {formatMoney(membership.debt)}
            </span>
          }
        />
      ) : null}
    </>
  );
};

/**
 * How much of this membership has been collected, as a bar.
 *
 * Decoration, not information — every figure it draws is written out in the rows
 * above it, so a screen reader gains nothing by reading it twice. It is a real
 * bar rather than the design system's 1px default: at that height it read as a
 * border on the card instead of as a proportion. Nothing is drawn for a comp,
 * which has no proportion to show.
 */
const PaidBar = ({ membership }: { membership: MemberMembership }) => {
  const price = toAmount(membership.price);

  if (price <= 0) {
    return null;
  }

  return (
    <Progress
      aria-hidden="true"
      className={cn(
        "h-2.5",
        hasDebt(membership.debt) && "[&>*]:bg-destructive"
      )}
      value={paidPercent(toAmount(membership.paid), price)}
    />
  );
};

/**
 * One membership: what it is, how much is left of it, and how much of it is paid.
 *
 * The plan name is centred at the top with its state under it, because the name
 * is the card's title rather than one more field — a member holding three of
 * these is scanning for "which one is this" first and reading the figures second.
 * Everything under it is a labelled row: the two dates are the span the
 * membership runs for, and what is left of it is stated in its own terms, since
 * a dated plan runs out by the calendar and a visit pass runs out by the count.
 */
const MembershipCard = ({
  membership,
  messages,
}: {
  membership: MemberMembership;
  messages: Messages;
}) => (
  <li
    className={cn(
      "flex flex-col gap-3 rounded-xl border border-l-4 p-4",
      STATE_ACCENT[membership.state]
    )}
  >
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-center font-semibold text-base">
        {membership.name || "—"}
      </span>
      <Badge className={STATE_BADGE[membership.state]} variant="outline">
        {messages[`members.state_${membership.state}`]}
      </Badge>
    </div>

    <dl className="flex flex-col gap-1.5 border-t pt-3">
      <PanelRow
        label={messages["members.colStart"]}
        value={formatLongDay(membership.startsAt)}
      />
      <PanelRow
        label={messages["members.colEnd"]}
        value={formatLongDay(membership.endsAt)}
      />

      {membership.remainingVisits === null ? null : (
        <PanelRow
          label={messages["members.visitsTitle"]}
          value={visitsRemainingText(membership, messages)}
        />
      )}

      <MembershipMoney membership={membership} messages={messages} />
    </dl>

    <PaidBar membership={membership} />
  </li>
);

/** The member's visits, newest first. Day and time on one line. */
const VisitList = ({
  messages,
  visits,
}: {
  messages: Messages;
  visits: readonly MemberVisit[];
}) => {
  if (visits.length === 0) {
    return (
      <Empty className="border py-10">
        <EmptyHeader>
          <EmptyTitle>{messages["members.visitsEmpty"]}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col overflow-hidden rounded-xl border">
      {visits.map((visit) => {
        const { day, time } = formatVisit(visit.at);

        return (
          <li
            className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm last:border-b-0"
            key={visit.id}
          >
            <span className="font-medium">{day}</span>
            <span className="text-muted-foreground tabular-nums">{time}</span>
          </li>
        );
      })}
    </ul>
  );
};

/**
 * Everything a member holds, what has been paid for it, and when they came in.
 *
 * A side panel rather than a centred dialog, and the same shape the orders drawer
 * uses — bordered header, one scrolling column under it — because the two answer
 * the same kind of question ("show me what sits behind this row") and should not
 * look like two different products. It opens from the right like every other
 * panel here; see `.claude/rules/components.md`.
 *
 * One panel per member rather than one per membership, and every badge and the
 * membership-debt figure all open the same one. That is not a shortcut — it is
 * what the data is. Visits are recorded against the person in
 * `attendance_sessions`, never against the plan that admitted them, so a
 * per-membership version would have shown the same list three times over while
 * implying each was different.
 */
export const MembershipDetailSheet = ({
  member,
  messages,
  onOpenChange,
}: MembershipDetailSheetProperties) => {
  const shown = useRetainedMember(member);

  // Keyed on the retained member, so the visit list survives the close too — and
  // reopening the same person paints from cache.
  const { data, isPending } = useMemberVisits(shown?.id ?? null);

  const visits = data ?? [];

  return (
    <Sheet onOpenChange={onOpenChange} open={member !== null}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        side="right"
      >
        {shown ? (
          <>
            <SheetHeader className="gap-3 border-b">
              <MemberIdentity
                code={shown.uniqueId}
                name={shown.name}
                phone={shown.phone ? formatPhone(shown.phone) : null}
              />
              <MoneySummary member={shown} messages={messages} />
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
              <section className="flex flex-col gap-2.5">
                <PanelHeading
                  count={shown.memberships.length}
                  title={messages["members.membershipsTitle"]}
                />

                {shown.memberships.length === 0 ? (
                  <Empty className="border py-10">
                    <EmptyHeader>
                      <EmptyTitle>
                        {messages["members.membershipsEmpty"]}
                      </EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {shown.memberships.map((membership) => (
                      <MembershipCard
                        key={membership.id}
                        membership={membership}
                        messages={messages}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-2.5">
                <PanelHeading
                  count={isPending ? undefined : visits.length}
                  title={messages["members.visitsTitle"]}
                />

                {isPending ? (
                  <output
                    aria-label={messages["members.visitsTitle"]}
                    className="flex justify-center py-10"
                  >
                    <Spinner />
                  </output>
                ) : (
                  <VisitList messages={messages} visits={visits} />
                )}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
