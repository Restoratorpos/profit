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
import { cn } from "@repo/design-system/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  CoffeeIcon,
  SearchIcon,
  ShoppingBagIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { readableTextOn } from "@/features/products/types";
import {
  type DiscountDraft,
  discountOf,
  emptyDiscount,
  toDiscountRequest,
} from "@/lib/discount";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { useCreateOrder } from "../api";
import {
  type CartLine,
  firstLeg,
  isOwed,
  type OrderCustomer,
  type PaymentLeg,
  type PosCategory,
  type PosProduct,
  priceOf,
  toPayments,
  visibleLegCount,
  withLeg,
} from "../types";
import { OrderSummary } from "./order-summary";

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
        {/*
         * Room for a code and a name side by side; the number sits under the
         * name rather than competing with it for the same line, so this no
         * longer has to be wide enough for both at once.
         */}
        <PopoverContent
          align="end"
          className="w-80 max-w-[calc(100vw-2rem)] p-0"
        >
          <Command>
            <CommandInput placeholder={messages["orders.customerSearch"]} />
            <CommandList>
              <CommandEmpty>{messages["orders.noResults"]}</CommandEmpty>
              <CommandGroup>
                {customers.map((customer) => (
                  <CommandItem
                    className="gap-3 py-2"
                    key={customer.id}
                    onSelect={() => {
                      onChange(customer);
                      setOpen(false);
                    }}
                    /* Every spelling the desk might type: the code, the name,
                       the number as it reads and the number as it is stored. */
                    value={`${customer.code ?? ""} ${customer.name} ${
                      customer.phone ?? ""
                    } ${formatPhone(customer.phone)}`}
                  >
                    {/*
                     * The code leads the row, as it does on the members table —
                     * it is the one thing that *is* them rather than a
                     * description of them, and it is what gets read out at the
                     * desk. Fixed width so the names line up down the list
                     * instead of stepping in and out with each code's length.
                     */}
                    <span className="w-10 shrink-0 rounded-md bg-muted py-0.5 text-center font-semibold text-muted-foreground text-xs tabular-nums">
                      {customer.code ?? "—"}
                    </span>
                    {/*
                     * Name over number rather than name … number. Pushing the
                     * phone to the far edge left a hand's width of nothing
                     * between them on every short name, and the eye had to cross
                     * it to read one person. Stacked, they are one block: the
                     * name identifies, the number confirms, and the row is
                     * scannable straight down.
                     */}
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate font-medium">
                        {customer.name}
                      </span>
                      {customer.phone ? (
                        <span className="truncate text-muted-foreground text-xs tabular-nums">
                          {formatPhone(customer.phone)}
                        </span>
                      ) : null}
                    </span>
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
   * What the desk has typed into the discount box. Held as what was typed rather
   * than as money, so switching between % and UZS keeps the number.
   */
  const [discount, setDiscount] = useState<DiscountDraft>(emptyDiscount);
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

  /*
   * Whether the grid is actually showing the inside of a category, which is not
   * quite the same as one being open: a query cuts across the grouping and shows
   * every match flat, so the toolbar has to go back to the tabs while that is on
   * screen rather than claiming the operator is still inside "Mevalar".
   */
  const isInsideCategory = openCategory !== null && !isSearching;

  /** What the lines add up to, before anything is taken off. */
  const gross = useMemo(
    () =>
      cart.reduce(
        (sum, line) => sum + priceOf(line.product) * line.quantity,
        0
      ),
    [cart]
  );

  /*
   * What is actually being settled. Every figure below this — the legs, the
   * qoldiq, whether the sale is owed — is measured from the discounted total, so
   * the discount is applied once, here, rather than remembered by each of them.
   *
   * The server resolves it again from its own catalog prices; this is what lets
   * the desk watch the total drop as it types.
   */
  const discountTaken = discountOf(gross, discount);
  const total = gross - discountTaken;

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
        // The rate or figure the desk entered, not the money it came to here —
        // the server resolves it against its own prices.
        discount: toDiscountRequest(discount),
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

    /*
     * Straight into the tiles, with no header above them. The way back out lives
     * in the toolbar instead — see `isInsideCategory` there for why it cannot
     * live here.
     */
    if (openCategory) {
      return tileGrid(productTiles(grouped.get(openCategory.id) ?? []));
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
          {/*
           * Inside a category this slot holds the way back out, in place of the
           * tabs rather than above the grid.
           *
           * Above the grid is where it was, and it put a control the width of a
           * finger exactly where the tile just tapped had been: the second tap of
           * a quick double-tap landed on the arrow and the desk was thrown back
           * out to the categories with no idea why. Here the tiles do not move at
           * all when a category opens, and the arrow is a row away from any of
           * them.
           *
           * Losing the tabs for as long as a category is open costs nothing —
           * switching tab closes the category anyway (see `openTab`), so they
           * were already a way out of it rather than something usable inside it.
           */}
          {isInsideCategory ? (
            /* `p-1` because the tab group has it: same small button, same eight
               pixels around it, so the toolbar is exactly as tall either way and
               the grid below does not creep up when a category opens. Nothing in
               jsdom can see this — it is the whole point of the change, so it is
               written down rather than tested. */
            <div className="p-1">
              <Button
                aria-label={messages["categories.title"]}
                className="gap-1.5 pr-3 pl-2"
                onClick={() => setOpenCategoryId(null)}
                size="sm"
                type="button"
                variant="outline"
              >
                <ChevronLeftIcon className="size-4" />
                {/* Where you are, not where the arrow goes — the arrow says that
                    already. The word stays as the accessible name so the control
                    is still announced as what it does. */}
                <span className="max-w-40 truncate font-semibold">
                  {openCategory.name}
                </span>
              </Button>
            </div>
          ) : (
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
          )}

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
        discount={discount}
        error={error}
        gross={gross}
        isPending={isPending}
        legs={legs}
        messages={messages}
        onCheckout={handleCheckout}
        onDiscount={(next) => {
          setError(null);
          setDiscount(next);
        }}
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
