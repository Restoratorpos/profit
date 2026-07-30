import { formatPhone } from "@repo/auth/lib/countries";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import {
  BanknoteIcon,
  CreditCardIcon,
  type LucideIcon,
  PercentIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DiscountField } from "@/components/discount-field";
import { IdCode } from "@/components/id-code";
import { MoneyInput } from "@/components/money-input";
import {
  type DiscountDraft,
  discountOf,
  emptyDiscount,
  toDiscountRequest,
} from "@/lib/discount";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import { useMemberOrders, usePayMemberOrders } from "../api";
import {
  dayKeyOf,
  formatDayLabel,
  formatTime,
  type MemberOrderDetail,
  type MemberOrderSummary,
  type MemberOrderView,
  type OrderPaymentType,
} from "../types";

const PAYMENT_OPTIONS: readonly {
  icon: LucideIcon;
  labelKey: keyof Messages;
  value: OrderPaymentType;
}[] = [
  { value: "cash", labelKey: "orders.paymentCash", icon: BanknoteIcon },
  { value: "card", labelKey: "orders.paymentCard", icon: CreditCardIcon },
];

/** A whole-number amount string, the value the amount box holds. */
const toAmount = (value: string): string =>
  String(Math.round(Number(value) || 0));

/** One product line: a bold ×N badge so the count reads at a glance. */
const ItemRow = ({ item }: { item: MemberOrderView["items"][number] }) => (
  <li className="flex items-center gap-3">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted font-bold text-sm tabular-nums">
      ×{item.quantity}
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium">{item.name}</p>
      <p className="text-muted-foreground text-sm">{formatMoney(item.price)}</p>
    </div>
    <span className="shrink-0 font-semibold">
      {formatMoney(item.lineTotal)}
    </span>
  </li>
);

/** One order card: its time, a per-order remaining hint, and its line items. */
const OrderCard = ({
  locale,
  messages,
  order,
}: {
  locale: Locale;
  messages: Messages;
  order: MemberOrderView;
}) => {
  const partlyPaid = Number(order.paid) > 0 && Number(order.remaining) > 0;

  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b pb-2.5">
        <span className="text-muted-foreground text-sm">
          {formatTime(order.createdAt, locale)}
        </span>
        {partlyPaid ? (
          <span className="font-medium text-destructive text-xs">
            {messages["orders.remainingLabel"]}: {formatMoney(order.remaining)}
          </span>
        ) : (
          <span className="flex items-baseline gap-1.5 font-semibold text-sm">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              {messages["orders.totalLabel"]}
            </span>
            {formatMoney(order.total)}
          </span>
        )}
      </div>
      {order.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {formatMoney(order.total)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {order.items.map((item) => (
            <ItemRow item={item} key={item.id} />
          ))}
        </ul>
      )}

      {/* Only when one was given. It sits under the lines because that is where it
          happened: these are the prices, and this came off their sum — without it
          the lines add up to more than the total and the drawer looks wrong. */}
      {order.discount && Number(order.discount) > 0 ? (
        <p className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5 text-primary-accent text-sm">
          <span>{messages["orders.discountLabel"]}</span>
          <span className="font-semibold tabular-nums">
            −{formatMoney(order.discount)}
          </span>
        </p>
      ) : null}
    </div>
  );
};

interface DayGroup {
  key: string;
  label: string;
  orders: MemberOrderView[];
}

/** Orders arrive newest-first, so same-day ones are already adjacent. */
const groupOrdersByDay = (
  orders: readonly MemberOrderView[],
  locale: Locale
): DayGroup[] => {
  const groups: DayGroup[] = [];

  for (const order of orders) {
    const key = dayKeyOf(order.createdAt);
    const last = groups.at(-1);

    if (last && last.key === key) {
      last.orders.push(order);
    } else {
      groups.push({
        key,
        label: formatDayLabel(order.createdAt, locale),
        orders: [order],
      });
    }
  }

  return groups;
};

const SummaryRow = ({
  emphasis,
  label,
  value,
}: {
  emphasis?: "paid" | "debt";
  label: string;
  value: string;
}) => (
  <div className="flex justify-between">
    <dt className="text-muted-foreground text-sm uppercase tracking-wide">
      {label}
    </dt>
    <dd
      className={cn(
        "font-semibold",
        emphasis === "paid" && "text-primary-accent",
        emphasis === "debt" && Number(value) > 0 && "text-destructive"
      )}
    >
      {formatMoney(value)}
    </dd>
  </div>
);

interface PaymentPanelProperties {
  amount: string;
  disabled: boolean;
  /** What the desk is forgiving off the balance, rate or figure, as typed. */
  discount: DiscountDraft;
  /** The money that draft comes to against the outstanding balance. */
  discountTaken: number;
  error: string | null;
  messages: Messages;
  onAmount: (next: string) => void;
  onDiscount: (next: DiscountDraft) => void;
  onPaymentType: (next: OrderPaymentType) => void;
  paymentType: OrderPaymentType;
  /** Still owed after the discount — what the amount box is measured against. */
  remaining: number;
}

/** How the balance is being cleared — what is forgiven, then method and amount. */
const PaymentPanel = ({
  amount,
  disabled,
  discount,
  discountTaken,
  error,
  messages,
  onAmount,
  onDiscount,
  onPaymentType,
  paymentType,
  remaining,
}: PaymentPanelProperties) => {
  /*
   * The discount is asked for, not offered. Most balances are settled at face
   * value, so a box for it sat above the amount on every single payment — and
   * the panel is the one part of this drawer that has to be read at a glance.
   * It opens itself when there is already a discount on the balance, so a
   * reopened drawer never hides a figure that is in force.
   */
  const [isDiscounting, setDiscounting] = useState(false);
  const showDiscount = isDiscounting || discountTaken > 0;

  return (
    <>
      {/* One row of ordinary-height buttons. Two stacked tiles were sized for a
          till's product grid, and this is a form. */}
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
              disabled={disabled}
              key={option.value}
              onClick={() => onPaymentType(option.value)}
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

      {/* Under the methods and above the amount — which is the order it happens
          in: how it is being paid, what comes off, what is left to hand over. */}
      {showDiscount ? (
        <Field>
          <DiscountField
            disabled={disabled}
            id="order-discount"
            messages={messages}
            onChange={onDiscount}
            value={discount}
          />
          {discountTaken > 0 ? (
            <p className="text-primary-accent text-sm tabular-nums">
              −{formatMoney(discountTaken.toFixed(2))}
            </p>
          ) : null}
        </Field>
      ) : null}

      <Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor="order-amount">
          {messages["orders.amountLabel"]}
        </FieldLabel>
        <MoneyInput
          aria-invalid={Boolean(error)}
          disabled={disabled}
          id="order-amount"
          onChange={onAmount}
          placeholder="0"
          value={amount}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>

      {/* The three shortcuts, in the order they are reached for: half, all, and
          the discount — which is a toggle rather than an amount, so it is the
          icon of the set. */}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={disabled}
          onClick={() => onAmount(toAmount((remaining / 2).toFixed(2)))}
          type="button"
          variant="outline"
        >
          50%
        </Button>
        <Button
          className="flex-1"
          disabled={disabled}
          onClick={() => onAmount(toAmount(remaining.toFixed(2)))}
          type="button"
          variant="outline"
        >
          {messages["orders.full"]}
        </Button>
        <Button
          aria-label={messages["orders.discountLabel"]}
          aria-pressed={showDiscount}
          className={cn(showDiscount && SELECTED_TINT)}
          disabled={disabled}
          onClick={() => setDiscounting((current) => !current)}
          size="icon"
          title={messages["orders.discountLabel"]}
          type="button"
          variant="outline"
        >
          <PercentIcon className="size-4" />
        </Button>
      </div>
    </>
  );
};

interface DetailBodyProperties {
  amount: string;
  detail: MemberOrderDetail;
  discount: DiscountDraft;
  isPaying: boolean;
  locale: Locale;
  messages: Messages;
  onAmount: (next: string) => void;
  onCancel: () => void;
  onDiscount: (next: DiscountDraft) => void;
  onPay: () => void;
  onPaymentType: (next: OrderPaymentType) => void;
  payError: string | null;
  paymentType: OrderPaymentType;
}

/** The loaded drawer: history, the money summary, and the pay controls. */
const DetailBody = ({
  amount,
  detail,
  discount,
  isPaying,
  locale,
  messages,
  onAmount,
  onCancel,
  onDiscount,
  onPay,
  onPaymentType,
  payError,
  paymentType,
}: DetailBodyProperties) => {
  const owed = Number(detail.remaining);
  /*
   * A discount here is forgiven debt, so it is taken off the balance and what is
   * left is what there is to pay. Resolved against the outstanding figure rather
   * than the original sale — that is the number on the screen being discounted.
   */
  const discountTaken = discountOf(owed, discount);
  const remaining = Math.max(owed - discountTaken, 0);
  const owes = owed > 0;

  return (
    <>
      {/*
       * One scroller for the history *and* the pay controls, with only the footer
       * pinned. They used to be two blocks, the lower one unshrinkable: on a short
       * screen — a 500px laptop, or a terminal in landscape — the summary and the
       * amount box together were taller than what was left, so the footer and its
       * To'lash button were pushed off the bottom with no way to reach them.
       *
       * The cost is that the balance can scroll out of sight on a very short
       * screen, which is the right trade: a figure you can scroll back to beats a
       * button you cannot press.
       */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        {/* Read-only on purpose: changing what was sold belongs to the edit sheet,
            so a mis-tap here can never rewrite a recorded sale. */}
        {/* Names the list rather than the panel, which is why it sits here and not
            in the header. `nav.orders` rather than a fourth copy of the same
            string — the sidebar item and this label are the same word. */}
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {messages["nav.orders"]}:
        </p>

        {detail.orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {messages["orders.settledNote"]}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {groupOrdersByDay(detail.orders, locale).map((day) => (
              <div className="flex flex-col gap-3" key={day.key}>
                <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                  {day.label}
                </p>
                {day.orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    locale={locale}
                    messages={messages}
                    order={order}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/*
       * The money stays put while the history scrolls behind it — the balance and
       * the amount box are what the desk is working with, and having to scroll
       * back down to them after reading an order is the wrong way round.
       *
       * `shrink-0` pins it; `max-h-[55%]` is what stops it growing past the
       * bottom on a short screen. Both are needed: without the cap a long
       * payment panel pushes the footer and its To'lash button off the display,
       * which is how this panel behaved before and is unusable rather than ugly.
       * Past that height it scrolls within itself instead.
       */}
      <div className="flex max-h-[55%] shrink-0 flex-col gap-4 overflow-y-auto border-t p-4">
        <dl className="flex flex-col gap-1.5 rounded-xl bg-muted p-4">
          <SummaryRow
            label={messages["orders.totalLabel"]}
            value={detail.total}
          />
          <SummaryRow
            emphasis="paid"
            label={messages["orders.paidLabel"]}
            value={detail.paid}
          />
          {/* The discount being typed shows in the summary as well as beside the
              box, because this is the block the desk reads the balance off — and
              once something is forgiven, `remaining` here is the old figure. */}
          {discountTaken > 0 ? (
            <SummaryRow
              label={messages["orders.discountLabel"]}
              value={`-${discountTaken.toFixed(2)}`}
            />
          ) : null}
          <SummaryRow
            emphasis="debt"
            label={messages["orders.remainingLabel"]}
            value={remaining.toFixed(2)}
          />
        </dl>

        {owes ? (
          <PaymentPanel
            amount={amount}
            disabled={isPaying}
            discount={discount}
            discountTaken={discountTaken}
            error={payError}
            messages={messages}
            onAmount={onAmount}
            onDiscount={onDiscount}
            onPaymentType={onPaymentType}
            paymentType={paymentType}
            remaining={remaining}
          />
        ) : (
          <output className="block rounded-xl bg-primary/10 px-4 py-3 text-center font-medium text-primary-accent">
            {messages["orders.settledNote"]}
          </output>
        )}
      </div>

      {/* Pinned: the way out and the way to pay must be reachable at any height. */}
      <SheetFooter className="flex-row gap-3 border-t">
        <Button
          className="flex-1"
          disabled={isPaying}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          {messages["common.cancel"]}
        </Button>
        {owes ? (
          <Button
            className="flex-1"
            disabled={isPaying}
            onClick={onPay}
            type="button"
          >
            {isPaying ? <Spinner /> : null}
            {messages["orders.pay"]}
          </Button>
        ) : null}
      </SheetFooter>
    </>
  );
};

interface OrderDetailSheetProperties {
  locale: Locale;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  summary: MemberOrderSummary | null;
}

export const OrderDetailSheet = ({
  locale,
  messages,
  onOpenChange,
  summary,
}: OrderDetailSheetProperties) => {
  const [paymentType, setPaymentType] = useState<OrderPaymentType>("cash");
  const [amount, setAmount] = useState("");
  /** What is being forgiven off the balance — a rate or a figure, as typed. */
  const [discount, setDiscount] = useState<DiscountDraft>(emptyDiscount);
  const [payError, setPayError] = useState<string | null>(null);

  const userId = summary?.id ?? null;

  /*
   * The fetch, its `cancelled` flag, and the three pieces of state tracking it
   * are all gone. The query is keyed by the member, so a reply for a previous
   * one cannot land here, and reopening a drawer paints from cache.
   */
  const {
    data: detail,
    error: loadError,
    isPending: isLoading,
  } = useMemberOrders(userId);
  const payOrders = usePayMemberOrders(userId ?? "");

  /*
   * The amount box defaults to the whole outstanding balance — settling in full
   * is the common case, and typing it out every time is the cost of the screen.
   * Keyed off `remaining` so it follows a part payment down without clobbering
   * an amount the operator is mid-way through typing for the same balance.
   */
  const remaining = detail?.remaining;

  useEffect(() => {
    if (remaining !== undefined) {
      setAmount(toAmount(remaining));
    }
  }, [remaining]);

  /*
   * The amount follows the discount down. Without this, forgiving 100,000 of a
   * 500,000 balance would leave 500,000 in the box, and the backend — which caps
   * the payment at what is left after the discount — would take 400,000 while the
   * screen said otherwise.
   */
  const owed = Number(detail?.remaining ?? 0);
  const forgiven = discountOf(owed, discount);

  const changeDiscount = (next: DiscountDraft) => {
    setPayError(null);
    setDiscount(next);
    setAmount(toAmount(Math.max(owed - discountOf(owed, next), 0).toFixed(2)));
  };

  const handlePay = () => {
    if (!userId) {
      return;
    }

    const value = Number(amount);

    // A discount that clears the whole balance is a settlement on its own: there
    // is nothing left to hand over, so an empty amount box is not an error.
    if (!Number.isFinite(value) || (value <= 0 && forgiven <= 0)) {
      setPayError(messages["orders.amountInvalid"]);
      return;
    }

    setPayError(null);
    payOrders.mutate(
      {
        amount: Math.max(value, 0).toFixed(2),
        // The rate or figure as entered; the server resolves it against the
        // balance it reads for itself.
        discount: toDiscountRequest(discount),
        paymentType,
      },
      {
        onError: (cause) => setPayError(cause.message),
        // Settled or not, what was forgiven is now recorded — leaving the draft in
        // the box would offer to forgive it a second time.
        onSuccess: () => setDiscount(emptyDiscount()),
      }
    );
  };

  const isPaying = payOrders.isPending;

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <Spinner aria-label={messages["orders.detailTitle"]} />
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <FieldError role="alert">{loadError.message}</FieldError>
        </div>
      );
    }

    if (!detail) {
      return null;
    }

    return (
      <DetailBody
        amount={amount}
        detail={detail}
        discount={discount}
        isPaying={isPaying}
        locale={locale}
        messages={messages}
        onAmount={setAmount}
        onCancel={() => onOpenChange(false)}
        onDiscount={changeDiscount}
        onPay={handlePay}
        onPaymentType={setPaymentType}
        payError={payError}
        paymentType={paymentType}
      />
    );
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={summary !== null}>
      {/* No close button in the corner: the footer's Bekor qilish is the way out
          of this drawer, and Esc and the overlay still close it. The corner is
          the code's now. */}
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        showCloseButton={false}
        side="right"
      >
        {/*
         * The buyer is the header. "Buyurtma tafsilotlari" described the panel
         * to someone who had just clicked a debt figure to open it, and spent
         * the top row saying what they already knew; the name now has it. The
         * status badge went for the same reason — "to'lanmagan" is what the
         * qoldiq figure below already says, with the amount attached.
         */}
        <SheetHeader className="gap-2 border-b">
          {/* The mark on the left and the code on the right are positioned out of
              the flow, so the name is centred on the panel rather than on
              whatever space those two leave it. */}
          <div className="relative flex flex-col items-center gap-1 text-center">
            <span
              aria-hidden="true"
              className="absolute top-0 left-0 flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary-accent"
            >
              <ShoppingCartIcon className="size-5" />
            </span>

            {detail?.member.code ? (
              <span className="absolute top-0 right-0">
                <IdCode code={detail.member.code} />
              </span>
            ) : null}

            <SheetTitle className="max-w-[60%] truncate">
              {summary?.name}
            </SheetTitle>

            {/* Under the name, and text rather than a `tel:` link — the desk
                terminal is a PC. Muted, not accented: the accent colour is what
                every real link in this app is painted with. */}
            <SheetDescription className="tabular-nums">
              {detail?.member.phone ? formatPhone(detail.member.phone) : null}
            </SheetDescription>
          </div>
        </SheetHeader>

        {renderContent()}
      </SheetContent>
    </Sheet>
  );
};
