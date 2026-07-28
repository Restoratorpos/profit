"use client";

import { useMemo, useState } from "react";

/**
 * Paging for lists that are already in the browser.
 *
 * These four screens fetch the whole list and filter it here, which is what
 * makes their search and their counts instant. Paging on the server would take
 * that away — every keystroke would become a round trip, and the filter counts
 * would need the server to answer a second question about rows it is not
 * sending. So this slices what is already held rather than asking for less.
 *
 * That trade stops working somewhere north of a few thousand rows per gym, at
 * which point the search and the counts have to move to the backend together
 * with the paging — not this hook alone.
 */

export const PAGE_SIZES = [25, 50, 100] as const;

export interface Pagination<T> {
  lastPage: number;
  page: number;
  pageSize: number;
  /** The slice to render. */
  rows: readonly T[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  total: number;
}

export const usePagination = <T>(items: readonly T[]): Pagination<T> => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);

  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  /*
   * Clamped rather than reset in an effect. Filtering down to three rows while
   * sitting on page 4 has to show something, and an effect would render the
   * empty page first and only then correct itself — a blank flash on every
   * keystroke that narrows the list.
   */
  const current = Math.min(page, lastPage);

  const rows = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [current, items, pageSize]
  );

  return {
    lastPage,
    page: current,
    pageSize,
    rows,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    total,
  };
};
