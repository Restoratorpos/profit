import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  BanknoteIcon,
  CreditCardIcon,
  LandmarkIcon,
  TrendingUpIcon,
} from "lucide-react";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  CASHBOX_LABEL,
  CASHBOXES,
  type Cashbox,
  type CashboxBalances,
  formatBalance,
} from "../types";

/**
 * The four figures above the form — what each till holds, and what the shift has
 * taken so far.
 *
 * They lead the page because they are the question the desk asks before typing
 * anything: is there cash in the drawer, did today's takings land. The same tile
 * language the stock screen uses (icon in a muted circle, uppercase label, one
 * large tabular figure) so the two screens read as one product.
 *
 * The three till tiles are also the list's filter. A tile is a button for that
 * reason — not a card with a click handler bolted on that the keyboard can never
 * reach — and clicking the selected one again clears the filter, so there is no
 * "all" tile to invent.
 *
 * Today's tile is a plain figure, not a filter: "what came in since midnight" is
 * a different axis from "which till", and offering it as a fourth filter would
 * imply the four are mutually exclusive when they are not.
 */

const ICON: Record<Cashbox, typeof BanknoteIcon> = {
  card: CreditCardIcon,
  cash: BanknoteIcon,
  transfer: LandmarkIcon,
};

interface CashboxTilesProperties {
  balances: CashboxBalances;
  messages: Messages;
  onSelect: (cashbox: Cashbox | null) => void;
  selected: Cashbox | null;
  today: { expense: string; income: string };
}

export const CashboxTiles = ({
  balances,
  messages,
  onSelect,
  selected,
  today,
}: CashboxTilesProperties) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {CASHBOXES.map((box) => {
      const Icon = ICON[box];
      const balance = balances[box] ?? "0.00";
      const isNegative = Number(balance) < 0;
      const isSelected = selected === box;

      return (
        <Button
          aria-pressed={isSelected}
          className={cn(
            "h-auto flex-1 items-center justify-start gap-3 rounded-xl p-4 text-left",
            isSelected && "border-primary bg-muted/50"
          )}
          key={box}
          // Clicking the active tile clears rather than re-applying — otherwise
          // the only way back to the whole ledger is a control that isn't there.
          onClick={() => onSelect(isSelected ? null : box)}
          type="button"
          variant="outline"
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted",
              isNegative ? "text-destructive" : "text-muted-foreground"
            )}
          >
            <Icon className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-muted-foreground text-xs uppercase tracking-wide">
              {messages[CASHBOX_LABEL[box]]}
            </span>
            <span
              className={cn(
                "block font-semibold text-2xl tabular-nums",
                isNegative && "text-destructive"
              )}
            >
              {formatBalance(balance)}
            </span>
          </span>
        </Button>
      );
    })}

    <div className="flex items-center gap-3 rounded-xl border border-dashed p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <TrendingUpIcon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-muted-foreground text-xs uppercase tracking-wide">
          {messages["tx.todayLabel"]}
        </span>
        {/* Both directions, not a net figure: a day that took 5m and paid out
            5m is not the same day as one where nothing happened. */}
        <span className="flex items-baseline gap-2 font-semibold tabular-nums">
          <span className="text-primary-accent text-xl">
            +{formatBalance(today.income)}
          </span>
          <span className="text-destructive text-sm">
            −{formatBalance(today.expense)}
          </span>
        </span>
      </span>
    </div>
  </div>
);
