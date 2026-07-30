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
  ShoppingCartIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { IdCode } from "@/components/id-code";
import { MoneyInput } from "@/components/money-input";
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
  error: string | null;
  messages: Messages;
  onAmount: (next: string) => void;
  onPaymentType: (next: OrderPaymentType) => void;
  paymentType: OrderPaymentType;
  remaining: number;
}

/** How the balance is being cleared — method, amount, and the two shortcuts. */
const PaymentPanel = ({
  amount,
  disabled,
  error,
  messages,
  onAmount,
  onPaymentType,
  paymentType,
  remaining,
}: PaymentPanelProperties) => (
  <>
    <div
      aria-label={messages["orders.paymentType"]}
      className="grid grid-cols-2 gap-3"
      role="radiogroup"
    >
      {PAYMENT_OPTIONS.map((option) => {
        const active = paymentType === option.value;

        return (
          <Button
            aria-checked={active}
            className={cn("h-16 flex-col gap-1", active && SELECTED_TINT)}
            disabled={disabled}
            key={option.value}
            onClick={() => onPaymentType(option.value)}
            role="radio"
            type="button"
            variant="outline"
          >
            <option.icon className="size-5" />
            {messages[option.labelKey]}
          </Button>
        );
      })}
    </div>

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

    <div className="grid gap-3 sm:grid-cols-2">
      <Button
        disabled={disabled}
        onClick={() => onAmount(toAmount((remaining / 2).toFixed(2)))}
        type="button"
        variant="outline"
      >
        50%
      </Button>
      <Button
        disabled={disabled}
        onClick={() => onAmount(toAmount(remaining.toFixed(2)))}
        type="button"
        variant="outline"
      >
        {messages["orders.full"]}
      </Button>
    </div>
  </>
);

interface DetailBodyProperties {
  amount: string;
  detail: MemberOrderDetail;
  isPaying: boolean;
  locale: Locale;
  messages: Messages;
  onAmount: (next: string) => void;
  onCancel: () => void;
  onPay: () => void;
  onPaymentType: (next: OrderPaymentType) => void;
  payError: string | null;
  paymentType: OrderPaymentType;
}

/** The loaded drawer: history, the money summary, and the pay controls. */
const DetailBody = ({
  amount,
  detail,
  isPaying,
  locale,
  messages,
  onAmount,
  onCancel,
  onPay,
  onPaymentType,
  payError,
  paymentType,
}: DetailBodyProperties) => {
  const remaining = Number(detail.remaining);
  const owes = remaining > 0;

  return (
    <>
      {/* Read-only on purpose: changing what was sold belongs to the edit sheet,
          so a mis-tap here can never rewrite a recorded sale. */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
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

      <div className="flex flex-col gap-4 border-t p-4">
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
          <SummaryRow
            emphasis="debt"
            label={messages["orders.remainingLabel"]}
            value={detail.remaining}
          />
        </dl>

        {owes ? (
          <PaymentPanel
            amount={amount}
            disabled={isPaying}
            error={payError}
            messages={messages}
            onAmount={onAmount}
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

  const handlePay = () => {
    if (!userId) {
      return;
    }

    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      setPayError(messages["orders.amountInvalid"]);
      return;
    }

    setPayError(null);
    payOrders.mutate(
      { amount: value.toFixed(2), paymentType },
      { onError: (cause) => setPayError(cause.message) }
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
        isPaying={isPaying}
        locale={locale}
        messages={messages}
        onAmount={setAmount}
        onCancel={() => onOpenChange(false)}
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
