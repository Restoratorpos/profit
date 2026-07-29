import { formatPhone } from "@repo/auth/lib/countries";
import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Field, FieldLabel } from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Separator } from "@repo/design-system/components/ui/separator";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { SELECTED_FILL } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import {
  BanknoteIcon,
  CreditCardIcon,
  LandmarkIcon,
  type LucideIcon,
  WalletIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import { usePayWorker, useWorkerPayroll } from "../api";
import {
  formatHours,
  formatMonth,
  formatStamp,
  initialOf,
  monthOptions,
  positionLabelKey,
  type SalaryMethod,
  type SalaryPaymentView,
  type WorkerListItem,
  type WorkerPayroll,
} from "../types";

const METHOD_OPTIONS: readonly {
  icon: LucideIcon;
  labelKey: keyof Messages;
  value: SalaryMethod;
}[] = [
  { value: "cash", labelKey: "workers.payCash", icon: BanknoteIcon },
  { value: "card", labelKey: "workers.payCard", icon: CreditCardIcon },
  { value: "transfer", labelKey: "workers.payTransfer", icon: LandmarkIcon },
];

/** How many of the month's payments the panel lists before it stops. */
const HISTORY_SHOWN = 4;

/** One labelled figure on the summary side. */
const SummaryRow = ({
  hint,
  label,
  value,
}: {
  hint?: string | null;
  label: string;
  value: string;
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-muted-foreground text-sm">{label}</span>
    <span className="text-right">
      <span className="font-medium tabular-nums">{value}</span>
      {hint ? (
        <span className="block text-muted-foreground text-xs tabular-nums">
          {hint}
        </span>
      ) : null}
    </span>
  </div>
);

/** The month's wages already handed over, newest first. */
const PaymentHistory = ({
  locale,
  messages,
  payments,
}: {
  locale: Locale;
  messages: Messages;
  payments: SalaryPaymentView[];
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-muted-foreground text-xs">
      {messages["workers.payHistory"]}
    </span>

    {payments.length === 0 ? (
      <span className="text-muted-foreground text-sm">
        {messages["workers.payNoHistory"]}
      </span>
    ) : (
      payments.slice(0, HISTORY_SHOWN).map((payment) => (
        <div
          className="flex items-baseline justify-between gap-3 text-sm"
          key={payment.id}
        >
          <span className="text-muted-foreground">
            {formatStamp(payment.paidAt, locale)}
          </span>
          <span className="tabular-nums">{formatMoney(payment.amount)}</span>
        </div>
      ))
    )}
  </div>
);

/**
 * The figures the amount depends on: hours, earned, already given, and what is
 * left. Read-only — nothing here writes, so nothing here can be got wrong by
 * pressing it.
 */
const PayrollSummary = ({
  locale,
  messages,
  payroll,
}: {
  locale: Locale;
  messages: Messages;
  payroll: WorkerPayroll;
}) => {
  const remaining = Number(payroll.remaining ?? 0);

  return (
    <>
      <SummaryRow
        label={messages["workers.colHours"]}
        value={formatHours(payroll.minutesWorked)}
      />

      {/* A monthly salary is the whole month's from its first day — true, and
          the wrong figure to hand over on the 5th. The hint underneath says
          what has actually accrued so far. */}
      <SummaryRow
        hint={
          payroll.accrued
            ? `${messages["workers.payAccrued"]}: ${formatMoney(payroll.accrued)}`
            : null
        }
        label={messages["workers.payEarned"]}
        value={formatMoney(payroll.earned)}
      />

      <SummaryRow
        label={messages["workers.payPaidAlready"]}
        value={formatMoney(payroll.paid)}
      />

      <Separator />

      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-sm">
          {remaining < 0
            ? messages["workers.payOverpaid"]
            : messages["workers.payRemaining"]}
        </span>
        <span
          className={cn(
            "font-bold text-xl tabular-nums",
            remaining > 0 ? "text-primary-accent" : "text-muted-foreground"
          )}
        >
          {formatMoney(String(Math.abs(remaining)))}
        </span>
      </div>

      <PaymentHistory
        locale={locale}
        messages={messages}
        payments={payroll.payments}
      />
    </>
  );
};

interface PayWorkerDialogProperties {
  /** The month the pay window opens on — whichever the list is showing. */
  defaultPeriod: string;
  locale: Locale;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  /** The worker being paid; null keeps the window closed. */
  worker: WorkerListItem | null;
}

/**
 * Handing a wage over.
 *
 * Two halves on purpose. The left states the case — who this is, what they are
 * paid, what they worked, what they have earned and what has already been given
 * — and the right is the only part that writes anything. The desk should never
 * have to remember a figure from another screen to fill this one in, so every
 * number the amount depends on is in view beside it.
 *
 * The month is a field rather than an assumption. A wage is earned in one month
 * and usually handed over in the next, and `paid_at` alone cannot tell those
 * apart — see `apps/backend/src/lib/payroll.ts`. It is prefilled with the month
 * the list is showing, which is the right answer nearly every time.
 */
export const PayWorkerDialog = ({
  defaultPeriod,
  locale,
  messages,
  onOpenChange,
  worker,
}: PayWorkerDialogProperties) => {
  const [period, setPeriod] = useState(defaultPeriod);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<SalaryMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const workerId = worker?.id ?? null;

  /*
   * The figures follow the month, so they are keyed by it rather than derived
   * from the row behind — that row was computed over the list's *range*, which
   * is not necessarily the month being settled.
   *
   * Keying by the month is also what makes "a slow reply for an old month must
   * not overwrite a newer one" structural rather than a flag to maintain.
   */
  const { data: payroll, isPending: isLoading } = useWorkerPayroll(
    workerId,
    period
  );

  const payWorker = usePayWorker();
  const isPending = payWorker.isPending;

  const remaining = Number(payroll?.remaining ?? 0);
  const isHourly = worker?.salaryType === "hourly";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!workerId) {
      return;
    }

    const value = Number(amount.replace(/\s/g, ""));

    if (!(Number.isFinite(value) && value > 0)) {
      setError(messages["workers.payAmountRequired"]);
      return;
    }

    setError(null);

    payWorker.mutate(
      {
        input: {
          amount: String(value),
          method,
          note: note.trim() || undefined,
          period,
        },
        workerId,
      },
      {
        // The mutation invalidates the worker queries, so the list's
        // earned/paid/balance columns and this dialog's own figures both
        // refresh without being told to.
        onSuccess: () => onOpenChange(false),
        onError: (cause) =>
          setError(cause.message || messages["workers.payFailed"]),
      }
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={worker !== null}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WalletIcon className="size-5" />
            {messages["workers.payTitle"]}
          </DialogTitle>
          <DialogDescription>{formatMonth(period, locale)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Left: who this is and what the money is for. Reads only. */}
          <section
            aria-busy={isLoading}
            className="flex flex-col gap-4 rounded-xl border bg-muted/30 p-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary-accent">
                {initialOf(worker?.name ?? "")}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{worker?.name}</p>
                <p className="truncate text-muted-foreground text-sm">
                  {worker?.phone ? formatPhone(worker.phone) : "—"}
                </p>
              </div>
              {worker ? (
                <Badge className="ml-auto shrink-0" variant="outline">
                  {messages[positionLabelKey(worker.role)]}
                </Badge>
              ) : null}
            </div>

            <Separator />

            <SummaryRow
              label={messages["workers.payRate"]}
              value={`${formatMoney(worker?.salaryAmount ?? "0")} / ${
                isHourly
                  ? messages["workers.perHour"]
                  : messages["workers.perMonth"]
              }`}
            />

            {payroll && !isLoading ? (
              <PayrollSummary
                locale={locale}
                messages={messages}
                payroll={payroll}
              />
            ) : (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            )}
          </section>

          {/* Right: the payment itself. */}
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <fieldset className="flex flex-col gap-4" disabled={isPending}>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Field>
                <FieldLabel htmlFor="pay-period">
                  {messages["workers.payPeriod"]}
                </FieldLabel>
                <Select onValueChange={setPeriod} value={period}>
                  <SelectTrigger id="pay-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {monthOptions().map((option) => (
                        <SelectItem key={option} value={option}>
                          {formatMonth(option, locale)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="pay-amount">
                  {messages["workers.payAmount"]} *
                </FieldLabel>
                <Input
                  autoComplete="off"
                  id="pay-amount"
                  inputMode="decimal"
                  onChange={(event) => setAmount(event.target.value)}
                  value={amount}
                />
              </Field>

              {/* Paying off what is left is the common case, so it is one tap
                  rather than a figure to copy across from the panel. */}
              {remaining > 0 && !isLoading ? (
                <Button
                  className="w-fit"
                  onClick={() => setAmount(String(remaining))}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {formatMoney(String(remaining))}
                </Button>
              ) : null}

              <Field>
                <FieldLabel htmlFor="pay-method">
                  {messages["workers.payMethod"]}
                </FieldLabel>
                <div
                  aria-label={messages["workers.payMethod"]}
                  className="grid grid-cols-3 gap-2"
                  id="pay-method"
                  role="radiogroup"
                >
                  {METHOD_OPTIONS.map((option) => {
                    const isActive = method === option.value;

                    return (
                      <Button
                        aria-checked={isActive}
                        className={cn(isActive && SELECTED_FILL)}
                        key={option.value}
                        onClick={() => setMethod(option.value)}
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
              </Field>

              <Field>
                <FieldLabel htmlFor="pay-note">
                  {messages["workers.payNote"]}
                </FieldLabel>
                <Input
                  autoComplete="off"
                  id="pay-note"
                  maxLength={255}
                  onChange={(event) => setNote(event.target.value)}
                  value={note}
                />
              </Field>
            </fieldset>

            <DialogFooter className="mt-auto flex-row gap-2">
              <Button
                className="flex-1"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                {messages["common.cancel"]}
              </Button>
              <Button className="flex-1" disabled={isPending} type="submit">
                {isPending ? <Spinner /> : null}
                {messages["workers.pay"]}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
