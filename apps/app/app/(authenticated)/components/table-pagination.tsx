"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Messages } from "@/lib/i18n/dictionary";
import { PAGE_SIZES, type Pagination } from "./use-pagination";

/**
 * The bar under a table: how many rows a page holds, where you are, and the two
 * arrows. Modelled on the one the attendance table already had, so the lists do
 * not each invent their own.
 */
export const TablePagination = <T,>({
  messages,
  pagination,
}: {
  messages: Messages;
  pagination: Pagination<T>;
}) => {
  const { lastPage, page, pageSize, setPage } = pagination;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {messages["common.rows"]}:
        </span>
        {PAGE_SIZES.map((size) => (
          <Button
            aria-pressed={pageSize === size}
            className={cn(pageSize !== size && "text-muted-foreground")}
            key={size}
            onClick={() => pagination.setPageSize(size)}
            size="sm"
            variant={pageSize === size ? "default" : "ghost"}
          >
            {size}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button
          aria-label={messages["common.prevPage"]}
          disabled={page <= 1}
          onClick={() => setPage(Math.max(1, page - 1))}
          size="icon-sm"
          variant="outline"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="text-sm tabular-nums">
          {page} / {lastPage}
        </span>
        <Button
          aria-label={messages["common.nextPage"]}
          disabled={page >= lastPage}
          onClick={() => setPage(Math.min(lastPage, page + 1))}
          size="icon-sm"
          variant="outline"
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
};
