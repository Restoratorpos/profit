import { Button } from "@repo/design-system/components/ui/button";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import {
  BanknoteIcon,
  ClockIcon,
  CreditCardIcon,
  GiftIcon,
  type LucideIcon,
  MinusIcon,
  PercentIcon,
  PlusIcon,
  ShoppingCartIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { DiscountField } from "@/components/discount-field";
import { MoneyInput } from "@/components/money-input";
import { type DiscountDraft, hasDiscount } from "@/lib/discount";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  type CartLine,
  canTypeAmount,
  isFinalLeg,
  needsTill,
  type OrderCheckoutType,
  type PaymentLeg,
  priceOf,
  settlementOf,
  type Till,
  visibleLegCount,
} from "../types";

/**
 * How the sale is settled. The same four tiles a plan sale offers, so "qarz"
 * means one thing across the product.
 *
 * `debt` and `free` are the two that take nothing at the till, and they are not
 * the same: a comp is square the moment it is rung up, a credit sale owes its
 * whole total. Neither is expressible as an amount, which is why both are
 * methods rather than a number typed into the box.
 *
 * Paying *part* of a sale is a till with less than the total typed. What that
 * leaves short is the qoldiq, and it gets this same list of answers below.
 */
const PAYMENT_OPTIONS: readonly {
  icon: LucideIcon;
  labelKey: keyof Messages;
  value: OrderCheckoutType;
}[] = [
  { value: "cash", labelKey: "orders.paymentCash", icon: BanknoteIcon },
  { value: "card", labelKey: "orders.paymentCard", icon: CreditCardIcon },
  { value: "debt", labelKey: "orders.paymentDebt", icon: ClockIcon },
  { value: "free", labelKey: "orders.paymentFree", icon: GiftIcon },
];

/** Where a part payment against a qarz landed. Only real drawers, by definition. */
const TILL_OPTIONS: readonly {
  icon: LucideIcon;
  labelKey: keyof Messages;
  value: Till;
}[] = [
  { value: "cash", labelKey: "orders.paymentCash", icon: BanknoteIcon },
  { value: "card", labelKey: "orders.paymentCard", icon: CreditCardIcon },
];

/** What a leg's amount box reads: the rest, what was typed, or nothing. */
const legAmountValue = (
  leg: PaymentLeg,
  outstanding: number,
  isFixed: boolean
): string => {
  if (isFixed) {
    return formatMoney(Math.max(outstanding, 0).toFixed(2));
  }

  return canTypeAmount(leg.method) ? leg.amount : "";
};

/**
 * One way the sale is being settled: the four tiles and an amount.
 *
 * The same control however many times it appears, because a second or third leg
 * asks exactly the question the first one did — the only difference is that its
 * blank box means "the rest of what is left" rather than "the whole total".
 */
const PaymentLegFields = ({
  disabled,
  discount,
  index,
  isFinal,
  leg,
  messages,
  onAmount,
  onDiscount,
  onMethod,
  onTill,
  outstanding,
}: {
  disabled: boolean;
  /** The sale's discount, drawn under the first leg's tiles. */
  discount: DiscountDraft;
  index: number;
  /**
   * The third and last. It takes whatever is left and cannot be typed into —
   * there is no fourth row to carry a shortfall, so letting the desk enter less
   * would be offering to leave money somewhere that does not exist. Only its
   * method is a choice.
   */
  isFinal: boolean;
  leg: PaymentLeg;
  messages: Messages;
  onAmount: (next: string) => void;
  onDiscount: (next: DiscountDraft) => void;
  onMethod: (next: OrderCheckoutType) => void;
  onTill: (next: Till) => void;
  /** What is still unpaid when this leg is reached — its placeholder. */
  outstanding: number;
}) => {
  // Only a comp switches the box off: it charges nothing, so there is no figure
  // to enter. A qarz keeps it — a part payment against a credit sale is
  // ordinary — and an empty one simply takes nothing.
  const canType = canTypeAmount(leg.method);
  const isFixed = isFinal && leg.method !== "debt" && canType;
  const asksTill = needsTill(leg, index);
  const [isDiscounting, setDiscounting] = useState(false);

  return (
    <>
      <div
        aria-label={messages["orders.paymentType"]}
        className="grid grid-cols-2 gap-2"
        role="radiogroup"
      >
        {PAYMENT_OPTIONS.map((option) => {
          const active = leg.method === option.value;

          return (
            <Button
              aria-checked={active}
              className={cn("h-14 flex-col gap-1", active && SELECTED_TINT)}
              disabled={disabled}
              key={option.value}
              onClick={() => onMethod(option.value)}
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

      {/* On the first leg only, directly under the methods: the discount belongs
          to the sale rather than to one way of paying for it, and every figure
          below — each leg's placeholder, the qoldiq, what is left owing — is
          measured from the discounted total. Asked for rather than offered, and
          it opens itself when one is already entered. */}
      {index === 0 && (isDiscounting || hasDiscount(discount)) ? (
        <DiscountField
          disabled={disabled}
          id="order-discount"
          messages={messages}
          onChange={onDiscount}
          value={discount}
        />
      ) : null}

      {/* Kept mounted while a comp or a qarz is selected, only disabled — the
          amount stays visible so switching back does not lose what was typed.
          The final leg shows the rest as a fact rather than a field: read-only,
          and no "Hammasi" to press, because there is nothing else it could be. */}
      <div className="flex gap-2">
        <MoneyInput
          aria-label={messages["orders.amountLabel"]}
          className={cn("flex-1", isFixed && "text-muted-foreground")}
          disabled={disabled || !canType}
          onChange={onAmount}
          placeholder={
            // A qarz's blank box takes nothing; a till's takes whatever is left.
            canType && leg.method !== "debt"
              ? formatMoney(Math.max(outstanding, 0).toFixed(2))
              : formatMoney("0")
          }
          readOnly={isFixed}
          value={legAmountValue(leg, outstanding, isFixed)}
        />
        {/*
         * "To'liq" is gone from beside the box. It re-typed what the
         * placeholder already promises: a blank leg takes whatever is still
         * outstanding, so pressing it changed the figure on screen and nothing
         * about the sale.
         *
         * Its place goes to the discount, which is the thing the desk actually
         * reaches for here, and only on the first leg — the sale has one
         * discount however many ways it is split.
         */}
        {index === 0 ? (
          <Button
            aria-label={messages["orders.discountLabel"]}
            aria-pressed={isDiscounting || hasDiscount(discount)}
            className={cn(
              (isDiscounting || hasDiscount(discount)) && SELECTED_TINT
            )}
            disabled={disabled}
            onClick={() => setDiscounting((current) => !current)}
            size="icon"
            title={messages["orders.discountLabel"]}
            type="button"
            variant="outline"
          >
            <PercentIcon className="size-4" />
          </Button>
        ) : null}
      </div>

      {/* A qarz names no drawer, so a part payment against one has to say where
          it went — otherwise the buyer's debt comes out right while the cashbox
          is quietly short by whatever they handed over. */}
      {asksTill ? (
        <div
          aria-label={messages["orders.receivedAs"]}
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
        >
          {TILL_OPTIONS.map((option) => {
            const active = (leg.till ?? "cash") === option.value;

            return (
              <Button
                aria-checked={active}
                className={cn(active && SELECTED_TINT)}
                disabled={disabled}
                key={option.value}
                onClick={() => onTill(option.value)}
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
      ) : null}
    </>
  );
};

const CartRow = ({
  line,
  messages,
  onQty,
  onRemove,
}: {
  line: CartLine;
  messages: Messages;
  onQty: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
}) => (
  <li className="flex items-center gap-2">
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium">{line.product.name}</p>
      <p className="text-muted-foreground text-sm">
        {formatMoney((priceOf(line.product) * line.quantity).toFixed(2))}
      </p>
    </div>
    <Button
      aria-label={messages["orders.decrease"]}
      className="size-7"
      onClick={() => onQty(line.product.id, -1)}
      size="icon"
      type="button"
      variant="outline"
    >
      <MinusIcon className="size-4" />
    </Button>
    <span className="w-6 text-center font-semibold">{line.quantity}</span>
    <Button
      aria-label={messages["orders.increase"]}
      className="size-7"
      onClick={() => onQty(line.product.id, 1)}
      size="icon"
      type="button"
      variant="outline"
    >
      <PlusIcon className="size-4" />
    </Button>
    <Button
      aria-label={messages["common.delete"]}
      className="size-7 text-muted-foreground hover:text-destructive"
      onClick={() => onRemove(line.product.id)}
      size="icon"
      type="button"
      variant="ghost"
    >
      <Trash2Icon className="size-4" />
    </Button>
  </li>
);

export const OrderSummary = ({
  cart,
  discount,
  error,
  gross,
  isPending,
  legs,
  messages,
  onCheckout,
  onDiscount,
  onLegAmount,
  onLegMethod,
  onLegTill,
  onQty,
  onRemove,
  total,
}: {
  cart: readonly CartLine[];
  /** What the desk has typed into the discount box, rate or figure. */
  discount: DiscountDraft;
  error: string | null;
  /** The cart before any discount — what the lines add up to. */
  gross: number;
  isPending: boolean;
  /** How the sale is being settled, in order. Grows as the desk splits it. */
  legs: readonly PaymentLeg[];
  messages: Messages;
  onCheckout: () => void;
  onDiscount: (next: DiscountDraft) => void;
  onLegAmount: (index: number, next: string) => void;
  onLegMethod: (index: number, next: OrderCheckoutType) => void;
  onLegTill: (index: number, next: Till) => void;
  onQty: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
  /** The cart after the discount — what is actually being settled. */
  total: number;
}) => {
  const { applied, remaining } = settlementOf(total, legs);
  const shown = visibleLegCount(total, legs);
  const discountTaken = gross - total;

  return (
    /*
     * Never taller than the screen, whatever is in it.
     *
     * A cart of ten lines used to make this card ten lines tall and push
     * "Rasmiylashtirish" past the bottom of the display — the one button the
     * screen exists to reach, gone, on the small terminals where it matters
     * most. So the card is capped at the viewport, the *lines* take whatever is
     * left over and scroll inside it, and everything the desk decides with —
     * the total, the payment tiles, the button — is pinned below them and
     * always on screen.
     *
     * `lg:sticky lg:top-0` keeps it there while the product grid scrolls beside
     * it. `lg:self-start` is what stops it stretching to the row's full height
     * on a two-line order, which would be a lot of border around nothing.
     *
     * `lg:shrink-0` so a wide product grid cannot squeeze it — the amount box
     * and the four payment buttons need their width more than the tiles do.
     */
    <aside className="flex max-h-[calc(100svh-5rem)] w-full flex-col gap-4 rounded-2xl border bg-background p-5 sm:max-h-[calc(100svh-8rem)] lg:sticky lg:top-4 lg:w-96 lg:shrink-0 lg:self-start">
      <h2 className="flex shrink-0 items-center gap-2 font-semibold text-lg">
        <ShoppingCartIcon className="size-5 text-primary-accent" />
        {messages["orders.summaryTitle"]}
      </h2>

      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ShoppingCartIcon className="size-10 opacity-40" />
          <p>{messages["orders.summaryEmpty"]}</p>
        </div>
      ) : (
        <>
          {/*
           * The only thing that scrolls. `min-h-0` is load-bearing: a flex child
           * defaults to `min-height:auto` and refuses to shrink below its own
           * content, so without it the list would push the footer out of the
           * card instead of scrolling — the exact bug this layout is fixing.
           *
           * The negative margin with matching padding lets rows reach the card's
           * edge while the scrollbar sits clear of the content.
           */}
          <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
            {cart.map((line) => (
              <CartRow
                key={line.product.id}
                line={line}
                messages={messages}
                onQty={onQty}
                onRemove={onRemove}
              />
            ))}
          </ul>

          {/*
           * Everything the sale is decided with, pinned under the scrolling
           * list. `shrink-0` is the pinning: a flex child shrinks by default, so
           * on a long cart this block would compress instead of the list
           * scrolling, and the button would be squeezed rather than moved.
           */}
          <div className="flex shrink-0 flex-col gap-4">
            {/* Only shown once something is actually off: on a full-price sale a
              subtotal identical to the total is a line that says nothing twice. */}
            {discountTaken > 0 ? (
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {messages["orders.subtotalLabel"]}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(gross.toFixed(2))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-primary-accent">
                  <span>{messages["orders.discountLabel"]}</span>
                  <span className="font-semibold tabular-nums">
                    −{formatMoney(discountTaken.toFixed(2))}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-muted-foreground uppercase tracking-wide">
                {messages["orders.totalLabel"]}
              </span>
              <span className="font-bold text-xl">
                {formatMoney(total.toFixed(2))}
              </span>
            </div>

            {/* One block per leg. The second appears the moment the first is
              short, the third the moment the second is — each one a full set of
              tiles and its own amount, because a split is just this sale being
              rung up again for what is left of it.

              Two by two rather than four across: "To'lanmaydi" does not fit a
              quarter of this panel, and these are finger targets. */}
            {Array.from({ length: shown }, (_, index) => {
              const leg = legs[index] ?? { amount: "", method: "cash" };
              // What is still unpaid when this leg is reached — its own share
              // included, so typing in it does not move its own placeholder.
              const outstanding =
                total -
                applied.slice(0, index).reduce((sum, value) => sum + value, 0);

              return (
                <div
                  className="flex flex-col gap-2"
                  // Positional on purpose: a leg *is* its position in the chain,
                  // and nothing is ever inserted or reordered.
                  // biome-ignore lint/suspicious/noArrayIndexKey: legs are positional
                  key={index}
                >
                  {index > 0 ? (
                    <p className="text-muted-foreground text-sm uppercase tracking-wide">
                      {messages["orders.remainderType"]}
                    </p>
                  ) : null}

                  <PaymentLegFields
                    disabled={isPending}
                    discount={discount}
                    index={index}
                    isFinal={isFinalLeg(index)}
                    leg={leg}
                    messages={messages}
                    onAmount={(next) => onLegAmount(index, next)}
                    onDiscount={onDiscount}
                    onMethod={(next) => onLegMethod(index, next)}
                    onTill={(next) => onLegTill(index, next)}
                    outstanding={outstanding}
                  />
                </div>
              );
            })}

            {remaining > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase tracking-wide">
                  {messages["orders.remainderLabel"]}
                </span>
                <span className="font-semibold text-destructive">
                  {formatMoney(remaining.toFixed(2))}
                </span>
              </div>
            ) : null}

            {error ? (
              <p
                className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <Button
              className="w-full"
              disabled={isPending}
              onClick={onCheckout}
              size="lg"
              type="button"
            >
              {isPending ? <Spinner /> : null}
              {messages["orders.checkout"]}
            </Button>
          </div>
        </>
      )}
    </aside>
  );
};
