import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { LayersIcon } from "lucide-react";
import { useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import { useAddMembership } from "../api";
import {
  firstLeg,
  formatDay,
  type MemberListItem,
  type PaymentLeg,
  type PaymentType,
  type PlanOption,
  settlementOf,
  type Till,
  todayIso,
  toPayments,
  visibleLegCount,
  withLeg,
} from "../types";
import { MembershipSection, NO_PLAN } from "./member-sheet";

interface ManageSubscriptionDialogProperties {
  /** The row the dialog was opened from; null keeps it closed. */
  member: MemberListItem | null;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  plans: readonly PlanOption[];
}

const MS_PER_DAY = 86_400_000;

/** The day after `iso`, as "YYYY-MM-DD". */
const dayAfter = (iso: string): string => {
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return todayIso();
  }

  return formatDay(new Date(parsed.getTime() + MS_PER_DAY).toISOString());
};

/**
 * When a new membership of `planId` should begin.
 *
 * Selling a plan the member already holds is a renewal, and a renewal starts
 * where the current one stops — otherwise the two overlap and the member pays
 * for days they already had. Selling something they do *not* hold is an
 * addition, and an addition starts today: a sauna package bought alongside a
 * gym plan should not wait for the gym plan to run out.
 *
 * Only unexpired memberships push the date out. Renewing something that lapsed
 * last month starts today, not the day after it died.
 */
const suggestedStart = (member: MemberListItem, planId: string): string => {
  let latest: string | null = null;

  for (const held of member.memberships) {
    if (held.planId !== planId || held.state === "expired" || !held.endsAt) {
      continue;
    }

    if (latest === null || held.endsAt > latest) {
      latest = held.endsAt;
    }
  }

  return latest ? dayAfter(latest) : todayIso();
};

/**
 * Sells a member another membership without disturbing the ones they hold.
 *
 * The same form the new-member sheet uses for its plan half, reached from the
 * row instead — because "add another on top" is the ordinary case here, not an
 * edge one. Nothing in this dialog can change an existing membership: it only
 * ever appends, which is what keeps one purchase behind one `membership_id` and
 * the debt column honest.
 */
export const ManageSubscriptionDialog = ({
  member,
  messages,
  onOpenChange,
  plans,
}: ManageSubscriptionDialogProperties) => {
  const [planId, setPlanId] = useState(NO_PLAN);
  const [startsAt, setStartsAt] = useState(todayIso);
  const [legs, setLegs] = useState<PaymentLeg[]>(firstLeg);
  const [error, setError] = useState<string | null>(null);

  const addMembership = useAddMembership();

  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null;
  const listPrice = Number(selectedPlan?.price ?? 0);
  const { applied, debt, paid, total } = settlementOf(listPrice, legs);
  const shown = visibleLegCount(listPrice, legs);

  const pickPlan = (next: string) => {
    setPlanId(next);
    // Renewing stacks behind what they hold; adding starts today.
    setStartsAt(member ? suggestedStart(member, next) : todayIso());
  };

  const setLeg = (
    index: number,
    patch: Partial<{ amount: string; method: PaymentType; till: Till }>
  ) => {
    setLegs((current) => withLeg(listPrice, current, index, patch));
  };

  const close = () => {
    setPlanId(NO_PLAN);
    setStartsAt(todayIso());
    setLegs(firstLeg);
    setError(null);
    onOpenChange(false);
  };

  const submit = () => {
    if (!member || planId === NO_PLAN) {
      return;
    }

    setError(null);

    addMembership.mutate(
      {
        input: {
          planId,
          startsAt,
          payments: toPayments(legs.slice(0, shown)),
        },
        memberId: member.id,
      },
      {
        onSuccess: close,
        onError: (cause: Error) => setError(cause.message),
      }
    );
  };

  return (
    <Dialog
      onOpenChange={(next) => (next ? null : close())}
      open={member !== null}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayersIcon className="size-5 text-primary-accent" />
            {messages["members.manageSubscription"]}
          </DialogTitle>
          <DialogDescription>{member?.name}</DialogDescription>
        </DialogHeader>

        {/* What they already hold, so "on top of what" is answerable without
            closing the dialog to go and look at the row. */}
        {member && member.memberships.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
            {member.memberships.map((held) => (
              <li
                className="flex items-center justify-between gap-3"
                key={held.id}
              >
                <span
                  className={
                    held.state === "expired"
                      ? "text-muted-foreground line-through"
                      : ""
                  }
                >
                  {held.name || "—"}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {held.remainingVisits === null
                    ? formatDay(held.endsAt)
                    : `${held.remainingVisits} ${messages["members.visitsShort"]}`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <MembershipSection
          applied={applied}
          debt={debt}
          disabled={addMembership.isPending}
          legs={legs}
          messages={messages}
          onLegAmount={(index, amount) => setLeg(index, { amount })}
          onLegMethod={(index, method) => setLeg(index, { method })}
          onLegTill={(index, till) => setLeg(index, { till })}
          onPlan={pickPlan}
          onStartsAt={setStartsAt}
          paid={paid}
          planId={planId}
          plans={plans}
          shown={shown}
          startsAt={startsAt}
          total={total}
        />

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            className="w-full"
            disabled={planId === NO_PLAN || addMembership.isPending}
            onClick={submit}
            type="button"
          >
            {addMembership.isPending ? <Spinner /> : null}
            {messages["members.addMembership"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
