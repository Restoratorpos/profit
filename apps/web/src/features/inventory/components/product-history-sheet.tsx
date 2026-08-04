import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import { HistoryIcon } from "lucide-react";
import { formatStamp } from "@/lib/date";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { useLocale } from "@/lib/i18n/provider";
import { useProductMovements } from "../api";
import { formatQuantity, type InventoryItem, movementLabel } from "../types";

interface ProductHistorySheetProperties {
  /** The row that was opened; null keeps the drawer closed. */
  item: InventoryItem | null;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
}

/**
 * One product's timeline, newest first. This is the answer to the question the
 * stock table always provokes — "why is it that number?" — which is why it opens
 * from the row itself rather than living on the history page behind a filter.
 */
export const ProductHistorySheet = ({
  item,
  messages,
  onOpenChange,
}: ProductHistorySheetProperties) => {
  const { locale } = useLocale();
  const productId = item?.id ?? null;

  /*
   * The `isCurrent` flag this replaced guarded against a slow response for a row
   * the operator had already navigated away from overwriting the row they are
   * looking at now. Keying the query by product makes that impossible rather
   * than merely handled, and reopening a row paints from cache.
   */
  const { data, isPending } = useProductMovements(productId);

  const movements = data ?? [];
  const isLoading = productId !== null && isPending;

  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(item)}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle className="truncate">{item?.name ?? ""}</SheetTitle>
          <SheetDescription>
            {messages["inventory.onHand"]}:{" "}
            <span className="font-medium tabular-nums">
              {formatQuantity(item?.stock ?? 0)}
              {item?.unit ? ` ${item.unit}` : ""}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : null}

          {isLoading || movements.length > 0 ? null : (
            <Empty className="py-12">
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
          )}

          {movements.map((movement) => {
            const quantity = Number(movement.quantity);

            return (
              <div
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                key={movement.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {movementLabel(movement, messages)}
                    </Badge>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatStamp(movement.time, locale)}
                    </span>
                  </div>
                  {movement.supplierName || movement.workerName ? (
                    <p className="mt-1 truncate text-muted-foreground text-sm">
                      {movement.supplierName ?? movement.workerName}
                    </p>
                  ) : null}
                </div>

                <div className="text-right">
                  {/* The sign is the point of the row, so it is always written
                      out — a bare "2" cannot say whether stock arrived or left. */}
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      quantity < 0 ? "text-destructive" : "text-primary-accent"
                    )}
                  >
                    {quantity > 0 ? "+" : ""}
                    {formatQuantity(movement.quantity)}
                  </span>
                  {movement.unitCost ? (
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {formatMoney(movement.unitCost)}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};
