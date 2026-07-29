import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { formatQuantity, type InventoryItem, marginOf } from "../types";

interface StockTableProperties {
  items: readonly InventoryItem[];
  messages: Messages;
  /** Opens that product's own movement history in the drawer. */
  onOpen: (item: InventoryItem) => void;
}

/**
 * The stock figure, coloured by how urgent it is. The number is the message —
 * the colour only sharpens it — so a red "0" still reads as zero in greyscale.
 */
const StockCell = ({ item }: { item: InventoryItem }) => (
  <span
    className={cn(
      "font-semibold tabular-nums",
      item.status === "out" && "text-destructive",
      item.status === "low" && "text-amber-600 dark:text-amber-400"
    )}
  >
    {formatQuantity(item.stock)}
    {item.unit ? (
      <span className="ml-1 font-normal text-muted-foreground text-sm">
        {item.unit}
      </span>
    ) : null}
  </span>
);

export const StockTable = ({
  items,
  messages,
  onOpen,
}: StockTableProperties) => (
  // Border and rounding live on the caller's wrapper, which also holds the
  // pagination bar — the two must share one outline, not stack two.
  <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{messages["products.colName"]}</TableHead>
          <TableHead className="text-right">
            {messages["products.colPrice"]}
          </TableHead>
          <TableHead className="text-right">
            {messages["products.colCost"]}
          </TableHead>
          <TableHead className="text-right">
            {messages["products.colProfit"]}
          </TableHead>
          <TableHead className="text-right">
            {messages["inventory.colDebt"]}
          </TableHead>
          <TableHead className="text-right">
            {messages["inventory.colStock"]}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const margin = marginOf(item);
          const debt = Number(item.supplierDebt);

          return (
            <TableRow
              className="cursor-pointer"
              key={item.id}
              onClick={() => onOpen(item)}
            >
              <TableCell>
                {/* The row is the control that opens the drawer, so the name is
                    the focusable thing inside it — a whole <tr> cannot take
                    focus, and the keyboard must reach this somehow. */}
                <Button
                  className="h-auto justify-start truncate p-0 font-medium hover:underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(item);
                  }}
                  type="button"
                  variant="link"
                >
                  {item.name}
                </Button>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatMoney(item.price)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatMoney(item.cost)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {margin === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span
                    className={cn(
                      "font-medium",
                      margin < 0 && "text-destructive"
                    )}
                  >
                    {formatMoney(margin.toFixed(2))}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {debt > 0 ? (
                  <Badge
                    className="border-destructive/40 font-medium text-destructive tabular-nums"
                    variant="outline"
                  >
                    {formatMoney(item.supplierDebt)}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <StockCell item={item} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </div>
);
