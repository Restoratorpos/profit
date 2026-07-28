import { Badge, badgeVariants } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import { Spinner } from "@repo/design-system/components/ui/spinner";
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
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { useDeletePlan, useSetPlanActive } from "../api";
import type { NamedOption, PlanListItem } from "../types";
import { PlanMembersSheet } from "./plan-members-sheet";
import { PlanSheet } from "./plan-sheet";

/** Member count as a pill; tapping it opens the list of who is on the plan. */
const MembersCell = ({
  count,
  messages,
  onOpen,
}: {
  count: number;
  messages: Messages;
  onOpen: () => void;
}) => {
  if (count === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <Button
      className={cn(
        badgeVariants({ variant: "secondary" }),
        "h-11 gap-2 px-4 text-base hover:bg-secondary/80"
      )}
      onClick={onOpen}
      type="button"
    >
      <UsersIcon className="size-5 text-muted-foreground" />
      <span className="font-semibold">{count}</span>
      <span className="text-muted-foreground">
        {messages["plans.memberUnit"]}
      </span>
    </Button>
  );
};

/** The status badge is the control: tapping it flips the plan's activation. */
const StatusToggle = ({
  isActive,
  isPending,
  messages,
  onToggle,
}: {
  isActive: boolean;
  isPending: boolean;
  messages: Messages;
  onToggle: () => void;
}) => (
  <Button
    aria-pressed={isActive}
    className={cn(
      badgeVariants({ variant: isActive ? "default" : "secondary" }),
      // Badge shape, but a real 44px target — it is a control, not a label.
      "h-11 px-5 text-base",
      isActive ? "hover:bg-primary/90" : "hover:bg-secondary/90"
    )}
    disabled={isPending}
    onClick={onToggle}
    type="button"
  >
    {isPending ? <Spinner /> : null}
    {isActive ? messages["plans.active"] : messages["plans.inactive"]}
  </Button>
);

interface PlansViewProperties {
  halls: readonly NamedOption[];
  messages: Messages;
  plans: readonly PlanListItem[];
  trainers: readonly NamedOption[];
}

export const PlansView = ({
  halls,
  messages,
  plans,
  trainers,
}: PlansViewProperties) => {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PlanListItem | null>(null);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [membersOf, setMembersOf] = useState<PlanListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * The mutations carry their own pending state, so the `deletingId` and
   * `togglingId` this component used to track are gone: `variables` is the
   * argument of the in-flight call, which is exactly the row to show a spinner
   * on. Invalidation lives in the hooks, so nothing here refetches by hand.
   */
  const deletePlan = useDeletePlan();
  const setPlanActive = useSetPlanActive();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle.length === 0) {
      return plans;
    }

    return plans.filter((plan) => plan.name.toLowerCase().includes(needle));
  }, [plans, query]);

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (plan: PlanListItem) => {
    setEditing(plan);
    setSheetOpen(true);
  };

  const handleDelete = (planId: string) => {
    setError(null);
    deletePlan.mutate(planId, {
      onError: (cause) => setError(cause.message),
    });
  };

  const handleToggleActive = (plan: PlanListItem) => {
    setError(null);
    setPlanActive.mutate(
      { isActive: !plan.isActive, planId: plan.id },
      { onError: (cause) => setError(cause.message) }
    );
  };

  // 0 entries means unlimited, which is a different thing from "not set".
  const limitOf = (plan: PlanListItem): string => {
    if (plan.entryLimit > 0) {
      return `${plan.entryLimit} ${messages["plans.visits"]}`;
    }

    return messages["plans.unlimited"];
  };

  const durationOf = (plan: PlanListItem): string =>
    plan.duration ? `${plan.duration} ${messages["plans.days"]}` : "—";

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">
          {messages["nav.plans"]}
        </h1>

        <div className="mx-auto w-full max-w-xl">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-5" />
            </InputGroupAddon>
            <InputGroupInput
              onChange={(event) => setQuery(event.target.value)}
              placeholder={messages["plans.search"]}
              value={query}
            />
          </InputGroup>
        </div>

        <Button className="ml-auto" onClick={openCreate}>
          <PlusIcon className="size-5" />
          {messages["plans.add"]}
        </Button>
      </div>

      {error ? (
        <p
          className="rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-base text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{messages["plans.colName"]}</TableHead>
              <TableHead>{messages["plans.colBilling"]}</TableHead>
              <TableHead>{messages["plans.fieldDuration"]}</TableHead>
              <TableHead>{messages["plans.fieldEntryLimit"]}</TableHead>
              <TableHead className="text-right">
                {messages["plans.colPrice"]}
              </TableHead>
              <TableHead>{messages["plans.colMembers"]}</TableHead>
              <TableHead>{messages["plans.colStatus"]}</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-muted-foreground"
                  colSpan={8}
                >
                  {plans.length === 0
                    ? messages["plans.empty"]
                    : messages["plans.noResults"]}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((plan) => {
                const inUse = plan.membershipCount > 0;

                return (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {plan.billingType === "one_time"
                          ? messages["plans.billingOneTime"]
                          : messages["plans.billingRecurring"]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {durationOf(plan)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {limitOf(plan)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-primary-accent">
                      {formatMoney(plan.price)}
                    </TableCell>
                    <TableCell>
                      <MembersCell
                        count={plan.membershipCount}
                        messages={messages}
                        onOpen={() => setMembersOf(plan)}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusToggle
                        isActive={plan.isActive}
                        isPending={
                          setPlanActive.isPending &&
                          setPlanActive.variables?.planId === plan.id
                        }
                        messages={messages}
                        onToggle={() => handleToggleActive(plan)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          aria-label={messages["common.edit"]}
                          className="text-muted-foreground"
                          onClick={() => openEdit(plan)}
                          size="icon"
                          variant="ghost"
                        >
                          <PencilIcon className="size-5" />
                        </Button>

                        {/* A plan in use cannot be deleted. The button stays
                            enabled and answers on tap instead of greying out
                            behind a tooltip: there is no hover on a terminal,
                            so a tooltip is an explanation nobody ever sees —
                            the tap just appears to do nothing. */}
                        {inUse ? (
                          <Button
                            aria-label={messages["common.delete"]}
                            className="text-muted-foreground"
                            onClick={() => setError(messages["plans.inUse"])}
                            size="icon"
                            variant="ghost"
                          >
                            <Trash2Icon className="size-5" />
                          </Button>
                        ) : (
                          <Button
                            aria-label={messages["common.delete"]}
                            className="text-muted-foreground hover:text-destructive"
                            disabled={
                              deletePlan.isPending &&
                              deletePlan.variables === plan.id
                            }
                            onClick={() => handleDelete(plan.id)}
                            size="icon"
                            variant="ghost"
                          >
                            {deletePlan.isPending &&
                            deletePlan.variables === plan.id ? (
                              <Spinner />
                            ) : (
                              <Trash2Icon className="size-5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <PlanMembersSheet
        messages={messages}
        onOpenChange={(next) => {
          if (!next) {
            setMembersOf(null);
          }
        }}
        open={membersOf !== null}
        planId={membersOf?.id ?? null}
        planName={membersOf?.name ?? ""}
      />

      <PlanSheet
        halls={halls}
        // Remount per plan so the uncontrolled inputs pick up new defaults.
        key={editing?.id ?? "new"}
        messages={messages}
        onOpenChange={setSheetOpen}
        open={isSheetOpen}
        plan={editing}
        trainers={trainers}
      />
    </div>
  );
};
