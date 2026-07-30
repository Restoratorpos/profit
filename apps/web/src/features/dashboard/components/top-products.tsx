import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import { TrophyIcon } from "lucide-react";
import type { Messages } from "@/lib/i18n/dictionary";
import { formatAmount, type TopProduct } from "../types";

/**
 * What sold best over the window the chart is showing.
 *
 * It sits beside the chart rather than under it because it answers the follow-up
 * question: the chart says the shop had a good fortnight, this says what it was
 * selling. It therefore reads the same range — passing it a different window
 * would put two periods side by side with nothing saying so.
 *
 * Ranked by takings, not by units. Selling two hundred bottles of water is not
 * the achievement selling four personal-training packages is.
 */

interface TopProductsProperties {
  isStale: boolean;
  messages: Messages;
  products: TopProduct[];
}

export const TopProducts = ({
  isStale,
  messages,
  products,
}: TopProductsProperties) => (
  <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
    <header className="flex min-w-0 items-center gap-2">
      <TrophyIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <h3 className="truncate font-medium text-body">
        {messages["dash.topProducts"]}
      </h3>
    </header>

    {products.length === 0 ? (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle className="text-body">
            {messages["dash.topEmpty"]}
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    ) : (
      <div
        className={cn(
          "min-w-0 overflow-x-auto transition-opacity",
          isStale && "opacity-60"
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{messages["dash.colProduct"]}</TableHead>
              <TableHead className="text-right">
                {messages["dash.colQty"]}
              </TableHead>
              <TableHead className="text-right">
                {messages["dash.colRevenue"]}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="max-w-40 truncate font-medium">
                  {product.name}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {formatAmount(product.quantity)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                  {formatAmount(product.revenue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )}
  </section>
);
