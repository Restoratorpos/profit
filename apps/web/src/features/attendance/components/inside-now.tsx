import { Button } from "@repo/design-system/components/ui/button";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { LogOutIcon, UsersIcon } from "lucide-react";
import { IdCode } from "@/components/id-code";
import { formatTime } from "@/lib/date";
import type { Messages } from "@/lib/i18n/dictionary";
import { useCheckoutMember, useInsideMembers } from "../api";
import type { CheckoutTarget } from "./checkout-dialog";

interface InsideNowProperties {
  messages: Messages;
  /** Raised when a checkout is refused because the member still owes on orders. */
  onOwes: (target: CheckoutTarget) => void;
}

/**
 * Who is inside right now, each with a way out.
 *
 * The terminal is not the only exit — a member who walks past it without
 * scanning would sit "inside" until the day rolled their visit closed — so the
 * desk can check anyone out by hand here. A checkout that finds an open shop tab
 * comes back `owes` and hands the member up to the confirm dialog rather than
 * closing the visit; everything else just closes.
 */
export const InsideNow = ({ messages, onOwes }: InsideNowProperties) => {
  const inside = useInsideMembers();
  const checkout = useCheckoutMember();

  const rows = inside.data ?? [];
  const busyId = checkout.isPending ? checkout.variables?.memberId : null;

  const handleCheckout = (memberId: string, uniqueId: string | null) => {
    checkout.mutate(
      { memberId },
      {
        onSuccess: (result) => {
          if (result.status === "owes") {
            onOwes({
              items: result.items,
              memberId,
              name: result.name,
              remaining: result.remaining,
              uniqueId,
            });
          }
        },
      }
    );
  };

  // Nothing to show until somebody is in — the panel earns its space by holding
  // people, not by announcing an empty gym above the day's table.
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <UsersIcon className="size-4 text-muted-foreground" />
        <p className="font-medium text-sm">{messages["attendance.insideNow"]}</p>
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">
          {rows.length}
        </span>
      </div>

      <ul className="divide-y">
        {rows.map((row) => {
          const isBusy = busyId === row.memberId;

          return (
            <li
              className="flex items-center gap-3 px-4 py-2.5"
              key={row.memberId}
            >
              <IdCode code={row.uniqueId} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.name}</p>
              </div>
              <span className="shrink-0 text-muted-foreground text-sm tabular-nums">
                {formatTime(row.at)}
              </span>
              <Button
                aria-label={`${messages["attendance.checkout"]}: ${row.name}`}
                className="shrink-0 gap-2"
                disabled={isBusy}
                onClick={() => handleCheckout(row.memberId, row.uniqueId)}
                size="sm"
                variant="outline"
              >
                {isBusy ? <Spinner /> : <LogOutIcon className="size-4" />}
                {messages["attendance.checkout"]}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
