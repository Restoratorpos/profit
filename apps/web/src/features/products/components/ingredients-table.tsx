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
import { PencilIcon } from "lucide-react";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import type { ComboUsage, ProductListItem } from "../types";

interface IngredientsTableProperties {
  deletingId: string | null;
  ingredients: readonly ProductListItem[];
  messages: Messages;
  onDelete: (productId: string) => void;
  onEdit: (product: ProductListItem) => void;
  /** Which combos each product is used in, keyed by product id. */
  usage: Map<string, ComboUsage[]>;
}

/** Past this the names stop being scannable and become a wall; the rest count. */
const NAMES_SHOWN = 3;

/** Nothing uses this ingredient — allocating a fresh [] per row would not. */
const NO_COMBOS: ComboUsage[] = [];

/**
 * Deliberately not the products table with columns hidden. An ingredient has no
 * sale price, so price/profit/margin would be three columns of zeros and dashes;
 * what it has instead is a unit, a cost per that unit, and the combos it feeds.
 * Naming those combos is the column that earns its place: it turns "is this
 * used?" into "change its cost and these are the recipes that move".
 */
export const IngredientsTable = ({
  deletingId,
  ingredients,
  messages,
  onDelete,
  onEdit,
  usage,
}: IngredientsTableProperties) => (
  // Border and rounding belong to the caller, which wraps this together
  // with the pagination bar so the two share a single outline.
  <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{messages["products.colName"]}</TableHead>
          <TableHead>{messages["products.colCategory"]}</TableHead>
          <TableHead>{messages["products.colUnit"]}</TableHead>
          <TableHead className="text-right">
            {messages["products.fieldCostPerUnit"]}
          </TableHead>
          <TableHead>{messages["products.colUsedIn"]}</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {ingredients.map((ingredient) => {
          const usedIn = usage.get(ingredient.id) ?? NO_COMBOS;
          const hidden = usedIn.length - NAMES_SHOWN;

          return (
            <TableRow key={ingredient.id}>
              <TableCell>
                <p className="truncate font-medium">{ingredient.name}</p>
              </TableCell>
              {/* Its own column, like the products and combos tables — stacked
                  under the name it could not be scanned down, and it read as part
                  of the name. Uncategorised stays muted: it is the absence of a
                  value, and as loud as a real category it makes the column
                  harder to read than no column at all. */}
              <TableCell
                className={
                  ingredient.categoryName ? undefined : "text-muted-foreground"
                }
              >
                {ingredient.categoryName ?? messages["products.noCategory"]}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {ingredient.unit ?? "—"}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatMoney(ingredient.cost)}
              </TableCell>
              <TableCell>
                {usedIn.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {usedIn.slice(0, NAMES_SHOWN).map((combo) => (
                      <Badge
                        className="max-w-40 truncate"
                        key={combo.id}
                        variant="secondary"
                      >
                        {combo.name}
                      </Badge>
                    ))}
                    {/* The overflow stays a count on purpose — the row must not
                        grow taller than the ones around it. The full list is on
                        the delete confirmation, where it actually decides
                        something. */}
                    {hidden > 0 ? (
                      <span className="text-muted-foreground text-sm tabular-nums">
                        +{hidden}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    aria-label={`${messages["common.edit"]}: ${ingredient.name}`}
                    className="text-muted-foreground"
                    onClick={() => onEdit(ingredient)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <PencilIcon className="size-5" />
                  </Button>
                  <DeleteConfirmButton
                    isPending={deletingId === ingredient.id}
                    itemName={ingredient.name}
                    messages={messages}
                    onConfirm={() => onDelete(ingredient.id)}
                    // Deleting an ingredient a combo is costed from does not
                    // break the combo, it silently makes it look cheaper. Say so.
                    warning={
                      usedIn.length > 0
                        ? `${messages["products.colUsedIn"]}: ${usedIn
                            .map((combo) => combo.name)
                            .join(", ")}`
                        : null
                    }
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </div>
);
