import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, HistoryIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { formatQuantity, type MovementView, movementLabel } from "../types";

interface HistoryViewProperties {
  messages: Messages;
  movements: readonly MovementView[];
}

/**
 * What the filter chips select on. `sale` and `customer_return` have no document
 * behind them — the POS writes them straight to the ledger — so the filter reads
 * the document type when there is one and the movement type when there is not,
 * exactly as the label does.
 */
type Filter = "all" | "in" | "return" | "sale" | "stocktake" | "writeoff";

const kindOf = (movement: MovementView): string =>
  movement.actionType ?? movement.movementType ?? "";

const matchesFilter = (movement: MovementView, filter: Filter): boolean => {
  if (filter === "all") {
    return true;
  }

  const kind = kindOf(movement);

  // A supplier return and a customer return are opposite directions of goods,
  // but the desk calls both "Qaytarish" — so the chip catches both rather than
  // making the operator know which internal name their return got.
  if (filter === "return") {
    return kind === "return" || kind === "supplier_return";
  }

  return kind === filter;
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

const formatWhen = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? "—" : DATE_FORMAT.format(parsed);
};

export const HistoryView = ({ messages, movements }: HistoryViewProperties) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const filters: { label: string; value: Filter }[] = [
    { label: messages["inventory.filterAll"], value: "all" },
    { label: messages["inventory.actionIn"], value: "in" },
    { label: messages["inventory.movementSale"], value: "sale" },
    { label: messages["inventory.actionWriteoff"], value: "writeoff" },
    { label: messages["inventory.actionReturn"], value: "return" },
    { label: messages["inventory.actionStocktake"], value: "stocktake" },
  ];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return movements.filter((movement) => {
      if (!matchesFilter(movement, filter)) {
        return false;
      }

      if (needle === "") {
        return true;
      }

      return (
        movement.productName?.toLowerCase().includes(needle) ||
        movement.supplierName?.toLowerCase().includes(needle)
      );
    });
  }, [filter, movements, query]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="ghost">
            <Link aria-label={messages["nav.inventory"]} to="/inventory">
              <ArrowLeftIcon className="size-5" />
            </Link>
          </Button>
          <h1 className="font-semibold text-2xl tracking-tight">
            {messages["inventory.history"]}
          </h1>
        </div>

        <div className="w-full max-w-sm">
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
      </div>

      <div
        aria-label={messages["inventory.colAction"]}
        className="flex w-fit flex-wrap items-center gap-1 rounded-lg bg-muted p-1"
        role="radiogroup"
      >
        {filters.map((entry) => {
          const isActive = filter === entry.value;

          return (
            <Button
              aria-checked={isActive}
              className={cn(!isActive && "text-muted-foreground")}
              key={entry.value}
              onClick={() => setFilter(entry.value)}
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

      {visible.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle className="text-base">
              {messages["inventory.historyEmpty"]}
            </EmptyTitle>
            <EmptyDescription>
              {messages["inventory.historyEmptyHint"]}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{messages["inventory.colWhen"]}</TableHead>
                <TableHead>{messages["inventory.colProduct"]}</TableHead>
                <TableHead>{messages["inventory.colAction"]}</TableHead>
                <TableHead>{messages["inventory.colSupplier"]}</TableHead>
                <TableHead>{messages["inventory.colWorker"]}</TableHead>
                <TableHead className="text-right">
                  {messages["inventory.colUnitCost"]}
                </TableHead>
                <TableHead className="text-right">
                  {messages["inventory.colQuantity"]}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((movement) => {
                const quantity = Number(movement.quantity);

                return (
                  <TableRow key={movement.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatWhen(movement.time)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {movement.productName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {movementLabel(movement, messages)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {movement.supplierName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {movement.workerName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatMoney(movement.unitCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Written with its sign, always: the direction is the
                          whole content of this column. */}
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          quantity < 0
                            ? "text-destructive"
                            : "text-primary-accent"
                        )}
                      >
                        {quantity > 0 ? "+" : ""}
                        {formatQuantity(movement.quantity)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
