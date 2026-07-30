import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import { Field, FieldLabel } from "@repo/design-system/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { type FormEvent, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { usePaySupplier } from "../api";
import {
  methodLabel,
  PAYMENT_METHODS,
  type PaymentMethod,
  type SupplierSummary,
} from "../types";

interface PaySupplierSheetProperties {
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  /** The supplier being paid; null keeps the sheet closed. */
  supplier: SupplierSummary | null;
}

/**
 * One figure, one amount box. The money is attributed to specific deliveries
 * underneath — oldest first — but the desk never has to pick one, exactly as the
 * member debt screen works.
 */
export const PaySupplierSheet = ({
  messages,
  onOpenChange,
  supplier,
}: PaySupplierSheetProperties) => {
  const owed = Number(supplier?.remaining ?? 0);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [formError, setFormError] = useState<string | null>(null);
  const paySupplier = usePaySupplier();
  const isPending = paySupplier.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supplier) {
      return;
    }

    const value = Number(amount.replace(/\s/g, ""));

    if (!(Number.isFinite(value) && value > 0)) {
      setFormError(messages["suppliers.payAmount"]);
      return;
    }

    setFormError(null);

    paySupplier.mutate(
      { input: { amount: String(value), method }, supplierId: supplier.id },
      {
        onSuccess: () => {
          setAmount("");
          onOpenChange(false);
        },
        onError: (cause) => setFormError(cause.message),
      }
    );
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(supplier)}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{messages["suppliers.payTitle"]}</SheetTitle>
          <SheetDescription className="truncate">
            {supplier?.name ?? ""}
          </SheetDescription>
        </SheetHeader>

        <form className="contents" onSubmit={handleSubmit}>
          <fieldset
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4"
            disabled={isPending}
          >
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
              <span className="text-muted-foreground text-sm">
                {messages["suppliers.colRemaining"]}
              </span>
              <span className="font-semibold text-lg tabular-nums">
                {formatMoney(supplier?.remaining ?? "0")}
              </span>
            </div>

            <Field>
              <FieldLabel htmlFor="pay-amount">
                {messages["suppliers.payAmount"]} *
              </FieldLabel>
              <MoneyInput id="pay-amount" onChange={setAmount} value={amount} />
            </Field>

            {/* Paying the lot is the common case, so it is one tap rather than
                a figure to copy out of the line above. */}
            <Button
              className="w-fit"
              onClick={() => setAmount(String(owed))}
              size="sm"
              type="button"
              variant="outline"
            >
              {formatMoney(supplier?.remaining ?? "0")}
            </Button>

            <Field>
              <FieldLabel htmlFor="pay-method">
                {messages["inventory.fieldMethod"]}
              </FieldLabel>
              <Select
                onValueChange={(next) => setMethod(next as PaymentMethod)}
                value={method}
              >
                <SelectTrigger id="pay-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PAYMENT_METHODS.map((entry) => (
                      <SelectItem key={entry} value={entry}>
                        {methodLabel(entry, messages)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </fieldset>

          <SheetFooter>
            <Button disabled={isPending} type="submit">
              {isPending ? <Spinner /> : null}
              {messages["suppliers.pay"]}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {messages["common.cancel"]}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
