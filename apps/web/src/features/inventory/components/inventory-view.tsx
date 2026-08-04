import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
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
import { cn } from "@repo/design-system/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ClipboardListIcon,
  HistoryIcon,
  PackageIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  TruckIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { TablePagination } from "@/components/table-pagination";
import { usePagination } from "@/components/use-pagination";
import {
  INGREDIENT_TYPE,
  type ProductListItem,
} from "@/features/products/types";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  actionLabel,
  countByStatus,
  type InventoryItem,
  type StockAction,
  type StockFilter,
  type StockSeed,
  type StockSort,
  type SupplierSummary,
} from "../types";
import { ProductHistorySheet } from "./product-history-sheet";
import { StatTiles } from "./stat-tiles";
import { StockActionSheet } from "./stock-action-sheet";
import { StockTable } from "./stock-table";

interface InventoryViewProperties {
  messages: Messages;
  products: readonly ProductListItem[];
  /**
   * What the URL asked for, read once as the opening search, filter and order.
   * Later edits stay here rather than going back to the address bar.
   */
  seed: StockSeed;
  stock: readonly InventoryItem[];
  suppliers: readonly SupplierSummary[];
}

type Side = "all" | "bar" | "shop" | typeof INGREDIENT_TYPE;

/** The Amallar menu, in the order the desk works: goods in, then everything else. */
const ACTIONS: { action: StockAction; icon: typeof PackageIcon }[] = [
  { action: "in", icon: PackageIcon },
  { action: "writeoff", icon: Trash2Icon },
  { action: "return", icon: RotateCcwIcon },
  { action: "stocktake", icon: ClipboardListIcon },
];

export const InventoryView = ({
  messages,
  products,
  seed,
  stock,
  suppliers,
}: InventoryViewProperties) => {
  const [query, setQuery] = useState(seed.q);
  const [side, setSide] = useState<Side>("all");
  const [status, setStatus] = useState<StockFilter>(seed.status);
  const [sort, setSort] = useState<StockSort>(seed.sort);
  const [action, setAction] = useState<StockAction | null>(null);
  const [opened, setOpened] = useState<InventoryItem | null>(null);

  const sides: { label: string; value: Side }[] = [
    { label: messages["inventory.filterAll"], value: "all" },
    { label: messages["inventory.filterShop"], value: "shop" },
    { label: messages["inventory.filterBar"], value: "bar" },
    {
      label: messages["inventory.filterIngredient"],
      value: INGREDIENT_TYPE,
    },
  ];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matched = stock.filter((item) => {
      if (side !== "all" && item.productType !== side) {
        return false;
      }

      if (status !== "total" && item.status !== status) {
        return false;
      }

      return needle === "" || item.name.toLowerCase().includes(needle);
    });

    // `matched` is already a new array from the filter above, so sorting it in
    // place mutates nothing the caller holds. (`toSorted` would read better but
    // this app's TS lib target predates it.)
    if (sort === "name") {
      return matched.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (sort === "stock") {
      return matched.sort((a, b) => Number(a.stock) - Number(b.stock));
    }

    return matched.sort(
      (a, b) => Number(b.supplierDebt) - Number(a.supplierDebt)
    );
  }, [query, side, sort, status, stock]);

  // The tiles count the catalog, not the filtered view: they are the overview
  // the filters act on, so they must not move when a filter is applied.
  const counts = useMemo(() => countByStatus(stock), [stock]);

  const pagination = usePagination(visible);

  const renderBody = () => {
    if (stock.length === 0) {
      return (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle className="text-base">
              {messages["inventory.empty"]}
            </EmptyTitle>
            <EmptyDescription>
              {messages["inventory.emptyHint"]}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (visible.length === 0) {
      return (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle className="text-base">
              {messages["inventory.noResults"]}
            </EmptyTitle>
            <EmptyDescription>{messages["inventory.search"]}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <div className="overflow-hidden rounded-xl border">
        <StockTable
          items={pagination.rows}
          messages={messages}
          onOpen={setOpened}
        />
        <TablePagination messages={messages} pagination={pagination} />
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {/* The sidebar names the page; this line says what is on it. */}
          <h1 className="sr-only">{messages["nav.inventory"]}</h1>
          <p className="text-muted-foreground text-sm">
            {messages["inventory.subtitle"]}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/inventory/history">
              <HistoryIcon className="size-5" />
              {messages["inventory.history"]}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/inventory/suppliers">
              <TruckIcon className="size-5" />
              {messages["suppliers.title"]}
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <PlusIcon className="size-5" />
                {messages["inventory.actions"]}
                <ChevronDownIcon className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {ACTIONS.map((entry) => (
                  <DropdownMenuItem
                    key={entry.action}
                    onSelect={() => setAction(entry.action)}
                  >
                    <entry.icon className="size-5" />
                    {actionLabel(entry.action, messages)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <StatTiles
        counts={counts}
        messages={messages}
        onSelect={setStatus}
        selected={status}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-5" />
            </InputGroupAddon>
            <InputGroupInput
              onChange={(event) => setQuery(event.target.value)}
              placeholder={messages["inventory.search"]}
              value={query}
            />
          </InputGroup>
        </div>

        <div
          aria-label={messages["products.colType"]}
          className="flex w-fit items-center gap-1 rounded-lg bg-muted p-1"
          role="radiogroup"
        >
          {sides.map((entry) => {
            const isActive = side === entry.value;

            return (
              <Button
                aria-checked={isActive}
                className={cn(!isActive && "text-muted-foreground")}
                key={entry.value}
                onClick={() => setSide(entry.value)}
                role="radio"
                size="sm"
                type="button"
                variant={isActive ? "default" : "ghost"}
              >
                {entry.label}
              </Button>
            );
          })}
        </div>

        <Select
          onValueChange={(next) => setSort(next as StockSort)}
          value={sort}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="name">
                {messages["inventory.sortName"]}
              </SelectItem>
              <SelectItem value="stock">
                {messages["inventory.sortStock"]}
              </SelectItem>
              <SelectItem value="debt">
                {messages["inventory.sortDebt"]}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {renderBody()}

      <StockActionSheet
        action={action}
        messages={messages}
        onOpenChange={(open) => setAction(open ? action : null)}
        products={products}
        stock={stock}
        suppliers={suppliers}
      />

      <ProductHistorySheet
        item={opened}
        messages={messages}
        onOpenChange={(open) => setOpened(open ? opened : null)}
      />
    </div>
  );
};
