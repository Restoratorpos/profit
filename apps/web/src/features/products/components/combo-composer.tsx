import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Field, FieldLabel } from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CalculatorIcon,
  CoffeeIcon,
  DeleteIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  ShoppingBagIcon,
  SproutIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { type ComboInput, useSaveCombo } from "../api";
import {
  type CategoryListItem,
  type ComboListItem,
  INGREDIENT_TYPE,
  type ProductListItem,
  readableTextOn,
  unitValueOf,
} from "../types";

/** The two sides a combo itself can belong to — a combo is always sold. */
type CatalogSide = "bar" | "shop";

/**
 * What the picker on the left is showing. Ingredients are a third shelf rather
 * than a third kind of combo: they can go *into* one, but a combo of raw
 * materials is still sold as bar or shop.
 */
type PickerSide = CatalogSide | typeof INGREDIENT_TYPE;

/** A product added to the combo, with how much of it goes in (its own unit). */
interface ComboLine {
  product: ProductListItem;
  quantity: number;
}

const costOf = (product: ProductListItem): number => Number(product.cost ?? 0);

/**
 * Whole units read as "5", portions keep their two decimals ("0.25"). The badge
 * and the component list are both narrow, and "5.00" there is noise.
 */
const formatQuantity = (quantity: number): string =>
  Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);

/** Existing components resolved back to live products; a deleted one drops out. */
const initialLines = (
  combo: ComboListItem | undefined,
  products: readonly ProductListItem[]
): ComboLine[] => {
  if (!combo) {
    return [];
  }

  const byId = new Map(products.map((product) => [product.id, product]));
  const lines: ComboLine[] = [];

  for (const component of combo.components) {
    const product = byId.get(component.productId);

    if (product) {
      lines.push({ product, quantity: Number(component.quantity) });
    }
  }

  return lines;
};

/**
 * The unit, when it names a measure rather than standing in for one.
 *
 * A unit of "1" is a placeholder: "20 000 UZS/1" is a longer way of writing
 * "20 000 UZS", and the slash reads as a fraction that is not there. Any bare
 * number goes the same way, since none of them names what is being measured —
 * a product sold by the piece is priced, not weighed.
 */
const namedUnit = (unit: string | null): string => {
  const named = unit?.trim() ?? "";

  return named === "" || Number.isFinite(Number(named)) ? "" : named;
};

/** The "/kg" after a price. Empty when the unit names nothing. */
const perUnit = (unit: string | null): string => {
  const named = namedUnit(unit);

  return named === "" ? "" : `/${named}`;
};

/** The " kg" after a quantity. Empty when the unit names nothing. */
const unitSuffix = (unit: string | null): string => {
  const named = namedUnit(unit);

  return named === "" ? "" : ` ${named}`;
};

/**
 * Two ways in, one tile. Tapping the body adds a whole unit — the common case,
 * and one tap deep. The calculator in the corner is the escape hatch for
 * anything that is not a whole unit (200 g of coffee, 15 000 UZS of syrup); it
 * opens the keypad instead of adding, so the fast path is never slowed down by
 * a modal it does not need.
 */
const ProductTile = ({
  messages,
  onAdd,
  onPortion,
  product,
  quantity,
}: {
  messages: Messages;
  onAdd: (product: ProductListItem) => void;
  onPortion: (product: ProductListItem) => void;
  product: ProductListItem;
  /** How much of this product is already in the combo, in its own unit. */
  quantity: number;
}) => {
  const color = product.color;
  const style = color
    ? { backgroundColor: color, color: readableTextOn(color) }
    : undefined;
  const chosen = quantity > 0;

  // The two buttons are siblings, not nested — a button inside a button is
  // invalid HTML and swallows the inner click in some browsers.
  return (
    <div className="relative">
      <Button
        // The amount rides on the accessible name rather than being read off the
        // badge, so the tile announces as "Coffee, in combo: 0.2", not "0.2".
        aria-label={
          chosen
            ? `${product.name}, ${messages["combos.inCombo"]}: ${formatQuantity(quantity)}`
            : product.name
        }
        // No selected ring on a tile: the count badge already says it is in, and
        // an outline on every added product turns the grid into noise.
        className={cn(
          "h-24 w-full flex-col items-start justify-between rounded-xl p-4 pr-10 text-left",
          color ? "border-transparent hover:opacity-90" : "bg-card"
        )}
        onClick={() => onAdd(product)}
        style={style}
        type="button"
        variant="outline"
      >
        <span className="line-clamp-2 whitespace-normal font-semibold text-base">
          {product.name}
        </span>
        {/* An ingredient has no sale price, so its tile shows what it actually
            costs per unit — the number that ends up in the combo's Tannarx. */}
        <span className="text-sm opacity-90">
          {formatMoney(unitValueOf(product).toFixed(2))}
          {perUnit(product.unit)}
        </span>
      </Button>

      {chosen ? (
        <span
          aria-hidden="true"
          // Wide enough for "5", stretchy enough for "0.25" — a portion is a
          // legitimate amount and must not spill out of the badge.
          className="pointer-events-none absolute -top-2.5 -right-2.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 font-bold text-primary-foreground text-sm tabular-nums shadow-sm"
        >
          {formatQuantity(quantity)}
        </span>
      ) : null}

      <Button
        aria-label={`${messages["combos.qtyPortion"]}: ${product.name}`}
        className="absolute right-1.5 bottom-1.5 size-7 bg-background/70 text-foreground/70 hover:bg-background hover:text-foreground"
        onClick={() => onPortion(product)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <CalculatorIcon className="size-4" />
      </Button>
    </div>
  );
};

/**
 * The picked option in a radio row. A tint alone reads as "slightly different
 * grey" on the desk monitor, so the choice also carries a ring and bolder text —
 * three signals, none of which is colour on its own. The hover colours are
 * restated because `outline` otherwise repaints the label with
 * `accent-foreground` on hover, which drops the green off the chosen option.
 */
const SELECTED_OPTION =
  "border-primary bg-primary/10 font-semibold text-primary-accent ring-2 ring-primary hover:bg-primary/15 hover:text-primary-accent";

type QtyMode = "kg" | "gram" | "price";

const QTY_SUFFIXES: Record<QtyMode, string> = {
  gram: "g",
  kg: "kg",
  price: "UZS",
};

/**
 * Turns a product into a combo component. The amount is entered in kilograms or
 * grams, or as a target money value that back-computes the quantity from the
 * product's unit price. Whatever the mode, it resolves to a `quantity` in the
 * product's own unit (kg), which is what the combo stores.
 */
const QuantityModal = ({
  messages,
  onAdd,
  onClose,
  product,
}: {
  messages: Messages;
  onAdd: (quantity: number) => void;
  onClose: () => void;
  product: ProductListItem;
}) => {
  // For a sellable product this is its price; for an ingredient, its cost.
  // Either way it is the per-unit money the "by value" mode divides by.
  const unitPrice = unitValueOf(product);
  const modes: QtyMode[] = [
    "kg",
    "gram",
    ...(unitPrice > 0 ? (["price"] as QtyMode[]) : []),
  ];

  const [mode, setMode] = useState<QtyMode>("gram");
  const [value, setValue] = useState("");

  const entered = Number(value);
  const raw = Number.isFinite(entered) ? entered : 0;
  const quantityOf = (): number => {
    if (mode === "gram") {
      return raw / 1000;
    }

    if (mode === "price") {
      return unitPrice > 0 ? raw / unitPrice : 0;
    }

    return raw;
  };

  // The column is DECIMAL(10,2), so the stored quantity is pinned to two places.
  const quantity = Math.round(quantityOf() * 100) / 100;
  const lineValue = quantity * unitPrice;

  const modeLabel = (m: QtyMode): string => {
    if (m === "kg") {
      return messages["combos.qtyKg"];
    }

    if (m === "gram") {
      return messages["combos.qtyGram"];
    }

    return messages["combos.qtyPrice"];
  };

  // The suffix shown after the typed number, so the desk sees the unit it is in.
  const suffix = QTY_SUFFIXES[mode];

  const step = (delta: number) => setValue(String(Math.max(raw + delta, 0)));

  // On-screen keypad — this is a POS, so the number is tapped, not typed. A tap
  // appends to the string; a leading "0" is replaced rather than stacked.
  const tap = (key: string) =>
    setValue((current) => {
      if (key === ".") {
        return current.includes(".") ? current : `${current || "0"}.`;
      }

      return current === "0" ? key : current + key;
    });

  const backspace = () => setValue((current) => current.slice(0, -1));

  const submit = () => {
    if (quantity > 0) {
      onAdd(quantity);
    }
  };

  const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0"] as const;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-2">
            {product.name}
            <span className="font-normal text-muted-foreground text-sm">
              {formatMoney(unitPrice.toFixed(2))}
              {perUnit(product.unit)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div
          className={cn(
            "grid gap-2",
            modes.length === 3 ? "grid-cols-3" : "grid-cols-2"
          )}
          role="radiogroup"
        >
          {modes.map((m) => (
            <Button
              aria-checked={mode === m}
              className={cn(mode === m && SELECTED_OPTION)}
              key={m}
              onClick={() => setMode(m)}
              role="radio"
              type="button"
              variant="outline"
            >
              {modeLabel(m)}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <output className="flex h-14 flex-1 items-baseline justify-end gap-1.5 rounded-lg border bg-muted px-4 font-semibold text-2xl tabular-nums">
            {value || "0"}
            <span className="font-normal text-muted-foreground text-sm">
              {suffix}
            </span>
          </output>
          <Button
            aria-label="−"
            className="size-14"
            onClick={() => step(-1)}
            size="icon"
            type="button"
            variant="outline"
          >
            <MinusIcon className="size-5" />
          </Button>
          <Button
            aria-label="+"
            className="size-14"
            onClick={() => step(1)}
            size="icon"
            type="button"
            variant="outline"
          >
            <PlusIcon className="size-5" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <Button
              className="h-14 text-xl"
              key={key}
              onClick={() => tap(key)}
              type="button"
              variant="outline"
            >
              {key}
            </Button>
          ))}
          <Button
            aria-label={messages["common.delete"]}
            className="h-14 text-destructive"
            onClick={backspace}
            type="button"
            variant="outline"
          >
            <DeleteIcon className="size-5" />
          </Button>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            = {quantity.toFixed(2)}
            {unitSuffix(product.unit)}
          </span>
          <span className="font-semibold text-primary-accent">
            {formatMoney(lineValue.toFixed(2))}
          </span>
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button
            className="flex-1"
            onClick={onClose}
            type="button"
            variant="outline"
          >
            {messages["common.cancel"]}
          </Button>
          <Button
            className="flex-1"
            disabled={quantity <= 0}
            onClick={submit}
            type="button"
          >
            {messages["combos.qtyAdd"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface ComboComposerProperties {
  categories: readonly CategoryListItem[];
  combo?: ComboListItem;
  messages: Messages;
  products: readonly ProductListItem[];
}

export const ComboComposer = ({
  categories,
  combo,
  messages,
  products,
}: ComboComposerProperties) => {
  const navigate = useNavigate();
  const saveCombo = useSaveCombo();
  const [pickerType, setPickerType] = useState<PickerSide>("bar");
  const [query, setQuery] = useState("");
  const [comboType, setComboType] = useState<CatalogSide>(
    combo?.productType === "shop" ? "shop" : "bar"
  );
  const [name, setName] = useState(combo?.name ?? "");
  const [price, setPrice] = useState(
    combo ? String(Math.round(Number(combo.price))) : ""
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    combo?.categoryId ?? null
  );
  const [lines, setLines] = useState<ComboLine[]>(() =>
    initialLines(combo, products)
  );
  const [modalProduct, setModalProduct] = useState<ProductListItem | null>(
    null
  );
  const isPending = saveCombo.isPending;
  const [error, setError] = useState<string | null>(null);

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return products.filter((product) => {
      if (product.productType !== pickerType) {
        return false;
      }

      return needle.length === 0 || product.name.toLowerCase().includes(needle);
    });
  }, [products, pickerType, query]);

  const cost = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + costOf(line.product) * line.quantity,
        0
      ),
    [lines]
  );

  // Every tile asks "how much of me is in the combo?" on each render, so the
  // answer is indexed once instead of scanning the lines per tile.
  const quantityByProductId = useMemo(
    () => new Map(lines.map((line) => [line.product.id, line.quantity])),
    [lines]
  );
  const priceNum = Number(price) || 0;
  const profit = Math.max(priceNum - cost, 0);

  const addLine = (product: ProductListItem, quantity: number) => {
    setError(null);
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);

      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: line.quantity + quantity }
            : line
        );
      }

      return [...current, { product, quantity }];
    });
    setModalProduct(null);
  };

  const removeLine = (productId: string) =>
    setLines((current) =>
      current.filter((line) => line.product.id !== productId)
    );

  const handleSave = () => {
    if (name.trim().length === 0) {
      setError(messages["combos.nameRequired"]);
      return;
    }

    if (lines.length === 0) {
      setError(messages["combos.componentsRequired"]);
      return;
    }

    setError(null);

    const input: ComboInput = {
      name: name.trim(),
      price: priceNum.toFixed(2),
      productType: comboType,
      categoryId,
      components: lines.map((line) => ({
        productId: line.product.id,
        quantity: line.quantity.toFixed(2),
      })),
    };

    saveCombo.mutate(
      { comboId: combo?.id, input },
      {
        // Leaving is the confirmation; the catalog behind has already been
        // invalidated by the mutation.
        onSuccess: () => navigate({ to: "/products" }),
        onError: (cause) => setError(cause.message),
      }
    );
  };

  const sides: {
    icon: typeof CoffeeIcon;
    label: string;
    value: CatalogSide;
  }[] = [
    { value: "bar", label: messages["products.typeBar"], icon: CoffeeIcon },
    {
      value: "shop",
      label: messages["products.typeShop"],
      icon: ShoppingBagIcon,
    },
  ];

  /** The picker gets a third shelf the combo's own type switcher does not. */
  const pickerSides: {
    icon: typeof CoffeeIcon;
    label: string;
    value: PickerSide;
  }[] = [
    ...sides,
    {
      value: INGREDIENT_TYPE,
      label: messages["products.tabIngredients"],
      icon: SproutIcon,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <Button
          aria-label={messages["common.cancel"]}
          asChild
          size="icon"
          variant="ghost"
        >
          <Link to="/products">
            <ArrowLeftIcon className="size-5" />
          </Link>
        </Button>
        <h1 className="font-semibold text-2xl tracking-tight">
          {combo ? messages["combos.edit"] : messages["combos.new"]}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          aria-label={messages["products.fieldType"]}
          className="flex items-center gap-1 rounded-lg bg-muted p-1"
          role="radiogroup"
        >
          {pickerSides.map((side) => {
            const active = pickerType === side.value;

            return (
              <Button
                aria-checked={active}
                className={cn("gap-2", !active && "text-muted-foreground")}
                key={side.value}
                onClick={() => setPickerType(side.value)}
                role="radio"
                size="sm"
                type="button"
                variant={active ? "default" : "ghost"}
              >
                <side.icon className="size-4" />
                {side.label}
              </Button>
            );
          })}
        </div>

        <div className="min-w-64 flex-1">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-5" />
            </InputGroupAddon>
            <InputGroupInput
              onChange={(event) => setQuery(event.target.value)}
              placeholder={messages["products.search"]}
              value={query}
            />
          </InputGroup>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          {visibleProducts.length === 0 ? (
            <p className="rounded-xl border py-16 text-center text-muted-foreground">
              {messages["combos.noProducts"]}
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {visibleProducts.map((product) => (
                <ProductTile
                  key={product.id}
                  messages={messages}
                  onAdd={(chosen) => addLine(chosen, 1)}
                  onPortion={setModalProduct}
                  product={product}
                  quantity={quantityByProductId.get(product.id) ?? 0}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="flex w-full flex-col gap-4 rounded-2xl border p-5 lg:w-96">
          <div
            aria-label={messages["products.fieldType"]}
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
          >
            {sides.map((side) => {
              const active = comboType === side.value;

              return (
                <Button
                  aria-checked={active}
                  className={cn("gap-2", active && SELECTED_OPTION)}
                  key={side.value}
                  onClick={() => setComboType(side.value)}
                  role="radio"
                  type="button"
                  variant="outline"
                >
                  <side.icon className="size-4" />
                  {side.label}
                </Button>
              );
            })}
          </div>

          <Field>
            <FieldLabel htmlFor="combo-name">
              {messages["combos.name"]}
            </FieldLabel>
            <Input
              disabled={isPending}
              id="combo-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="combo-price">
              {messages["combos.price"]}
            </FieldLabel>
            <Input
              disabled={isPending}
              id="combo-price"
              inputMode="decimal"
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0"
              value={price}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="combo-category">
              {messages["combos.category"]}
            </FieldLabel>
            <Select
              disabled={isPending}
              onValueChange={(value) =>
                setCategoryId(value === "none" ? null : value)
              }
              value={categoryId ?? "none"}
            >
              <SelectTrigger id="combo-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">
                    {messages["products.noCategory"]}
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          {lines.length === 0 ? (
            <p className="rounded-xl border border-dashed py-8 text-center text-muted-foreground text-sm">
              {messages["combos.componentsHint"]}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line) => (
                <li
                  className="flex items-center gap-2 rounded-lg border p-2"
                  key={line.product.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {line.product.name}{" "}
                      <span className="text-muted-foreground">
                        × {formatQuantity(line.quantity)}
                        {unitSuffix(line.product.unit)}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {formatMoney(
                        (costOf(line.product) * line.quantity).toFixed(2)
                      )}
                    </p>
                  </div>
                  <Button
                    aria-label={messages["combos.remove"]}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeLine(line.product.id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <dl className="flex flex-col gap-1.5 border-t pt-3">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {messages["products.colCost"]}
              </dt>
              <dd className="font-semibold">{formatMoney(cost.toFixed(2))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {messages["products.colProfit"]}
              </dt>
              <dd className="font-semibold text-primary-accent">
                {formatMoney(profit.toFixed(2))}
              </dd>
            </div>
          </dl>

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
            onClick={handleSave}
            size="lg"
            type="button"
          >
            {isPending ? <Spinner /> : null}
            {messages["combos.save"]}
          </Button>
        </aside>
      </div>

      {modalProduct ? (
        <QuantityModal
          messages={messages}
          onAdd={(quantity) => addLine(modalProduct, quantity)}
          onClose={() => setModalProduct(null)}
          product={modalProduct}
        />
      ) : null}
    </div>
  );
};
