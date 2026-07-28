"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { LayersIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { type ComboListItem, formatMoney, marginPercent } from "@/lib/catalog";
import type { Messages } from "@/lib/i18n/dictionary";
import { MarginBadge } from "./catalog-bits";
import { DeleteConfirmButton } from "./delete-confirm-button";

/** The contents button in the Tarkibi column: opens the combo's makeup on click. */
const ComboContents = ({
  combo,
  messages,
}: {
  combo: ComboListItem;
  messages: Messages;
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        aria-label={`${messages["combos.colComponents"]}: ${combo.name}`}
        className="gap-1.5 text-muted-foreground"
        size="sm"
        variant="outline"
      >
        <LayersIcon className="size-4" />
        {combo.components.length}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80 p-0">
      <p className="border-b px-3 py-2 font-medium text-sm">
        {messages["combos.colComponents"]}
      </p>
      <ul className="flex flex-col gap-2 p-3">
        {combo.components.map((component) => (
          <li
            className="flex items-center justify-between gap-3 text-sm"
            key={component.productId}
          >
            <span className="min-w-0 flex-1 truncate">{component.name}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {Number(component.quantity)} {component.unit ?? "kg"}
            </span>
            {/* The line's share of the combo's cost — the reason a component is
                in the list at all, and previously only visible in the editor. */}
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {formatMoney(component.lineCost)}
            </span>
          </li>
        ))}
      </ul>
    </PopoverContent>
  </Popover>
);

interface CombosTableProperties {
  combos: readonly ComboListItem[];
  deletingComboId: string | null;
  messages: Messages;
  onDelete: (comboId: string) => void;
  typeLabel: (productType: string | null) => string;
}

export const CombosTable = ({
  combos,
  deletingComboId,
  messages,
  onDelete,
  typeLabel,
}: CombosTableProperties) => (
  // Border and rounding belong to the caller, which wraps this together
  // with the pagination bar so the two share a single outline.
  <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{messages["products.colName"]}</TableHead>
          <TableHead>{messages["products.colType"]}</TableHead>
          <TableHead>{messages["products.colCategory"]}</TableHead>
          <TableHead>{messages["combos.colComponents"]}</TableHead>
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
        {combos.map((combo) => (
          <TableRow key={combo.id}>
            <TableCell>
              <p className="truncate font-medium">{combo.name}</p>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{typeLabel(combo.productType)}</Badge>
            </TableCell>
            {/* Same column, same place as the products table above it — the two
                are read as one page, so a category cannot live in a subtitle in
                one of them and a column in the other. */}
            <TableCell
              className={
                combo.categoryName ? undefined : "text-muted-foreground"
              }
            >
              {combo.categoryName ?? messages["products.noCategory"]}
            </TableCell>
            <TableCell>
              <ComboContents combo={combo} messages={messages} />
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatMoney(combo.price)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {formatMoney(combo.cost)}
            </TableCell>
            <TableCell className="text-right font-medium text-primary-accent">
              {formatMoney(combo.profit)}
            </TableCell>
            <TableCell className="text-right">
              <MarginBadge percent={marginPercent(combo.price, combo.cost)} />
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                <Button
                  aria-label={`${messages["common.edit"]}: ${combo.name}`}
                  asChild
                  className="text-muted-foreground"
                  size="icon-sm"
                  variant="ghost"
                >
                  <Link href={`/products/combos/${combo.id}`}>
                    <PencilIcon className="size-5" />
                  </Link>
                </Button>
                <DeleteConfirmButton
                  isPending={deletingComboId === combo.id}
                  itemName={combo.name}
                  messages={messages}
                  onConfirm={() => onDelete(combo.id)}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
