import { useEffect, useState } from "react";

/**
 * Trails `value` by `delay`, so a query keyed by the result runs once the user
 * stops typing rather than once per keystroke.
 *
 * Only for values that cost a **server round trip**. A list filtered in memory
 * should not be debounced — that adds latency to work that was already instant.
 * Use `useDeferredValue` there if a big list ever makes typing stutter.
 *
 * The returned value starts equal to `value` rather than at some default, so
 * the first render already holds the real query. Seeded with a default instead,
 * a screen that opens with a non-default filter fires one request for the
 * default and then immediately another for the truth.
 *
 * Pair with `keepPreviousData` on the query: the table then holds the last
 * result while the next one is in flight instead of blanking between keystrokes.
 *
 * `value` is compared by identity, so an object built inline re-arms the timer
 * on every render and nothing is ever committed. Memoize it first.
 */
export const useDebouncedValue = <T>(value: T, delay = 250): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};
