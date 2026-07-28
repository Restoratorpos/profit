"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import {
  CirclePlusIcon,
  LayersIcon,
  LayersPlusIcon,
  type LucideIcon,
  PackageIcon,
  PackagePlusIcon,
  PlusIcon,
  SearchIcon,
  SproutIcon,
  TagIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type CategoryListItem,
  type ComboListItem,
  comboUsageByProductId,
  INGREDIENT_TYPE,
  isIngredient,
  marginPercent,
  type ProductListItem,
  unitsFrom,
} from "@/lib/catalog";
import type { Messages } from "@/lib/i18n/dictionary";
import { TablePagination } from "../../components/table-pagination";
import { usePagination } from "../../components/use-pagination";
import { deleteComboAction, deleteProductAction } from "../actions";
import { CatalogEmpty, type CatalogStat, CatalogStats } from "./catalog-bits";
import { CategoriesSheet } from "./categories-sheet";
import { CombosTable } from "./combos-table";
import { IngredientsTable } from "./ingredients-table";
import { ProductSheet } from "./product-sheet";
import { ProductsTable } from "./products-table";

/**
 * Which of the three catalogs this page is showing.
 *
 * It comes from the route, not from state. Two things offer the choice — the
 * tab strip here and the list under Mahsulotlar in the sidebar — and only one
 * of them can be right if either holds its own answer.
 */
export type CatalogTab = "products" | "combos" | "ingredients";

interface ProductsViewProperties {
  categories: readonly CategoryListItem[];
  combos: readonly ComboListItem[];
  messages: Messages;
  products: readonly ProductListItem[];
  tab: CatalogTab;
}

type Tab = CatalogTab;

const matches = (needle: string, ...fields: (string | null)[]): boolean => {
  if (needle.length === 0) {
    return true;
  }

  for (const field of fields) {
    if (field?.toLowerCase().includes(needle)) {
      return true;
    }
  }

  return false;
};

/** The mean of the margins that exist. Rows with no computable margin abstain. */
const averageMargin = (
  rows: readonly { cost: string | null; price: string | null }[]
): number | null => {
  let sum = 0;
  let counted = 0;

  for (const row of rows) {
    const percent = marginPercent(row.price, row.cost);

    if (percent !== null) {
      sum += percent;
      counted += 1;
    }
  }

  return counted === 0 ? null : sum / counted;
};

const formatPercent = (percent: number | null): string =>
  percent === null ? "—" : `${Math.round(percent)}%`;

/**
 * One icon per tab for the add button — a single drawn glyph, not a plus with a
 * second icon beside it.
 *
 * Ingredients get a plain plus-in-a-circle because lucide has no plant carrying
 * a plus, and stacking two icons to fake one is how a button ends up looking
 * like a rendering fault. Nothing is lost by the odd one out: only ever one of
 * these three is on screen, so they are never seen side by side.
 */
const ADD_ICON: Record<Tab, LucideIcon> = {
  combos: LayersPlusIcon,
  ingredients: CirclePlusIcon,
  products: PackagePlusIcon,
};

/**
 * The three catalogs, as links rather than a stateful tab strip.
 *
 * The sidebar lists the same three, so a tab that flipped local state could
 * disagree with the row lit beside it. Both point at the same routes instead,
 * and the route decides — which also means a tab can be opened in a new tab,
 * bookmarked, and reached by the back button.
 */
const CATALOG_TABS: readonly {
  href: string;
  icon: LucideIcon;
  labelKey: keyof Messages;
  value: Tab;
}[] = [
  {
    value: "products",
    href: "/products",
    icon: PackageIcon,
    labelKey: "products.tabProducts",
  },
  {
    value: "combos",
    href: "/products/combos",
    icon: LayersIcon,
    labelKey: "products.tabCombos",
  },
  {
    value: "ingredients",
    href: "/products/ingredients",
    icon: SproutIcon,
    labelKey: "products.tabIngredients",
  },
];

export const ProductsView = ({
  categories,
  combos,
  messages,
  products,
  tab,
}: ProductsViewProperties) => {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ProductListItem | null>(null);
  // Which kind the sheet creates when nothing is being edited — the Ingredients
  // tab's button must open an ingredient form, not a product form.
  const [sheetType, setSheetType] = useState<string>("shop");
  const [isProductSheetOpen, setProductSheetOpen] = useState(false);
  const [isCategoriesOpen, setCategoriesOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingComboId, setDeletingComboId] = useState<string | null>(null);

  // One pass, not two filters: the split feeds both the tab counts and the
  // tables, and this list is re-derived on every keystroke in the search box.
  const { ingredients, sellable } = useMemo(() => {
    const ingredientRows: ProductListItem[] = [];
    const sellableRows: ProductListItem[] = [];

    for (const product of products) {
      if (isIngredient(product)) {
        ingredientRows.push(product);
      } else {
        sellableRows.push(product);
      }
    }

    return { ingredients: ingredientRows, sellable: sellableRows };
  }, [products]);

  const needle = query.trim().toLowerCase();

  // Bar and shop together, always. The Turi column already says which a product
  // is, and a filter that is on "Barchasi" every time it is looked at is a row
  // of chrome earning nothing.
  const visibleProducts = useMemo(
    () =>
      sellable.filter((product) =>
        matches(needle, product.name, product.categoryName)
      ),
    [needle, sellable]
  );

  const visibleCombos = useMemo(
    () =>
      combos.filter((combo) => matches(needle, combo.name, combo.categoryName)),
    [combos, needle]
  );

  const visibleIngredients = useMemo(
    () =>
      ingredients.filter((ingredient) =>
        matches(
          needle,
          ingredient.name,
          ingredient.categoryName,
          ingredient.unit
        )
      ),
    [ingredients, needle]
  );

  /* One per tab rather than one over the active list: hooks cannot be called
     conditionally, and three typed slices are cheaper to reason about than a
     union that every table would then have to narrow back down. Each tab also
     keeps its own page, so flipping between them does not lose your place. */
  const productPages = usePagination(visibleProducts);
  const comboPages = usePagination(visibleCombos);
  const ingredientPages = usePagination(visibleIngredients);

  // An ingredient's whole purpose is to be used somewhere, so the count comes
  // off the combo list the page already holds rather than a new endpoint.
  const usage = useMemo(() => comboUsageByProductId(combos), [combos]);

  const stats = useMemo((): CatalogStat[] => {
    if (tab === "combos") {
      return [
        {
          label: messages["products.statTotal"],
          value: String(visibleCombos.length),
        },
        {
          label: messages["products.statAvgMargin"],
          value: formatPercent(averageMargin(visibleCombos)),
        },
      ];
    }

    if (tab === "ingredients") {
      // The column names the combos now, so this stat is what still answers
      // "is anything here dead weight?" at a glance.
      const unused = visibleIngredients.filter(
        (ingredient) => (usage.get(ingredient.id)?.length ?? 0) === 0
      ).length;

      return [
        {
          label: messages["products.statTotal"],
          value: String(visibleIngredients.length),
        },
        {
          isAlert: unused > 0,
          label: messages["products.statUnused"],
          value: String(unused),
        },
      ];
    }

    // A product with no cost reports a flattering 100% margin, so it is worth
    // counting separately rather than letting it quietly inflate the average.
    const missingCost = visibleProducts.filter(
      (product) => product.cost === null || Number(product.cost) <= 0
    ).length;

    return [
      {
        label: messages["products.statTotal"],
        value: String(visibleProducts.length),
      },
      {
        label: messages["products.statAvgMargin"],
        value: formatPercent(averageMargin(visibleProducts)),
      },
      {
        isAlert: missingCost > 0,
        label: messages["products.statNoCost"],
        value: String(missingCost),
      },
    ];
  }, [
    messages,
    tab,
    usage,
    visibleCombos,
    visibleIngredients,
    visibleProducts,
  ]);

  const handleDeleteCombo = async (comboId: string) => {
    setDeletingComboId(comboId);
    await deleteComboAction(comboId);
    setDeletingComboId(null);
  };

  const handleDelete = async (productId: string) => {
    setDeletingId(productId);
    await deleteProductAction(productId);
    setDeletingId(null);
  };

  const openCreate = (productType: string) => {
    setEditing(null);
    setSheetType(productType);
    setProductSheetOpen(true);
  };

  const openEdit = (product: ProductListItem) => {
    setEditing(product);
    setProductSheetOpen(true);
  };

  // Whatever units the gym already uses, offered as suggestions in the form.
  const units = useMemo(() => unitsFrom(products), [products]);

  const typeLabel = (productType: string | null): string => {
    if (productType === INGREDIENT_TYPE) {
      return messages["products.typeIngredient"];
    }

    return productType === "bar"
      ? messages["products.typeBar"]
      : messages["products.typeShop"];
  };

  /**
   * Whether the body below is a table rather than an empty state — which is
   * what decides if the totals under it have anything to total. "Jami 0"
   * beneath a panel explaining that you have no products yet is a second way of
   * saying the same nothing.
   */
  const hasRows = (): boolean => {
    if (tab === "combos") {
      return visibleCombos.length > 0;
    }

    return tab === "ingredients"
      ? visibleIngredients.length > 0
      : visibleProducts.length > 0;
  };

  const searchPlaceholder = (): string => {
    if (tab === "combos") {
      return messages["products.searchCombos"];
    }

    return tab === "ingredients"
      ? messages["products.searchIngredients"]
      : messages["products.search"];
  };

  const addProductButton = (
    <Button onClick={() => openCreate("shop")}>
      <PlusIcon className="size-5" />
      {messages["products.add"]}
    </Button>
  );

  const addIngredientButton = (
    <Button onClick={() => openCreate(INGREDIENT_TYPE)}>
      <PlusIcon className="size-5" />
      {messages["products.addIngredient"]}
    </Button>
  );

  const addComboButton = (
    <Button asChild>
      <Link href="/products/combos/new">
        <PlusIcon className="size-5" />
        {messages["combos.add"]}
      </Link>
    </Button>
  );

  const addLabel = (): string => {
    if (tab === "combos") {
      return messages["combos.add"];
    }

    return tab === "ingredients"
      ? messages["products.addIngredient"]
      : messages["products.add"];
  };

  /**
   * The toolbar's add button: one glyph that is the plus and the thing it adds
   * at once, rather than two icons sitting next to each other.
   *
   * No words, because the word is already on the tab beside it — this button
   * only ever adds whatever the tab is showing, so saying it twice in one row
   * buys nothing and costs the width the search box wanted.
   *
   * The empty states keep their worded buttons: there is no tab to borrow the
   * noun from when the table is a paragraph explaining itself.
   */
  const primaryAction = () => {
    const label = addLabel();
    const Icon = ADD_ICON[tab];

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {tab === "combos" ? (
              <Button aria-label={label} asChild size="icon">
                <Link href="/products/combos/new">
                  <Icon className="size-5" />
                </Link>
              </Button>
            ) : (
              <Button
                aria-label={label}
                onClick={() =>
                  openCreate(tab === "ingredients" ? INGREDIENT_TYPE : "shop")
                }
                size="icon"
              >
                <Icon className="size-5" />
              </Button>
            )}
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  /**
   * Three empty states, not one: "no rows" for a search that matched nothing is
   * a different problem from "you have not set this up yet", and the second is
   * where a sentence explaining what an ingredient is actually belongs.
   */
  const renderBody = () => {
    if (tab === "combos") {
      if (visibleCombos.length > 0) {
        return (
          <div className="overflow-hidden rounded-xl border">
            <CombosTable
              combos={comboPages.rows}
              deletingComboId={deletingComboId}
              messages={messages}
              onDelete={handleDeleteCombo}
              typeLabel={typeLabel}
            />
            <TablePagination messages={messages} pagination={comboPages} />
          </div>
        );
      }

      return combos.length === 0 ? (
        <CatalogEmpty
          action={addComboButton}
          description={messages["combos.emptyHint"]}
          icon={LayersIcon}
          title={messages["combos.empty"]}
        />
      ) : (
        <CatalogEmpty
          description={messages["products.search"]}
          icon={SearchIcon}
          title={messages["combos.noResults"]}
        />
      );
    }

    if (tab === "ingredients") {
      if (visibleIngredients.length > 0) {
        return (
          <div className="overflow-hidden rounded-xl border">
            <IngredientsTable
              deletingId={deletingId}
              ingredients={ingredientPages.rows}
              messages={messages}
              onDelete={handleDelete}
              onEdit={openEdit}
              usage={usage}
            />
            <TablePagination messages={messages} pagination={ingredientPages} />
          </div>
        );
      }

      return ingredients.length === 0 ? (
        <CatalogEmpty
          action={addIngredientButton}
          description={messages["products.ingredientsEmptyHint"]}
          icon={SproutIcon}
          title={messages["products.ingredientsEmpty"]}
        />
      ) : (
        <CatalogEmpty
          description={messages["products.searchIngredients"]}
          icon={SearchIcon}
          title={messages["products.noResults"]}
        />
      );
    }

    if (visibleProducts.length > 0) {
      return (
        <div className="overflow-hidden rounded-xl border">
          <ProductsTable
            deletingId={deletingId}
            messages={messages}
            onDelete={handleDelete}
            onEdit={openEdit}
            products={productPages.rows}
            typeLabel={typeLabel}
          />
          <TablePagination messages={messages} pagination={productPages} />
        </div>
      );
    }

    return sellable.length === 0 ? (
      <CatalogEmpty
        action={addProductButton}
        description={messages["products.emptyHint"]}
        icon={PackageIcon}
        title={messages["products.empty"]}
      />
    ) : (
      <CatalogEmpty
        description={messages["products.search"]}
        icon={SearchIcon}
        title={messages["products.noResults"]}
      />
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {/* The sidebar already says which page this is, so the heading is dead
          weight on screen — but a page still needs one to be navigable by
          heading, so it stays for screen readers rather than being deleted. */}
      <h1 className="sr-only">{messages["products.title"]}</h1>

      {/*
        Two rows above the table, not four.

        The first is everything that does not change with the tab: which catalog
        you are looking at, how to find something in it, and the two ways to add
        to it. Search sits between them because it is the control that gets used
        most, and it takes the slack that used to be an empty half-row above the
        buttons.

        The second is what the current tab is showing — narrowed how, and adding
        up to what. It is a caption for the table rather than a panel of its own,
        so it carries no box.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <nav
          aria-label={messages["products.title"]}
          className="flex items-center gap-1 rounded-lg bg-muted p-1"
        >
          {CATALOG_TABS.map((entry) => {
            const isActive = tab === entry.value;

            return (
              <Button
                aria-current={isActive ? "page" : undefined}
                asChild
                className={cn(!isActive && "text-muted-foreground")}
                key={entry.value}
                size="sm"
                variant={isActive ? "default" : "ghost"}
              >
                <Link href={entry.href}>
                  <entry.icon className="size-5" />
                  {messages[entry.labelKey]}
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="min-w-56 max-w-md flex-1">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-5" />
            </InputGroupAddon>
            <InputGroupInput
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder()}
              value={query}
            />
          </InputGroup>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => setCategoriesOpen(true)} variant="outline">
            <TagIcon className="size-5" />
            {messages["products.categories"]}
          </Button>
          {primaryAction()}
        </div>
      </div>

      {renderBody()}

      {/* Under the table, not above it: these are what the rows add up to, and
          a total reads as a total when it comes after the thing it totals. */}
      {hasRows() ? <CatalogStats stats={stats} /> : null}

      <ProductSheet
        categories={categories}
        defaultType={sheetType}
        // Remount per product so the form picks up new defaults — and per
        // create-type too, or the Ingredients button would open the last form.
        key={editing?.id ?? `new-${sheetType}`}
        messages={messages}
        onOpenChange={setProductSheetOpen}
        open={isProductSheetOpen}
        product={editing}
        units={units}
      />
      <CategoriesSheet
        categories={categories}
        messages={messages}
        onOpenChange={setCategoriesOpen}
        open={isCategoriesOpen}
      />
    </div>
  );
};
