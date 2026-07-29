import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";
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
  CoffeeIcon,
  InfoIcon,
  ShoppingBagIcon,
  SproutIcon,
  TagIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { CreatableCombobox } from "@/components/creatable-combobox";
import type { Messages } from "@/lib/i18n/dictionary";
import { useCreateCategory, useSaveProduct } from "../api";
import {
  type CategoryListItem,
  DEFAULT_PRODUCT_COLOR,
  INGREDIENT_TYPE,
  type ProductListItem,
} from "../types";
import { ColorPicker } from "./color-picker";

interface ProductSheetProperties {
  categories: readonly CategoryListItem[];
  /** Which kind a *new* row is; ignored when editing an existing one. */
  defaultType?: string;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Present when editing; absent when creating. */
  product?: ProductListItem | null;
  units: readonly string[];
}

interface FieldErrors {
  cost?: string;
  name?: string;
  price?: string;
}

const isMoney = (value: string): boolean =>
  value.trim().length > 0 && !Number.isNaN(Number(value.replace(/\s/g, "")));

/**
 * An ingredient is never sold, so it has no sale price to validate — requiring
 * one would force the desk to invent a number that then shows up nowhere.
 */
const validate = (
  name: string,
  price: string,
  cost: string,
  isRawMaterial: boolean
): FieldErrors => {
  const errors: FieldErrors = {};

  if (name.trim().length === 0) {
    errors.name = "Required";
  }

  if (!(isRawMaterial || isMoney(price))) {
    errors.price = "Required";
  }

  if (!isMoney(cost)) {
    errors.cost = "Required";
  }

  return errors;
};

/**
 * Shop / Bar / Ingredient. It sits at the top of the form because it decides
 * what the rest of the form even asks for — a sale price for the first two, a
 * cost per unit for the third.
 */
const TypePicker = ({
  isPending,
  messages,
  onChange,
  value,
}: {
  isPending: boolean;
  messages: Messages;
  onChange: (productType: string) => void;
  value: string;
}) => {
  const types = [
    {
      value: "shop",
      label: messages["products.typeShop"],
      icon: ShoppingBagIcon,
    },
    { value: "bar", label: messages["products.typeBar"], icon: CoffeeIcon },
    {
      value: INGREDIENT_TYPE,
      label: messages["products.typeIngredient"],
      icon: SproutIcon,
    },
  ];

  return (
    <Field>
      <FieldLabel>{messages["products.fieldType"]}</FieldLabel>
      <div
        aria-label={messages["products.fieldType"]}
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
        role="radiogroup"
      >
        {types.map((type) => {
          const isActive = value === type.value;

          return (
            <Button
              aria-checked={isActive}
              className={cn(
                "h-9 gap-1.5 px-2 font-medium text-sm",
                !isActive && "text-muted-foreground hover:bg-background/60"
              )}
              disabled={isPending}
              key={type.value}
              onClick={() => onChange(type.value)}
              role="radio"
              type="button"
              variant={isActive ? "default" : "ghost"}
            >
              <type.icon className="size-4" />
              {type.label}
            </Button>
          );
        })}
      </div>
    </Field>
  );
};

/**
 * A required text/number field with its label, its asterisk and its inline
 * error in one place. Name, price and cost are the same shape three times over,
 * and spelling each out inline meant three copies of the `aria-invalid` /
 * `data-invalid` / conditional-`FieldError` dance for the sheet to keep in step.
 */
const RequiredField = ({
  error,
  id,
  inputMode,
  isPending,
  label,
  name,
  onChange,
  value,
}: {
  error?: string;
  id: string;
  inputMode?: "decimal";
  isPending: boolean;
  label: string;
  /** Kept for autofill and for anything that reads the form by field name. */
  name: string;
  onChange: (value: string) => void;
  value: string;
}) => (
  <Field data-invalid={Boolean(error) || undefined}>
    <FieldLabel htmlFor={id}>{label} *</FieldLabel>
    <Input
      aria-invalid={Boolean(error)}
      disabled={isPending}
      id={id}
      inputMode={inputMode}
      name={name}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
    {error ? <FieldError>{error}</FieldError> : null}
  </Field>
);

/**
 * The unit sits in a different row depending on the type — beside the cost for
 * an ingredient, beside the category otherwise — so it is one component rendered
 * in two places rather than two copies that can drift apart.
 */
const UnitField = ({
  messages,
  onSelect,
  units,
  value,
}: {
  messages: Messages;
  onSelect: (unit: string | null) => void;
  units: readonly string[];
  value: string | null;
}) => (
  <Field>
    <FieldLabel htmlFor="product-unit">
      {messages["products.fieldUnit"]}
    </FieldLabel>
    <CreatableCombobox
      emptyLabel={messages["common.none"]}
      id="product-unit"
      // Units are plain text on the product, so "creating" one is just accepting
      // what was typed — no round-trip needed.
      onCreate={(label) => Promise.resolve({ value: label })}
      onSelect={onSelect}
      options={units.map((entry) => ({ label: entry, value: entry }))}
      placeholder={messages["products.fieldUnit"]}
      searchPlaceholder={messages["products.searchOrCreate"]}
      value={value}
    />
  </Field>
);

export const ProductSheet = ({
  categories,
  defaultType = "shop",
  messages,
  onOpenChange,
  open,
  product,
  units,
}: ProductSheetProperties) => {
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const saveProduct = useSaveProduct();
  const createCategory = useCreateCategory();
  const isPending = saveProduct.isPending;
  const [productType, setProductType] = useState(
    product?.productType ?? defaultType
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    product?.categoryId ?? null
  );
  const [unit, setUnit] = useState<string | null>(product?.unit ?? null);
  // New products default to blue; editing keeps whatever the product already has.
  const [color, setColor] = useState<string | null>(
    product ? product.color : DEFAULT_PRODUCT_COLOR
  );
  /*
   * Controlled rather than uncontrolled with defaultValue: choosing "Ingredient"
   * swaps the price field out of the form, and an uncontrolled input loses
   * whatever was typed in it the moment it unmounts. The sheet is still keyed by
   * product id upstream, so these initialisers run once per row.
   */
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product?.price ?? "");
  const [cost, setCost] = useState(product?.cost ?? "");

  const isRawMaterial = productType === INGREDIENT_TYPE;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const errors = validate(name, price, cost, isRawMaterial);

    setFieldErrors(errors);
    setFormError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload = {
      name: name.trim(),
      productType,
      categoryId,
      // The column is NOT NULL, so an ingredient stores a zero price rather than
      // nothing. Nothing reads it — the POS filters ingredients out entirely.
      price: isRawMaterial ? "0" : price.replace(/\s/g, ""),
      cost: cost.replace(/\s/g, ""),
      unit,
      // A tile colour is meaningless for something that never reaches the till.
      color: isRawMaterial ? null : color,
    };

    saveProduct.mutate(
      { input: payload, productId: product?.id },
      {
        onSuccess: () => onOpenChange(false),
        onError: (cause) => setFormError(cause.message),
      }
    );
  };

  const title = (): string => {
    if (isRawMaterial) {
      return product
        ? messages["products.editIngredient"]
        : messages["products.addIngredient"];
    }

    return product ? messages["products.edit"] : messages["products.add"];
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{title()}</SheetTitle>
          <SheetDescription className="sr-only">{title()}</SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <TypePicker
              isPending={isPending}
              messages={messages}
              onChange={setProductType}
              value={productType}
            />

            {isRawMaterial ? (
              <Alert>
                <InfoIcon />
                <AlertDescription>
                  {messages["products.ingredientHint"]}
                </AlertDescription>
              </Alert>
            ) : null}

            <RequiredField
              error={fieldErrors.name}
              id="product-name"
              isPending={isPending}
              label={messages["products.fieldName"]}
              name="name"
              onChange={setName}
              value={name}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              {isRawMaterial ? null : (
                <RequiredField
                  error={fieldErrors.price}
                  id="product-price"
                  inputMode="decimal"
                  isPending={isPending}
                  label={messages["products.fieldPrice"]}
                  name="price"
                  onChange={setPrice}
                  value={price}
                />
              )}

              <RequiredField
                error={fieldErrors.cost}
                id="product-cost"
                inputMode="decimal"
                isPending={isPending}
                label={
                  isRawMaterial
                    ? messages["products.fieldCostPerUnit"]
                    : messages["products.fieldCost"]
                }
                name="cost"
                onChange={setCost}
                value={cost}
              />

              {/* The unit rides in the money row for an ingredient: "cost per
                  unit" is unreadable until you know which unit it is per. */}
              {isRawMaterial ? (
                <UnitField
                  messages={messages}
                  onSelect={setUnit}
                  units={units}
                  value={unit}
                />
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {isRawMaterial ? null : (
                <UnitField
                  messages={messages}
                  onSelect={setUnit}
                  units={units}
                  value={unit}
                />
              )}

              <Field className={cn(isRawMaterial && "col-span-2")}>
                <FieldLabel htmlFor="product-category">
                  {messages["products.fieldCategory"]}
                </FieldLabel>
                <CreatableCombobox
                  emptyLabel={messages["products.noCategory"]}
                  icon={TagIcon}
                  id="product-category"
                  onCreate={async (label) => {
                    try {
                      const category = await createCategory.mutateAsync({
                        name: label,
                      });

                      return { value: category.id };
                    } catch (cause) {
                      return { error: (cause as Error).message };
                    }
                  }}
                  onSelect={setCategoryId}
                  options={categories.map((category) => ({
                    label: category.name,
                    value: category.id,
                  }))}
                  placeholder={messages["products.noCategory"]}
                  searchPlaceholder={messages["products.searchOrCreate"]}
                  value={categoryId}
                />
              </Field>
            </div>

            {isRawMaterial ? null : (
              <Field>
                <FieldLabel>{messages["products.fieldColor"]}</FieldLabel>
                <ColorPicker
                  disabled={isPending}
                  label={messages["products.fieldColor"]}
                  noneLabel={messages["common.none"]}
                  onChange={setColor}
                  value={color}
                />
              </Field>
            )}

            {formError ? (
              <FieldError role="alert">{formError}</FieldError>
            ) : null}
          </div>

          <SheetFooter className="grid gap-2 sm:grid-cols-2">
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {messages["common.cancel"]}
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? <Spinner /> : null}
              {messages["common.save"]}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
