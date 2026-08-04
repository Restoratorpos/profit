import { formatPhone } from "@repo/auth/lib/countries";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/design-system/components/ui/alert-dialog";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/design-system/components/ui/command";
import { FieldError } from "@repo/design-system/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import {
  ClockIcon,
  MinusIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  useDeleteMemberOrders,
  useEditMemberOrderItems,
  useMemberOrders,
} from "../api";
import {
  formatDateTime,
  formatDayLabel,
  formatTime,
  type MemberOrderSummary,
  type MemberOrderView,
  type PosProduct,
  type RemovalDetail,
  type RemovalDisposition,
  type RemovalReason,
} from "../types";
import {
  RemovalReasonDialog,
  type RemovalRequest,
} from "./removal-reason-dialog";

/** A product or combo the operator has added but not yet saved. */
interface AddedLine {
  id: string;
  kind: PosProduct["kind"];
  name: string;
  price: string;
  quantity: number;
}

/** `"product:abc"` — a combo and a product may share an id, so the kind is in the key. */
const keyOf = (line: { id: string; kind: PosProduct["kind"] }): string =>
  `${line.kind}:${line.id}`;

const priceOf = (value: string | null): number => Number(value ?? 0);

/**
 * The stepper and remove controls, identical for a stored line and an added one.
 * `−` on the last unit removes the line, the way the POS cart behaves — the bin
 * is the shortcut for dropping a line of several at once. Either way it is
 * reversible until Save.
 */
const LineControls = ({
  disabled,
  isRemoved,
  messages,
  onQuantity,
  onToggleRemoved,
  quantity,
}: {
  disabled: boolean;
  isRemoved: boolean;
  messages: Messages;
  onQuantity: (next: number) => void;
  onToggleRemoved: () => void;
  quantity: number;
}) => (
  <div className="flex shrink-0 items-center gap-2">
    <Button
      aria-label={messages["orders.decrease"]}
      className="size-9 rounded-full"
      disabled={disabled || isRemoved}
      onClick={() => onQuantity(quantity - 1)}
      size="icon"
      type="button"
      variant="outline"
    >
      <MinusIcon className="size-4" />
    </Button>
    <span className="w-5 text-center font-semibold tabular-nums">
      {quantity}
    </span>
    <Button
      aria-label={messages["orders.increase"]}
      className="size-9 rounded-full"
      disabled={disabled || isRemoved}
      onClick={() => onQuantity(quantity + 1)}
      size="icon"
      type="button"
      variant="outline"
    >
      <PlusIcon className="size-4" />
    </Button>
    <Button
      aria-label={
        isRemoved ? messages["orders.restoreLine"] : messages["common.delete"]
      }
      className={cn(
        "size-9 rounded-full",
        !isRemoved && "text-destructive hover:bg-destructive/10"
      )}
      disabled={disabled}
      onClick={onToggleRemoved}
      size="icon"
      type="button"
      variant="outline"
    >
      {isRemoved ? (
        <RotateCcwIcon className="size-4" />
      ) : (
        <Trash2Icon className="size-4" />
      )}
    </Button>
  </div>
);

/**
 * What the parent needs to decide whether a change is a reduction, and what to
 * name in the dialog if it is.
 */
interface StoredLineRef {
  id: string;
  name: string;
  /** What the database currently holds, before any pending edit. */
  storedQuantity: number;
}

const REASON_LABELS: Record<RemovalReason, keyof Messages> = {
  changed_mind: "orders.reasonChangedMind",
  customer_fault: "orders.reasonCustomerFault",
  wrong_item: "orders.reasonWrongItem",
  damaged: "orders.reasonDamaged",
  other: "orders.reasonOther",
};

const DISPOSITION_LABELS: Record<RemovalDisposition, keyof Messages> = {
  wasted: "orders.dispositionWasted",
  returned: "orders.dispositionReturned",
};

/**
 * One editable line: what it is, what it comes to, and the controls.
 *
 * No combo badge. A line's name is what the desk is checking against the
 * customer, and whether it was sold as a bundle changes nothing it can do here —
 * the quantity and the price are the same controls either way. The picker still
 * badges combos, where the distinction is the thing being chosen.
 */
const EditRow = ({
  disabled,
  isRemoved,
  messages,
  name,
  onQuantity,
  onToggleRemoved,
  price,
  quantity,
  removal,
}: {
  disabled: boolean;
  isRemoved: boolean;
  messages: Messages;
  name: string;
  onQuantity: (next: number) => void;
  onToggleRemoved: () => void;
  price: string;
  quantity: number;
  /** Captured once the line loses units, so the answer stays visible before Save. */
  removal: RemovalDetail | null;
}) => (
  <li
    className={cn(
      "flex items-center gap-3 bg-card px-4 py-3",
      isRemoved && "opacity-50"
    )}
  >
    <div className="min-w-0 flex-1">
      <p className={cn("truncate font-semibold", isRemoved && "line-through")}>
        {name}
      </p>
      <p className="text-muted-foreground text-sm tabular-nums">
        {formatMoney(price)} × {quantity} ={" "}
        {formatMoney((priceOf(price) * quantity).toFixed(2))}
      </p>
      {removal ? (
        <p className="mt-0.5 text-amber-600 text-xs dark:text-amber-500">
          {messages[REASON_LABELS[removal.reason]]} ·{" "}
          {messages[DISPOSITION_LABELS[removal.disposition]]}
        </p>
      ) : null}
    </div>
    <LineControls
      disabled={disabled}
      isRemoved={isRemoved}
      messages={messages}
      onQuantity={onQuantity}
      onToggleRemoved={onToggleRemoved}
      quantity={quantity}
    />
  </li>
);

/** The searchable catalog behind "Mahsulot qo'shish". Stays open for a run of adds. */
const AddProductButton = ({
  disabled,
  messages,
  onAdd,
  products,
}: {
  disabled: boolean;
  messages: Messages;
  onAdd: (product: PosProduct) => void;
  products: readonly PosProduct[];
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="rounded-full"
          disabled={disabled}
          type="button"
          variant="outline"
        >
          <PlusIcon className="size-4" />
          {messages["orders.addProduct"]}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command>
          <CommandInput placeholder={messages["orders.productSearch"]} />
          <CommandList>
            <CommandEmpty>{messages["orders.noProducts"]}</CommandEmpty>
            <CommandGroup>
              {products.map((product) => (
                <CommandItem
                  key={keyOf(product)}
                  onSelect={() => onAdd(product)}
                  value={`${product.name} ${product.kind}`}
                >
                  <span className="truncate">{product.name}</span>
                  {product.kind === "combo" ? (
                    <Badge variant="secondary">
                      {messages["orders.comboBadge"]}
                    </Badge>
                  ) : null}
                  <span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
                    {formatMoney(product.price)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

/** A stable empty list, so a card with no pending additions gets one reference. */
const NO_ADDED: readonly AddedLine[] = [];

/** One order's card: its stamp, its stored lines, and any pending additions. */
const OrderCard = ({
  added,
  disabled,
  locale,
  messages,
  onAddedQuantity,
  onAddedRemove,
  onQuantity,
  onToggleRemoved,
  order,
  quantities,
  removals,
}: {
  added: readonly AddedLine[];
  disabled: boolean;
  locale: Locale;
  messages: Messages;
  onAddedQuantity: (key: string, next: number) => void;
  onAddedRemove: (key: string) => void;
  onQuantity: (line: StoredLineRef, next: number) => void;
  onToggleRemoved: (line: StoredLineRef) => void;
  order: MemberOrderView;
  /** Pending quantities by `order_rep_id`; `0` marks a line as removed. */
  quantities: Record<string, number>;
  /** The reason captured for each line that has lost units, by `order_rep_id`. */
  removals: Record<string, RemovalDetail>;
}) => (
  // One ticket = one grey card, its lines white inside it, so a tab of several
  // orders reads as separate receipts rather than one long list.
  <div className="rounded-2xl bg-muted p-2">
    <p className="px-2 py-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
      {formatDayLabel(order.createdAt, locale)} · {formatTime(order.createdAt)}
    </p>
    <ul className="divide-y overflow-hidden rounded-xl border">
      {order.items.map((item) => {
        const quantity = quantities[item.id] ?? item.quantity;
        const ref: StoredLineRef = {
          id: item.id,
          name: item.name,
          storedQuantity: item.quantity,
        };

        return (
          <EditRow
            disabled={disabled}
            isRemoved={quantity === 0}
            key={item.id}
            messages={messages}
            name={item.name}
            onQuantity={(next) => onQuantity(ref, next)}
            onToggleRemoved={() => onToggleRemoved(ref)}
            price={item.price}
            // A removed line keeps showing what it was, struck through.
            quantity={quantity === 0 ? item.quantity : quantity}
            removal={removals[item.id] ?? null}
          />
        );
      })}

      {added.map((line) => (
        <EditRow
          disabled={disabled}
          isRemoved={false}
          key={keyOf(line)}
          messages={messages}
          name={line.name}
          onQuantity={(next) => onAddedQuantity(keyOf(line), next)}
          onToggleRemoved={() => onAddedRemove(keyOf(line))}
          price={line.price}
          quantity={line.quantity}
          // An addition that was never saved never left the shelf — nothing to
          // explain, so dropping it or stepping it down asks nothing.
          removal={null}
        />
      ))}
    </ul>
  </div>
);

/** One line of the money block — its own white row inside the grey container. */
const SummaryRow = ({
  emphasis,
  label,
  value,
}: {
  emphasis?: "paid" | "debt";
  label: string;
  value: number;
}) => (
  <div className="flex items-center justify-between bg-card px-4 py-2.5">
    <dt className="text-muted-foreground text-xs uppercase tracking-wide">
      {label}
    </dt>
    <dd
      className={cn(
        "font-bold tabular-nums",
        emphasis === "paid" && value > 0 && "text-primary-accent",
        // Amber, not red: an outstanding balance is the normal state of a tab,
        // and the list already reserves red for the figure the desk must chase.
        emphasis === "debt" && value > 0 && "text-amber-600 dark:text-amber-500"
      )}
    >
      {formatMoney(value.toFixed(2))}
    </dd>
  </div>
);

/** What the draft comes to, recomputed as the steppers move. */
interface DraftMoney {
  paid: number;
  remaining: number;
  total: number;
  /** An order now totals less than has been paid on it — the save is blocked. */
  underpaid: boolean;
}

/** The live TOTAL / PAID / REMAINING block, and anything blocking the save. */
const MoneyPanel = ({
  error,
  messages,
  money,
}: {
  error: string | null;
  messages: Messages;
  money: DraftMoney;
}) => (
  <div className="flex flex-col gap-3 border-t p-4">
    <dl className="divide-y overflow-hidden rounded-xl border">
      <SummaryRow label={messages["orders.totalLabel"]} value={money.total} />
      <SummaryRow
        emphasis="paid"
        label={messages["orders.paidLabel"]}
        value={money.paid}
      />
      <SummaryRow
        emphasis="debt"
        label={messages["orders.remainingLabel"]}
        value={money.remaining}
      />
    </dl>

    {money.underpaid ? (
      <p
        className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm"
        role="alert"
      >
        {messages["orders.belowPaid"]}
      </p>
    ) : null}

    {error ? (
      <p
        className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm"
        role="alert"
      >
        {error}
      </p>
    ) : null}
  </div>
);

/** Voiding the member's whole open balance — never without a confirmation. */
const DeleteOrderButton = ({
  disabled,
  isDeleting,
  messages,
  onConfirm,
}: {
  disabled: boolean;
  isDeleting: boolean;
  messages: Messages;
  onConfirm: () => void;
}) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button
        className="h-12 w-full rounded-xl border-destructive/50 font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={disabled}
        type="button"
        variant="outline"
      >
        {isDeleting ? <Spinner /> : <Trash2Icon className="size-4" />}
        {messages["orders.deleteOrder"]}
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {messages["orders.deleteConfirmTitle"]}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {messages["orders.deleteConfirmBody"]}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{messages["common.cancel"]}</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-white hover:bg-destructive/90"
          onClick={onConfirm}
        >
          {messages["orders.deleteOrder"]}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * Oldest first — the edit sheet reads as a running tab, unlike the pay drawer.
 * A copy, not `.sort()` in place: `detail.orders` is state the rest of the sheet
 * still reads in the order the backend sent it. (`toSorted` needs ES2023; this
 * repo targets ES2022.)
 */
const oldestFirst = (orders: readonly MemberOrderView[]): MemberOrderView[] =>
  [...orders].sort((left, right) =>
    (left.createdAt ?? "").localeCompare(right.createdAt ?? "")
  );

interface OrderEditSheetProperties {
  locale: Locale;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  products: readonly PosProduct[];
  summary: MemberOrderSummary | null;
}

export const OrderEditSheet = ({
  locale,
  messages,
  onOpenChange,
  products,
  summary,
}: OrderEditSheetProperties) => {
  /** Only lines the operator touched, by `order_rep_id`. `0` means removed. */
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  /** Why and where, per line that lost units. Collected on Save, not on the tap. */
  const [removals, setRemovals] = useState<Record<string, RemovalDetail>>({});
  /** The reduced lines still waiting to be explained before the save can go. */
  const [queue, setQueue] = useState<RemovalRequest[] | null>(null);
  const [added, setAdded] = useState<AddedLine[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const userId = summary?.id ?? null;

  /*
   * Shares the cache entry with the detail sheet: opening one after the other on
   * the same member is a cache hit rather than a second identical fetch. The
   * `cancelled` flag that used to guard against an id change is unnecessary now
   * that the fetch is keyed by the member.
   */
  const {
    data: detail,
    error: loadError,
    isPending: isLoading,
  } = useMemberOrders(userId);

  const editItems = useEditMemberOrderItems(userId ?? "");
  const deleteOrders = useDeleteMemberOrders(userId ?? "");

  const isSaving = editItems.isPending;
  const isDeleting = deleteOrders.isPending;

  const orderGroups = useMemo(
    () => (detail ? oldestFirst(detail.orders) : []),
    [detail]
  );

  // Added products join the newest open order server-side, so they are drawn
  // under that group here — the sheet shows where they will actually land.
  const targetOrderId = orderGroups.at(-1)?.id ?? null;

  const addedTotal = added.reduce(
    (sum, line) => sum + priceOf(line.price) * line.quantity,
    0
  );

  /**
   * Live money for the footer, plus the one thing the server refuses: an order
   * shrunk below what has already been paid on it. Checking per order here means
   * the operator sees why Save is blocked instead of a 409 after the fact.
   */
  const money = useMemo(() => {
    let total = 0;
    let underpaid = false;

    for (const order of orderGroups) {
      let orderTotal = order.id === targetOrderId ? addedTotal : 0;

      for (const item of order.items) {
        orderTotal +=
          priceOf(item.price) * (quantities[item.id] ?? item.quantity);
      }

      if (orderTotal < Number(order.paid) - 0.005) {
        underpaid = true;
      }

      total += orderTotal;
    }

    const paid = detail ? Number(detail.paid) : 0;

    return { paid, remaining: Math.max(total - paid, 0), total, underpaid };
  }, [addedTotal, detail, orderGroups, quantities, targetOrderId]);

  /**
   * Every line whose quantity now differs from what is stored, tagged with the
   * direction. `isReduction` is what decides whether a reason has to accompany
   * it — the name rides along so the dialog can say which line it is asking about.
   */
  const touchedLines = useMemo(() => {
    const stored = new Map<string, { name: string; quantity: number }>();

    for (const order of orderGroups) {
      for (const item of order.items) {
        stored.set(item.id, { name: item.name, quantity: item.quantity });
      }
    }

    const lines: {
      id: string;
      isRemoval: boolean;
      isReduction: boolean;
      name: string;
      quantity: number;
    }[] = [];

    for (const [id, quantity] of Object.entries(quantities)) {
      const original = stored.get(id);

      if (!original || original.quantity === quantity) {
        continue;
      }

      lines.push({
        id,
        isRemoval: quantity === 0,
        isReduction: quantity < original.quantity,
        name: original.name,
        quantity,
      });
    }

    return lines;
  }, [orderGroups, quantities]);

  const hasChanges = touchedLines.length > 0 || added.length > 0;
  const isBusy = isSaving || isDeleting;

  const addProduct = (product: PosProduct) => {
    setSaveError(null);
    setAdded((current) => {
      const key = keyOf(product);
      const existing = current.find((line) => keyOf(line) === key);

      if (existing) {
        return current.map((line) =>
          keyOf(line) === key ? { ...line, quantity: line.quantity + 1 } : line
        );
      }

      return [
        ...current,
        {
          id: product.id,
          kind: product.kind,
          name: product.name,
          price: product.price ?? "0",
          quantity: 1,
        },
      ];
    });
  };

  /**
   * Editing quantities is free — the reasons are collected once, on Save. What
   * this does have to handle is a line raised back to (or above) what was sold:
   * any reason captured for it is moot, and leaving it behind would silently
   * answer for a later reduction of the same line.
   */
  const updateQuantity = (line: StoredLineRef, next: number) => {
    setSaveError(null);
    setQuantities((current) => ({ ...current, [line.id]: next }));

    if (next >= line.storedQuantity) {
      setRemovals((current) => {
        const { [line.id]: _moot, ...rest } = current;

        return rest;
      });
    }
  };

  /** Stepping the last unit off takes the line with it — zero means removed. */
  const setLineQuantity = (line: StoredLineRef, next: number) => {
    updateQuantity(line, Math.max(next, 0));
  };

  /** The bin is reversible until Save — restoring puts the stored quantity back. */
  const toggleRemoved = (line: StoredLineRef) => {
    const current = quantities[line.id] ?? line.storedQuantity;

    updateQuantity(line, current === 0 ? line.storedQuantity : 0);
  };

  const removeAdded = (key: string) => {
    setAdded((current) => current.filter((line) => keyOf(line) !== key));
  };

  const setAddedQuantity = (key: string, next: number) => {
    // Down to nothing means the operator no longer wants it on the ticket. An
    // addition was never saved, so there is nothing to keep struck through.
    if (next <= 0) {
      removeAdded(key);
      return;
    }

    setAdded((current) =>
      current.map((line) =>
        keyOf(line) === key ? { ...line, quantity: next } : line
      )
    );
  };

  /**
   * Writes the edit. Takes the reasons explicitly rather than reading state,
   * because it is called straight after the last answer is recorded — a state
   * read here would still be one render behind and lose that answer.
   */
  const submit = (reasons: Record<string, RemovalDetail>) => {
    if (!userId) {
      return;
    }

    setSaveError(null);

    editItems.mutate(
      {
        added: added.map((line) =>
          line.kind === "combo"
            ? { comboId: line.id, quantity: line.quantity }
            : { productId: line.id, quantity: line.quantity }
        ),
        lines: touchedLines.map(({ id, isReduction, quantity }) => ({
          id,
          quantity,
          // Only a reduction owes an explanation; growing a line takes nothing
          // off the shelf.
          ...(isReduction ? reasons[id] : undefined),
        })),
      },
      {
        onSuccess: () => {
          /*
           * The fresh detail is written into the cache by the mutation, so
           * there is no `setDetail` here — only the pending edit is cleared.
           */
          setQuantities({});
          setAdded([]);
          // The reasons belonged to the reductions just written.
          setRemovals({});
        },
        onError: (cause) => setSaveError(cause.message),
      }
    );
  };

  /**
   * Save is where the desk accounts for what it took off the sale: any line that
   * lost units is queued up and asked about one at a time, then the whole edit
   * goes in one request. Asking here rather than on each `−` keeps the steppers
   * free to fiddle with — the operator settles the order first and explains once.
   */
  const handleSave = () => {
    if (!(userId && hasChanges)) {
      return;
    }

    const unexplained = touchedLines.filter(
      (line) => line.isReduction && !removals[line.id]
    );

    if (unexplained.length > 0) {
      setQueue(
        unexplained.map((line) => ({
          isRemoval: line.isRemoval,
          name: line.name,
          targetId: line.id,
        }))
      );
      return;
    }

    submit(removals);
  };

  /** One answer in; on to the next line, or straight into the save if it was the last. */
  const answerRemoval = (answer: RemovalDetail) => {
    const [head, ...rest] = queue ?? [];

    if (!head) {
      return;
    }

    const next = { ...removals, [head.targetId]: answer };

    setRemovals(next);

    if (rest.length > 0) {
      setQueue(rest);
      return;
    }

    setQueue(null);
    submit(next);
  };

  const handleDelete = () => {
    if (!userId) {
      return;
    }

    setSaveError(null);
    deleteOrders.mutate(undefined, {
      // Nothing is left to edit, so the sheet has no reason to stay open.
      onSuccess: () => onOpenChange(false),
      onError: (cause) => setSaveError(cause.message),
    });
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <Spinner aria-label={messages["orders.editTitle"]} />
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
      <>
        <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-3">
          <h3 className="font-semibold text-lg">
            {messages["orders.itemsHeading"]}
          </h3>
          <AddProductButton
            disabled={isBusy || orderGroups.length === 0}
            messages={messages}
            onAdd={addProduct}
            products={products}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {orderGroups.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {messages["orders.settledNote"]}
            </p>
          ) : (
            orderGroups.map((order) => (
              <OrderCard
                added={order.id === targetOrderId ? added : NO_ADDED}
                disabled={isBusy}
                key={order.id}
                locale={locale}
                messages={messages}
                onAddedQuantity={setAddedQuantity}
                onAddedRemove={removeAdded}
                onQuantity={setLineQuantity}
                onToggleRemoved={toggleRemoved}
                order={order}
                quantities={quantities}
                removals={removals}
              />
            ))
          )}
        </div>

        <MoneyPanel error={saveError} messages={messages} money={money} />

        <SheetFooter className="gap-3 pt-0">
          <Button
            className="h-12 w-full rounded-xl font-semibold text-base"
            disabled={isBusy || !hasChanges || money.underpaid}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? <Spinner /> : null}
            {messages["common.save"]}
          </Button>

          {orderGroups.length > 0 ? (
            <DeleteOrderButton
              disabled={isBusy}
              isDeleting={isDeleting}
              messages={messages}
              onConfirm={handleDelete}
            />
          ) : null}
        </SheetFooter>
      </>
    );
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={summary !== null}>
      {/* Wider than the usual drawer: every line here is a price times a
          quantity equalling a total, and at `lg` that sum wrapped onto three
          rows for a sentence that has to be read as one. */}
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        side="right"
      >
        <SheetHeader className="gap-3 pb-3">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <PencilIcon className="size-5 text-primary-accent" />
            {messages["orders.editTitle"]}
          </SheetTitle>

          {/* Read aloud as one sentence; shown as three separate facts below,
              which is the shape the eye wants and the ear does not. */}
          <SheetDescription className="sr-only">
            {summary?.name}
            {summary?.latestOrderAt
              ? ` · ${formatDateTime(summary.latestOrderAt, locale)}`
              : null}
          </SheetDescription>

          {/*
            Who this order belongs to, as a card rather than a run-on line.

            The name was sharing a row with the timestamp behind a dot, so the
            two read as one string and neither was findable at a glance. Now the
            name leads on its own, and the number and the time sit under it as
            what they are — one of them dialable, both of them optional.
          */}
          <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2.5">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-lg text-primary-accent"
            >
              {summary?.name.trim().charAt(0).toUpperCase() || "?"}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-base">
                {summary?.name}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground text-sm">
                {/* Text rather than a `tel:` link — the desk terminal is a PC. */}
                {detail?.member.phone ? (
                  <span className="flex items-center gap-1.5 tabular-nums">
                    <PhoneIcon className="size-3.5 shrink-0" />
                    {formatPhone(detail.member.phone)}
                  </span>
                ) : null}

                {summary?.latestOrderAt ? (
                  <span className="flex items-center gap-1.5">
                    <ClockIcon className="size-3.5 shrink-0" />
                    {formatDateTime(summary.latestOrderAt, locale)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </SheetHeader>

        {renderBody()}

        {/* Keyed so each line in the queue opens blank rather than carrying the
            previous answer. Cancelling abandons the save and keeps the edits. */}
        <RemovalReasonDialog
          key={queue?.[0]?.targetId ?? "none"}
          messages={messages}
          onCancel={() => setQueue(null)}
          onConfirm={answerRemoval}
          remaining={queue?.length ?? 0}
          request={queue?.[0] ?? null}
        />
      </SheetContent>
    </Sheet>
  );
};
