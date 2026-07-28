"use client";

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
import {
  formatMoney,
  marginPercent,
  type ProductListItem,
  profitOf,
} from "@/lib/catalog";
import type { Messages } from "@/lib/i18n/dictionary";
import { ColorSwatch, MarginBadge } from "./catalog-bits";
import { DeleteConfirmButton } from "./delete-confirm-button";

interface ProductsTableProperties {
  deletingId: string | null;
  messages: Messages;
  onDelete: (productId: string) => void;
  onEdit: (product: ProductListItem) => void;
  products: readonly ProductListItem[];
  typeLabel: (productType: string | null) => string;
}

export const ProductsTable = ({
  deletingId,
  messages,
  onDelete,
  onEdit,
  products,
  typeLabel,
}: ProductsTableProperties) => (
  // Border and rounding belong to the caller, which wraps this together
  // with the pagination bar so the two share a single outline.
  <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          {/* Indented to sit directly over the name rather than over the colour
              swatch: the cell's own 16px, plus the 24px square and the 12px gap
              the name starts after. Change either and this has to follow. */}
          <TableHead className="pl-13">
            {messages["products.colName"]}
          </TableHead>
          <TableHead>{messages["products.colType"]}</TableHead>
          <TableHead>{messages["products.colCategory"]}</TableHead>
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
            {messages["products.colMargin"]}
          </TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            {/* Colour and name, one line. The swatch is a miniature of the POS
                tile, which is how the operator recognises the product before
                reading anything. */}
            <TableCell>
              <div className="flex items-center gap-3">
                <ColorSwatch color={product.color} />
                <p className="min-w-0 truncate font-medium">{product.name}</p>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{typeLabel(product.productType)}</Badge>
            </TableCell>
            {/* Uncategorised is muted: it is the absence of a value, and reading
                as loud as a real category would make the column harder to scan
                than no column at all. */}
            <TableCell
              className={
                product.categoryName ? undefined : "text-muted-foreground"
              }
            >
              {product.categoryName ?? messages["products.noCategory"]}
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatMoney(product.price)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {formatMoney(product.cost)}
            </TableCell>
            <TableCell className="text-right font-medium text-primary-accent">
              {formatMoney(profitOf(product))}
            </TableCell>
            <TableCell className="text-right">
              <MarginBadge
                percent={marginPercent(product.price, product.cost)}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                <Button
                  aria-label={`${messages["common.edit"]}: ${product.name}`}
                  className="text-muted-foreground"
                  onClick={() => onEdit(product)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <PencilIcon className="size-5" />
                </Button>
                <DeleteConfirmButton
                  isPending={deletingId === product.id}
                  itemName={product.name}
                  messages={messages}
                  onConfirm={() => onDelete(product.id)}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
