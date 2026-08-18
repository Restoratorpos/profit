import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import {
  BanknoteIcon,
  CreditCardIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { IdCode } from "@/components/id-code";
import { MoneyInput } from "@/components/money-input";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { useCheckoutMember, usePayCheckoutOrders } from "../api";
import type { OwedItem } from "../types";

type PaymentType = "card" | "cash";

const PAYMENT_OPTIONS: readonly {
  icon: LucideIcon;
  labelKey: keyof Messages;
  value: PaymentType;
}[] = [
  { value: "cash", labelKey: "orders.paymentCash", icon: BanknoteIcon },
  { value: "card", labelKey: "orders.paymentCard", icon: CreditCardIcon },
];

/** The member the confirm dialog is settling — null when it is closed. */
export interface CheckoutTarget {
  /** What the balance is made of, most-bought first. */
  items: OwedItem[];
  memberId: string;
  name: string;
  /** Outstanding shop/bar balance, a decimal string. */
  remaining: string;
  uniqueId: string | null;
}

/**
 * The tab as one readable line — "Snickers × 2, Cola".
 *
 * One line, not a table: the desk reads this with a person standing in front of
 * them, and "what did I buy?" is answered by names and counts. The amounts are
 * already the figure beside it, and the pay drawer holds the full breakdown.
 *
 * A quantity of one is left off. "Cola × 1" is longer than "Cola" and says the
 * same thing, and most lines on a gym tab are ones.
 */
export const owedItemsLine = (items: readonly OwedItem[]): string =>
  items
    .map((item) =>
      item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name
    )
    .join(", ");

interface CheckoutDialogProperties {
  messages: Messages;
  onClose: () => void;
  target: CheckoutTarget | null;
}

const toWhole = (value: string): string => String(Math.round(Number(value) || 0));

/**
 * Confirm-before-checkout: a member is leaving with a shop tab open. The desk
 * either settles it and walks them out, or waves them out with it still owing.
 *
 * Both buttons end in a forced checkout — the difference is whether a payment is
 * taken first. It is order debt only; a membership balance never reaches here.
 */
export const CheckoutDialog = ({
  messages,
  onClose,
  target,
}: CheckoutDialogProperties) => {
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pay = usePayCheckoutOrders();
  const checkout = useCheckoutMember();

  /*
   * Default the amount to the whole balance — settling in full is the common
   * case. Keyed off the member so reopening the dialog for someone else refills
   * it rather than keeping the last person's figure.
   */
  const memberId = target?.memberId ?? null;
  const remaining = target?.remaining ?? "0";

  useEffect(() => {
    if (memberId) {
      setAmount(toWhole(remaining));
      setError(null);
      setPaymentType("cash");
    }
  }, [memberId, remaining]);

  const isBusy = pay.isPending || checkout.isPending;
  const itemsLine = owedItemsLine(target?.items ?? []);

  const handlePayAndCheckout = async () => {
    if (!target) {
      return;
    }

    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      setError(messages["orders.amountInvalid"]);
      return;
    }

    setError(null);

    try {
      await pay.mutateAsync({
        amount: Math.max(value, 0).toFixed(2),
        memberId: target.memberId,
        paymentType,
      });
      await checkout.mutateAsync({ force: true, memberId: target.memberId });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const handleCheckoutAnyway = async () => {
    if (!target) {
      return;
    }

    setError(null);

    try {
      await checkout.mutateAsync({ force: true, memberId: target.memberId });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={target !== null}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {target?.name}
            {target?.uniqueId ? <IdCode code={target.uniqueId} /> : null}
          </DialogTitle>
          <DialogDescription>
            {messages["attendance.owesForOrders"]}:{" "}
            <span className="font-semibold text-destructive">
              {formatMoney(remaining)}
            </span>
          </DialogDescription>
          {/* What the figure above is for. Without it the desk has to open the
              orders drawer to answer the only question the member will ask. */}
          {itemsLine === "" ? null : (
            <p className="text-muted-foreground text-sm">
              {messages["attendance.boughtItems"]}: {itemsLine}
            </p>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div
            aria-label={messages["orders.paymentType"]}
            className="flex gap-2"
            role="radiogroup"
          >
            {PAYMENT_OPTIONS.map((option) => {
              const active = paymentType === option.value;

              return (
                <Button
                  aria-checked={active}
                  className={cn("flex-1 gap-2", active && SELECTED_TINT)}
                  disabled={isBusy}
                  key={option.value}
                  onClick={() => setPaymentType(option.value)}
                  role="radio"
                  type="button"
                  variant="outline"
                >
                  <option.icon className="size-4" />
                  {messages[option.labelKey]}
                </Button>
              );
            })}
          </div>

          <Field data-invalid={Boolean(error) || undefined}>
            <FieldLabel htmlFor="checkout-amount">
              {messages["orders.amountLabel"]}
            </FieldLabel>
            <MoneyInput
              aria-invalid={Boolean(error)}
              disabled={isBusy}
              id="checkout-amount"
              onChange={(next) => {
                setAmount(next);
                setError(null);
              }}
              placeholder="0"
              value={amount}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            disabled={isBusy}
            onClick={handlePayAndCheckout}
            type="button"
          >
            {pay.isPending ? <Spinner /> : null}
            {messages["attendance.payAndCheckout"]}
          </Button>
          <Button
            className="w-full"
            disabled={isBusy}
            onClick={handleCheckoutAnyway}
            type="button"
            variant="outline"
          >
            {checkout.isPending && !pay.isPending ? <Spinner /> : null}
            {messages["attendance.checkoutAnyway"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
