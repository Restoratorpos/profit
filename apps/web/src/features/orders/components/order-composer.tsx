import { formatPhone } from "@repo/auth/lib/countries";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/design-system/components/ui/command";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import {
  BanknoteIcon,
  ChevronLeftIcon,
  ClockIcon,
  CoffeeIcon,
  CreditCardIcon,
  GiftIcon,
  type LucideIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  Trash2Icon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { readableTextOn } from "@/features/products/types";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { useCreateOrder } from "../api";
import {
  canTypeAmount,
  firstLeg,
  isFinalLeg,
  isOwed,
  needsTill,
  type OrderCheckoutType,
  type OrderCustomer,
  type PaymentLeg,
  type PosCategory,
  type PosProduct,
  settlementOf,
  type Till,
  toPayments,
  visibleLegCount,
  withLeg,
} from "../types";

interface CartLine {
  product: PosProduct;
  quantity: number;
}

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
  index,
  isFinal,
  leg,
  messages,
  onAmount,
  onMethod,
  onTill,
  outstanding,
}: {
  disabled: boolean;
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
        {isFixed || !canType ? null : (
          <Button
            disabled={disabled}
            onClick={() => onAmount(String(Math.round(outstanding)))}
            type="button"
            variant="outline"
          >
            {messages["orders.full"]}
          </Button>
        )}
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

const priceOf = (product: PosProduct): number => Number(product.price ?? 0);

const CustomerPicker = ({
  customers,
  messages,
  onChange,
  value,
}: {
  customers: readonly OrderCustomer[];
  messages: Messages;
  onChange: (next: OrderCustomer | null) => void;
  value: OrderCustomer | null;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1 rounded-lg border pr-1">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button className="gap-2" type="button" variant="ghost">
            <UserIcon className="size-4" />
            {value ? value.name : messages["orders.noCustomer"]}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <Command>
            <CommandInput placeholder={messages["orders.customerSearch"]} />
            <CommandList>
              <CommandEmpty>{messages["orders.noResults"]}</CommandEmpty>
              <CommandGroup>
                {customers.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    onSelect={() => {
                      onChange(customer);
                      setOpen(false);
                    }}
                    /* Both spellings of the number, because the row now shows
                       the grouped one: typing it the way it reads must match,
                       and so must typing it the way it is stored. */
                    value={`${customer.name} ${customer.phone ?? ""} ${formatPhone(
                      customer.phone
                    )}`}
                  >
                    <span className="truncate">{customer.name}</span>
                    {customer.phone ? (
                      <span className="ml-auto text-muted-foreground text-xs">
                        {formatPhone(customer.phone)}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value ? (
        <Button
          aria-label={messages["orders.clearCustomer"]}
          onClick={() => onChange(null)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  );
};

const ProductTile = ({
  messages,
  onAdd,
  product,
  quantity,
}: {
  messages: Messages;
  onAdd: (product: PosProduct) => void;
  product: PosProduct;
  /** How many of this tile are already on the ticket. */
  quantity: number;
}) => {
  const color = product.color;
  const style = color
    ? { backgroundColor: color, color: readableTextOn(color) }
    : undefined;
  const chosen = quantity > 0;

  return (
    <Button
      // The count is on the accessible name rather than read off the badge, so
      // the tile announces as "Coke, in cart: 5" instead of a bare "5".
      aria-label={
        chosen
          ? `${product.name}, ${messages["orders.inCart"]}: ${quantity}`
          : product.name
      }
      className={cn(
        "relative h-28 flex-col items-center justify-center gap-1.5 rounded-xl p-4 text-center",
        color ? "border-transparent hover:opacity-90" : "bg-card"
      )}
      onClick={() => onAdd(product)}
      style={style}
      type="button"
      variant="outline"
    >
      {/* Name over price, both centred, and no combo icon: a bundle rings up the
          same way a product does, so the mark was decoration on the one thing the
          operator has to read at a glance. */}
      <span className="line-clamp-2 whitespace-normal font-semibold text-base">
        {product.name}
      </span>
      <span className="text-sm opacity-90">{formatMoney(product.price)}</span>

      {chosen ? (
        <span
          aria-hidden="true"
          className="absolute -top-2.5 -right-2.5 flex size-7 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-sm tabular-nums shadow-sm"
        >
          {quantity}
        </span>
      ) : null}
    </Button>
  );
};

/**
 * A category as a tile: the same footprint as a product, so the grid reads as one
 * wall of buttons rather than two.
 *
 * Nothing on it but its name, centred. Carrying no price is what tells it from a
 * sellable tile — the count of what was inside is a number the desk never acts
 * on, and in the second line's position it read as one more price.
 */
const CategoryTile = ({
  category,
  onOpen,
}: {
  category: PosCategory;
  onOpen: () => void;
}) => {
  const color = category.color;
  const style = color
    ? { backgroundColor: color, color: readableTextOn(color) }
    : undefined;

  return (
    <Button
      className={cn(
        "h-28 flex-col items-center justify-center rounded-xl p-4 text-center",
        color ? "border-transparent hover:opacity-90" : "bg-card"
      )}
      onClick={onOpen}
      style={style}
      type="button"
      variant="outline"
    >
      <span className="line-clamp-3 whitespace-normal font-semibold text-base">
        {category.name}
      </span>
    </Button>
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

const OrderSummary = ({
  cart,
  error,
  isPending,
  legs,
  messages,
  onCheckout,
  onLegAmount,
  onLegMethod,
  onLegTill,
  onQty,
  onRemove,
  total,
}: {
  cart: readonly CartLine[];
  error: string | null;
  isPending: boolean;
  /** How the sale is being settled, in order. Grows as the desk splits it. */
  legs: readonly PaymentLeg[];
  messages: Messages;
  onCheckout: () => void;
  onLegAmount: (index: number, next: string) => void;
  onLegMethod: (index: number, next: OrderCheckoutType) => void;
  onLegTill: (index: number, next: Till) => void;
  onQty: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
  total: number;
}) => {
  const { applied, remaining } = settlementOf(total, legs);
  const shown = visibleLegCount(total, legs);

  return (
    /*
     * `lg:self-start` keeps the card the height of what is in it. As a column of
     * a full-height row it would otherwise stretch to the bottom of the screen,
     * which is a lot of border around nothing on a two-line order.
     *
     * `lg:shrink-0` so a wide product grid cannot squeeze it — the amount box and
     * the four payment buttons need their width more than the tiles do.
     */
    <aside className="flex w-full flex-col gap-4 rounded-2xl border p-5 lg:w-96 lg:shrink-0 lg:self-start">
      <h2 className="flex items-center gap-2 font-semibold text-lg">
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
          <ul className="flex flex-col gap-3">
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
                  index={index}
                  isFinal={isFinalLeg(index)}
                  leg={leg}
                  messages={messages}
                  onAmount={(next) => onLegAmount(index, next)}
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
        </>
      )}
    </aside>
  );
};

interface OrderComposerProperties {
  /** Every category in the catalog; the grid shows the ones with tiles in them. */
  categories: readonly PosCategory[];
  customers: readonly OrderCustomer[];
  messages: Messages;
  products: readonly PosProduct[];
}

export const OrderComposer = ({
  categories,
  customers,
  messages,
  products,
}: OrderComposerProperties) => {
  const navigate = useNavigate();
  const createOrder = useCreateOrder();
  const [productType, setProductType] = useState<"bar" | "shop">("bar");
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  /**
   * How the sale is settled, in order. One leg is the ordinary sale — cash,
   * blank box, the whole total. A second and third appear only as the desk
   * splits it, and are dropped again the moment they stop being needed.
   */
  const [legs, setLegs] = useState<PaymentLeg[]>(firstLeg);
  const isPending = createOrder.isPending;
  const [error, setError] = useState<string | null>(null);

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return products.filter((product) => {
      if (product.productType !== productType) {
        return false;
      }

      return needle.length === 0 || product.name.toLowerCase().includes(needle);
    });
  }, [productType, products, query]);

  /**
   * What the grid is showing: the categories, or inside one of them.
   *
   * Reset whenever the tab changes, because a category that has bar products need
   * not have shop ones — staying open would show an empty grid and no reason why.
   */
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  const openTab = (next: "bar" | "shop") => {
    setProductType(next);
    setOpenCategoryId(null);
  };

  /*
   * Searching cuts across the grouping. A query is the desk saying "I know what
   * it is called, find it" — making them guess which category it was filed under
   * first is the slower path to the same tile, so matches come back flat.
   */
  const isSearching = query.trim().length > 0;

  const { grouped, loose } = useMemo(() => {
    const byCategory = new Map<string, PosProduct[]>();
    const withoutCategory: PosProduct[] = [];

    for (const product of visibleProducts) {
      if (product.categoryId === null) {
        withoutCategory.push(product);
        continue;
      }

      const bucket = byCategory.get(product.categoryId);

      if (bucket) {
        bucket.push(product);
      } else {
        byCategory.set(product.categoryId, [product]);
      }
    }

    return { grouped: byCategory, loose: withoutCategory };
  }, [visibleProducts]);

  /*
   * Only categories with something in them, in the order the catalog lists them —
   * a tile that opens onto nothing is a dead end, and on this tab most of them
   * will be empty.
   *
   * A product whose category was deleted, or which arrived before the categories
   * did, has an id matching nothing here; it falls through to the loose row below
   * rather than disappearing.
   */
  const shownCategories = useMemo(
    () => categories.filter((category) => grouped.has(category.id)),
    [categories, grouped]
  );

  const knownCategoryIds = useMemo(
    () => new Set(categories.map((category) => category.id)),
    [categories]
  );

  const looseProducts = useMemo(
    () =>
      loose.concat(
        visibleProducts.filter(
          (product) =>
            product.categoryId !== null &&
            !knownCategoryIds.has(product.categoryId)
        )
      ),
    [knownCategoryIds, loose, visibleProducts]
  );

  const openCategory =
    categories.find((category) => category.id === openCategoryId) ?? null;

  const total = useMemo(
    () =>
      cart.reduce(
        (sum, line) => sum + priceOf(line.product) * line.quantity,
        0
      ),
    [cart]
  );

  // Built once per cart change rather than searched per tile, so a grid of a few
  // hundred products stays one pass instead of a scan each.
  const quantityById = useMemo(
    () => new Map(cart.map((line) => [line.product.id, line.quantity])),
    [cart]
  );

  const patchLeg = (index: number, patch: Partial<PaymentLeg>) => {
    setError(null);
    setLegs((current) => withLeg(total, current, index, patch));
  };

  const addToCart = (product: PosProduct) => {
    setError(null);
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);

      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }

      return [...current, { product, quantity: 1 }];
    });
  };

  const changeQty = (productId: string, delta: number) => {
    setCart((current) =>
      current
        .map((line) =>
          line.product.id === productId
            ? { ...line, quantity: line.quantity + delta }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  };

  const removeLine = (productId: string) => {
    setCart((current) =>
      current.filter((line) => line.product.id !== productId)
    );
  };

  // Not async: `mutate` reports through callbacks rather than a promise.
  const handleCheckout = () => {
    if (cart.length === 0) {
      return;
    }

    const typed = legs.filter(
      (leg) => leg.method !== "debt" && leg.method !== "free"
    );

    if (
      typed.some(
        (leg) => leg.amount.trim() !== "" && !(Number(leg.amount) >= 0)
      )
    ) {
      setError(messages["orders.amountInvalid"]);
      return;
    }

    // Only a member can carry a balance, and a qarz is named as well as
    // measured: a cart that happens to total zero is still a credit sale, which
    // the server refuses for a walk-in either way.
    const owed =
      isOwed(total, legs) || legs.some((leg) => leg.method === "debt");

    if (owed && !customer) {
      setError(messages["orders.debtNeedsCustomer"]);
      return;
    }

    setError(null);

    createOrder.mutate(
      {
        userId: customer?.id ?? null,
        items: cart.map((line) =>
          line.product.kind === "combo"
            ? { comboId: line.product.id, quantity: line.quantity }
            : { productId: line.product.id, quantity: line.quantity }
        ),
        // Only the legs on screen, flattened into what the ledger records: a
        // qarz carrying a part payment becomes that payment plus the balance
        // behind it.
        payments: toPayments(legs.slice(0, visibleLegCount(total, legs))),
      },
      {
        // Leaving the screen is the receipt. The list behind it has already
        // been invalidated by the mutation, so it arrives correct.
        onSuccess: () => navigate({ to: "/orders" }),
        onError: (cause) => setError(cause.message),
      }
    );
  };

  /** One wall of tiles, whatever it is showing. */
  const tileGrid = (children: ReactNode) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
      {children}
    </div>
  );

  const productTiles = (list: readonly PosProduct[]) =>
    list.map((product) => (
      <ProductTile
        key={product.id}
        messages={messages}
        onAdd={addToCart}
        product={product}
        quantity={quantityById.get(product.id) ?? 0}
      />
    ));

  /**
   * Categories first, then what is not in one; or the inside of a category; or,
   * while searching, every match at once.
   */
  const renderGrid = () => {
    if (visibleProducts.length === 0) {
      return (
        <p className="rounded-xl border py-16 text-center text-muted-foreground">
          {messages["orders.noProducts"]}
        </p>
      );
    }

    if (isSearching) {
      return tileGrid(productTiles(visibleProducts));
    }

    if (openCategory) {
      return (
        <div className="flex flex-col gap-4">
          {/* The way back out, showing where you are rather than where it goes —
              the arrow already says that, and the word "Kategoriyalar" beside the
              category's own name was the label of the screen twice over. It keeps
              the word as its accessible name, so the control is still announced
              as what it does. */}
          <Button
            aria-label={messages["categories.title"]}
            className="w-fit gap-2 pl-2"
            onClick={() => setOpenCategoryId(null)}
            type="button"
            variant="ghost"
          >
            <ChevronLeftIcon className="size-4" />
            <span className="font-semibold text-foreground">
              {openCategory.name}
            </span>
          </Button>

          {tileGrid(productTiles(grouped.get(openCategory.id) ?? []))}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-5">
        {shownCategories.length === 0
          ? null
          : tileGrid(
              shownCategories.map((category) => (
                <CategoryTile
                  category={category}
                  key={category.id}
                  onOpen={() => setOpenCategoryId(category.id)}
                />
              ))
            )}

        {/* Under the categories, and only labelled when there are categories to
            be under — with none, every tile is loose and a heading saying so is
            a heading over the whole screen. */}
        {looseProducts.length === 0 ? null : (
          <div className="flex flex-col gap-3">
            {shownCategories.length === 0 ? null : (
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {messages["products.noCategory"]}
              </p>
            )}
            {tileGrid(productTiles(looseProducts))}
          </div>
        )}
      </div>
    );
  };

  const types = [
    {
      value: "bar" as const,
      label: messages["products.typeBar"],
      icon: CoffeeIcon,
    },
    {
      value: "shop" as const,
      label: messages["products.typeShop"],
      icon: ShoppingBagIcon,
    },
  ];

  return (
    /*
     * Two columns from `lg` up, and the summary is a column rather than something
     * under the product grid — so it starts level with the search rather than a
     * toolbar's height down the page. The operator watches the running total while
     * they tap tiles, and a panel that began below the fold was a panel they had
     * to go and look for.
     */
    <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:gap-6">
      {/* `min-w-0` so a long product name in the grid cannot push the summary
          off the edge — a flex child defaults to its content's width. */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {/* The title is read, not displayed. This screen is a till: the operator
            knows what they opened — the sidebar row they pressed is still lit —
            and a whole row spent saying so is a row of products they cannot see.
            Leaving is the sidebar's job too, which is why there is no back arrow:
            every other way out of this screen is one tap away in the same place. */}
        <h1 className="sr-only">{messages["orders.newOrder"]}</h1>

        <div className="flex flex-wrap items-center gap-3">
          <div
            aria-label={messages["products.fieldType"]}
            className="flex items-center gap-1 rounded-lg bg-muted p-1"
            role="radiogroup"
          >
            {types.map((type) => {
              const active = productType === type.value;

              return (
                <Button
                  aria-checked={active}
                  className={cn("gap-2", !active && "text-muted-foreground")}
                  key={type.value}
                  onClick={() => openTab(type.value)}
                  role="radio"
                  size="sm"
                  type="button"
                  variant={active ? "default" : "ghost"}
                >
                  <type.icon className="size-4" />
                  {type.label}
                </Button>
              );
            })}
          </div>

          {/* Takes the space between the tabs and the customer, so the row has no
              dead middle. It is already bounded by the summary column beside it —
              the reason this was ever a 1000px box for a one-word query was that
              the summary used to sit *below* rather than to the right. */}
          <div className="min-w-48 flex-1">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <SearchIcon className="size-5" />
              </InputGroupAddon>
              <InputGroupInput
                onChange={(event) => setQuery(event.target.value)}
                placeholder={messages["orders.productSearch"]}
                value={query}
              />
            </InputGroup>
          </div>

          {/* Last on the row, and the search growing into the space is what keeps
              it there — it is who is buying, not what is being searched. */}
          <CustomerPicker
            customers={customers}
            messages={messages}
            onChange={setCustomer}
            value={customer}
          />
        </div>

        {renderGrid()}
      </div>

      <OrderSummary
        cart={cart}
        error={error}
        isPending={isPending}
        legs={legs}
        messages={messages}
        onCheckout={handleCheckout}
        onLegAmount={(index, next) => patchLeg(index, { amount: next })}
        onLegMethod={(index, next) => patchLeg(index, { method: next })}
        onLegTill={(index, next) => patchLeg(index, { till: next })}
        onQty={changeQty}
        onRemove={removeLine}
        total={total}
      />
    </div>
  );
};
