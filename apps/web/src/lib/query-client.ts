import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";

/**
 * The client cache, which is what replaces Next's server fetch + revalidatePath.
 *
 * `revalidatePath("/members")` becomes
 * `queryClient.invalidateQueries({ queryKey: ["members"] })` — a 1:1 mapping, so
 * the twelve actions.ts files translate directly when Phase 4 ports them.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /*
       * Two operators work the same data from different terminals, so a list
       * that never refetches goes quietly wrong. Thirty seconds is long enough
       * that moving between pages feels instant and short enough that a member
       * added at the other desk shows up on its own.
       */
      staleTime: 30_000,
      // Kept an hour after the last component unmounts, so returning to a page
      // paints from cache and revalidates behind it.
      gcTime: 60 * 60 * 1000,
      // The desk terminal gets focused constantly; refetching every time is
      // noise. staleTime already covers freshness.
      refetchOnWindowFocus: false,
      // Worth it here: the terminal's Wi-Fi drops, and a reconnect is exactly
      // when the screen is most likely to be stale.
      refetchOnReconnect: true,
      // The API is on the LAN. Failing twice is a real failure, not a flake.
      retry: 1,
    },
    mutations: {
      // Never retry a write blindly: "create member" twice is two members.
      retry: 0,
    },
  },
});

const PERSIST_KEY = "profit-query-cache";

/**
 * Persists the cache so a reload paints immediately instead of flashing
 * skeletons — the closest thing a SPA has to the server-rendered first paint
 * this app is giving up.
 *
 * Note what this means: tenant data sits in localStorage on the terminal. That
 * is acceptable only because the cache is busted per user and purged on sign
 * out (see AuthProvider) — a front desk is a shared machine, and the next
 * operator must not find the previous one's members in it.
 */
export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: PERSIST_KEY,
  // A quota error must not take the app down; losing the cache is survivable.
  throttleTime: 1000,
});

/**
 * Drops everything held for the previous operator.
 *
 * Synchronous, and worth keeping that way: both halves are synchronous APIs, so
 * making this a promise would only invite callers to forget to await it — at
 * which point the next operator's first paint could come from the last one's
 * cache.
 */
export const purgeCache = (): void => {
  queryClient.clear();

  try {
    window.localStorage.removeItem(PERSIST_KEY);
  } catch {
    // Storage throws in private browsing and when the quota is blown. The
    // in-memory clear above is the part that actually matters.
  }
};
