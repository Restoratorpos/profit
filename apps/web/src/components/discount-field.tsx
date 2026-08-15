import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import { MoneyInput } from "@/components/money-input";
import type { DiscountDraft, DiscountKind } from "@/lib/discount";
import type { Messages } from "@/lib/i18n/dictionary";

/** Percent points, at most two decimals, capped at 100 — what the box accepts. */
const toPercent = (value: string): string => {
  const cleaned = value.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const bare =
    dot === -1
      ? cleaned
      : `${cleaned.slice(0, dot)}.${cleaned
          .slice(dot + 1)
          .replace(/\./g, "")
          .slice(0, 2)}`;

  return Number(bare) > 100 ? "100" : bare;
};

/**
 * A discount: how much, and whether that is a rate or a figure.
 *
 * One control for both because they answer the same question — "how much off" —
 * and a desk that had to find a different box for "10%" than for "20,000" would
 * be a desk making the arithmetic decision before the pricing one.
 *
 * The unit toggle sits inside the field rather than beside it, so the two read as
 * one answer. Switching unit keeps what was typed: 10 means 10% or 10 UZS
 * depending on the toggle, and re-typing it to change your mind is a keystroke
 * tax on a change of mind.
 *
 * The amount side reuses `MoneyInput`, so a discount groups its digits exactly
 * like every other money box in the product. The percent side cannot — grouping
 * "10" is nothing, and a percentage with a thousands separator is a typo.
 */
export const DiscountField = ({
  disabled,
  id,
  messages,
  onChange,
  value,
}: {
  disabled?: boolean;
  id?: string;
  messages: Messages;
  onChange: (next: DiscountDraft) => void;
  value: DiscountDraft;
}) => {
  const setKind = (kind: DiscountKind) => {
    // Re-cleaned on the way across: "10,000" typed as an amount is not a
    // percentage, and 100 is where a percentage stops.
    onChange({
      kind,
      value: kind === "percent" ? toPercent(value.value) : value.value,
    });
  };

  return (
    <div className="flex items-center gap-2">
      {value.kind === "percent" ? (
        <Input
          aria-label={messages["orders.discountLabel"]}
          className="flex-1"
          disabled={disabled}
          id={id}
          inputMode="decimal"
          onChange={(event) =>
            onChange({ ...value, value: toPercent(event.target.value) })
          }
          placeholder={messages["orders.discountLabel"]}
          value={value.value}
        />
      ) : (
        <MoneyInput
          aria-label={messages["orders.discountLabel"]}
          className="flex-1"
          disabled={disabled}
          id={id}
          onChange={(next) => onChange({ ...value, value: next })}
          placeholder={messages["orders.discountLabel"]}
          value={value.value}
        />
      )}

      {/* Two radios, not a dropdown: there are exactly two units and both fit. */}
      <div
        aria-label={messages["orders.discountUnit"]}
        className="flex items-center gap-1 rounded-lg bg-muted p-1"
        role="radiogroup"
      >
        {(
          [
            { kind: "percent", label: "%" },
            { kind: "amount", label: messages["common.currency"] },
          ] as const
        ).map((unit) => {
          const active = value.kind === unit.kind;

          return (
            <Button
              aria-checked={active}
              className={cn(
                "px-3",
                active ? SELECTED_TINT : "text-muted-foreground"
              )}
              disabled={disabled}
              key={unit.kind}
              onClick={() => setKind(unit.kind)}
              role="radio"
              size="sm"
              type="button"
              variant={active ? "outline" : "ghost"}
            >
              {unit.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
