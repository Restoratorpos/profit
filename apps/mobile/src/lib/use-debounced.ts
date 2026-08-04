import { useEffect, useState } from "react";

/**
 * The value, but only once it has stopped changing for `delay` milliseconds.
 *
 * Every list screen here searches server-side, and a phone keyboard emits
 * keystrokes faster than a request can come back. Without this, typing a
 * seven-digit phone number is seven round trips, six of which are already stale
 * by the time they land — and React Query would key and cache all seven.
 */
export const useDebounced = <T>(value: T, delay: number): T => {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [delay, value]);

  return settled;
};
