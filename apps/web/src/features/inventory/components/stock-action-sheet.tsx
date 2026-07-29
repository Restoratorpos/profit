import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { TruckIcon, XIcon } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { CreatableCombobox } from "@/components/creatable-combobox";
import type { ProductListItem } from "@/features/products/types";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  useCreateStockAction,
  useCreateStocktake,
  useCreateSupplier,
} from "../api";
import {
  dialogTitle,
  formatQuantity,
  type InventoryItem,
  methodLabel,
  PAYMENT_METHODS,
  type PaymentMethod,
  type StockAction,
  type SupplierSummary,
} from "../types";

interface StockActionSheetProperties {
  /** Which document is being raised; null keeps the sheet closed. */
  action: StockAction | null;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  products: readonly ProductListItem[];
  stock: readonly InventoryItem[];
  suppliers: readonly SupplierSummary[];
}

/** One editable line. `amount` is a quantity, or a counted total on a stocktake. */
interface Line {
  amount: string;
  productId: string;
  unitCost: string;
}

const toNumber = (value: string): number => {
  const parsed = Number(value.replace(/\s/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * The one form behind all four Amallar entries. They differ in three ways and
 * nothing else — the sign, whether a supplier is involved, and whether the
 * number typed is a movement or a count — so they share a sheet rather than
 * being four near-identical forms that drift apart.
 */
export const StockActionSheet = ({
  action,
  messages,
  onOpenChange,
  products,
  stock,
  suppliers,
}: StockActionSheetProperties) => {
  const [lines, setLines] = useState<Line[]>([]);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const createStockAction = useCreateStockAction();
  const createStocktake = useCreateStocktake();
  const createSupplier = useCreateSupplier();
  const isPending = createStockAction.isPending || createStocktake.isPending;

  const isDelivery = action === "in";
  const isStocktake = action === "stocktake";
  const isReturn = action === "return";

  const stockById = useMemo(
    () => new Map(stock.map((item) => [item.id, item])),
    [stock]
  );

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const reset = () => {
    setLines([]);
    setSupplierId(null);
    setPaidAmount("");
    setMethod("cash");
    setNote("");
    setFormError(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const addLine = (productId: string | null) => {
    if (!productId) {
      return;
    }

    setLines((current) =>
      current.some((line) => line.productId === productId)
        ? current
        : [
            ...current,
            {
              amount: "",
              productId,
              // A delivery defaults to what the product costs today, so the
              // common case — the price has not changed — is one less box to fill.
              unitCost: productById.get(productId)?.cost ?? "",
            },
          ]
    );
  };

  const setLine = (productId: string, changes: Partial<Line>) => {
    setLines((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, ...changes } : line
      )
    );
  };

  const removeLine = (productId: string) => {
    setLines((current) =>
      current.filter((line) => line.productId !== productId)
    );
  };

  const total = lines.reduce(
    (sum, line) => sum + toNumber(line.amount) * toNumber(line.unitCost),
    0
  );

  const stocktakePayload = (filled: readonly Line[]) => ({
    items: filled.map((line) => ({
      counted: String(toNumber(line.amount)),
      productId: line.productId,
    })),
    note: note.trim() || null,
  });

  const documentPayload = (
    documentType: "in" | "return" | "writeoff",
    filled: readonly Line[]
  ) => {
    // Only a delivery takes money, and only when something was actually
    // tendered — an empty box means "on account", not "paid nothing in cash".
    const paid = isDelivery && toNumber(paidAmount) > 0;

    return {
      actionType: documentType,
      items: filled.map((line) => ({
        productId: line.productId,
        quantity: String(toNumber(line.amount)),
        unitCost: line.unitCost.trim()
          ? String(toNumber(line.unitCost))
          : undefined,
      })),
      note: note.trim() || null,
      paidAmount: paid ? String(toNumber(paidAmount)) : undefined,
      paymentMethod: paid ? method : undefined,
      supplierId: isDelivery || isReturn ? supplierId : null,
    };
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!action) {
      return;
    }

    const filled = lines.filter((line) =>
      // A stocktake of zero is a real answer — the shelf is empty — so only a
      // blank box counts as "not filled in" there.
      isStocktake ? line.amount.trim() !== "" : toNumber(line.amount) > 0
    );

    if (filled.length === 0) {
      setFormError(messages["inventory.needLines"]);
      return;
    }

    setFormError(null);

    const handlers = {
      onSuccess: close,
      onError: (cause: Error) => setFormError(cause.message),
    };

    // Narrowed on `action` rather than `isStocktake` so the other three types
    // reach `documentPayload` as the union it accepts.
    if (action === "stocktake") {
      createStocktake.mutate(stocktakePayload(filled), handlers);

      return;
    }

    createStockAction.mutate(documentPayload(action, filled), handlers);
  };

  const available = products.filter(
    (product) => !lines.some((line) => line.productId === product.id)
  );

  return (
    <Sheet
      onOpenChange={(next) => (next ? undefined : close())}
      open={Boolean(action)}
    >
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>{action ? dialogTitle(action, messages) : ""}</SheetTitle>
          <SheetDescription className="sr-only">
            {action ? dialogTitle(action, messages) : ""}
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

            {isDelivery || isReturn ? (
              <Field>
                <FieldLabel htmlFor="stock-supplier">
                  {messages["inventory.colSupplier"]}
                  {isReturn ? " *" : ""}
                </FieldLabel>
                <CreatableCombobox
                  emptyLabel={messages["common.none"]}
                  icon={TruckIcon}
                  id="stock-supplier"
                  onCreate={async (label) => {
                    try {
                      const created = await createSupplier.mutateAsync({
                        supplier: label,
                      });

                      return { value: created.id };
                    } catch (cause) {
                      return { error: (cause as Error).message };
                    }
                  }}
                  onSelect={setSupplierId}
                  options={suppliers.map((supplier) => ({
                    label: supplier.name,
                    value: supplier.id,
                  }))}
                  placeholder={messages["inventory.colSupplier"]}
                  searchPlaceholder={messages["products.searchOrCreate"]}
                  value={supplierId}
                />
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="stock-product">
                {messages["inventory.addLine"]}
              </FieldLabel>
              <CreatableCombobox
                emptyLabel={messages["inventory.pickProduct"]}
                id="stock-product"
                // Select-only: a product that does not exist yet belongs in the
                // catalog, not invented halfway through counting a shelf.
                onSelect={addLine}
                options={available.map((product) => ({
                  label: product.name,
                  value: product.id,
                }))}
                placeholder={messages["inventory.pickProduct"]}
                searchPlaceholder={messages["products.search"]}
                value={null}
              />
            </Field>

            <div className="flex flex-col gap-3">
              {lines.map((line) => {
                const product = productById.get(line.productId);
                const onHand = stockById.get(line.productId);

                return (
                  <div className="rounded-lg border p-3" key={line.productId}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {product?.name ?? line.productId}
                        </p>
                        <p className="text-muted-foreground text-sm tabular-nums">
                          {messages["inventory.onHand"]}:{" "}
                          {formatQuantity(onHand?.stock ?? 0)}
                          {product?.unit ? ` ${product.unit}` : ""}
                        </p>
                      </div>
                      <Button
                        aria-label={messages["inventory.remove"]}
                        className="text-muted-foreground"
                        onClick={() => removeLine(line.productId)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon className="size-5" />
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor={`qty-${line.productId}`}>
                          {isStocktake
                            ? messages["inventory.fieldCounted"]
                            : messages["inventory.fieldQuantity"]}
                        </FieldLabel>
                        <Input
                          id={`qty-${line.productId}`}
                          inputMode="decimal"
                          onChange={(event) =>
                            setLine(line.productId, {
                              amount: event.target.value,
                            })
                          }
                          value={line.amount}
                        />
                      </Field>

                      {isStocktake ? null : (
                        <Field>
                          <FieldLabel htmlFor={`cost-${line.productId}`}>
                            {messages["inventory.fieldUnitCost"]}
                          </FieldLabel>
                          <Input
                            id={`cost-${line.productId}`}
                            inputMode="decimal"
                            onChange={(event) =>
                              setLine(line.productId, {
                                unitCost: event.target.value,
                              })
                            }
                            value={line.unitCost}
                          />
                        </Field>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {isStocktake ? null : (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                <span className="text-muted-foreground text-sm">
                  {messages["inventory.docTotal"]}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(total.toFixed(2))}
                </span>
              </div>
            )}

            {isDelivery ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="stock-paid">
                    {messages["inventory.fieldPaid"]}
                  </FieldLabel>
                  <Input
                    id="stock-paid"
                    inputMode="decimal"
                    onChange={(event) => setPaidAmount(event.target.value)}
                    value={paidAmount}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="stock-method">
                    {messages["inventory.fieldMethod"]}
                  </FieldLabel>
                  <Select
                    onValueChange={(next) => setMethod(next as PaymentMethod)}
                    value={method}
                  >
                    <SelectTrigger id="stock-method">
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
              </div>
            ) : null}

            <Field>
              <FieldLabel htmlFor="stock-note">
                {messages["inventory.fieldNote"]}
              </FieldLabel>
              <Textarea
                id="stock-note"
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                value={note}
              />
            </Field>
          </fieldset>

          <SheetFooter>
            <Button disabled={isPending} type="submit">
              {isPending ? <Spinner /> : null}
              {messages["common.save"]}
            </Button>
            <Button
              disabled={isPending}
              onClick={close}
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
