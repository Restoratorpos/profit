import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { MemberPage } from "@/features/members/types";
import { apiDelete, apiFetch, apiPost } from "@/lib/api/client";
import type {
  Cashbox,
  LedgerFilter,
  PartyOption,
  TransactionPage,
  TransactionParties,
} from "./types";

/**
 * How many rows the ledger asks for. The desk scans recent activity rather than
 * paging through history, so this is a window, not a paginator.
 */
const LEDGER_LIMIT = 100;

export const transactionKeys = {
  all: ["transactions"] as const,
  ledger: (filter: LedgerFilter) =>
    [...transactionKeys.all, "ledger", filter] as const,
  parties: () => [...transactionKeys.all, "parties"] as const,
};

/** Turns the list's filter into the backend's query string. */
const toQuery = (filter: LedgerFilter): string => {
  const params = new URLSearchParams({ limit: String(LEDGER_LIMIT) });

  if (filter.cashbox) {
    params.set("cashbox", filter.cashbox);
  }

  if (filter.kind) {
    params.set("kind", filter.kind);
  }

  return params.toString();
};

/**
 * The ledger, keyed by the filter it is showing.
 *
 * This replaces `loadTransactionsAction` outright. In the Next version changing
 * a filter meant calling an action and hand-applying the result, and every write
 * had to remember to refetch *under the filter currently on screen* or it would
 * silently reset the operator's view to everything. Putting the filter in the
 * query key makes both automatic: changing it refetches, and invalidating after
 * a write refetches whatever filter is active.
 */
export const ledgerQuery = (filter: LedgerFilter) =>
  queryOptions({
    queryKey: transactionKeys.ledger(filter),
    queryFn: () =>
      apiFetch<TransactionPage>(`/transactions?${toQuery(filter)}`),
  });

export const partiesQuery = queryOptions({
  queryKey: transactionKeys.parties(),
  queryFn: () => apiFetch<TransactionParties>("/transactions/parties"),
});

export const useLedger = (filter: LedgerFilter) =>
  useQuery(ledgerQuery(filter));
export const useParties = () => useQuery(partiesQuery);

export interface IncomeInput {
  amount: string;
  cashbox: Cashbox;
  category: string;
  memberId?: string | null;
  note?: string | null;
}

export interface ExpenseInput {
  amount: string;
  cashbox: Cashbox;
  category: string;
  note?: string | null;
  supplierId?: string | null;
  workerId?: string | null;
}

export interface TransferInput {
  amount: string;
  from: Cashbox;
  note?: string | null;
  to: Cashbox;
}

/**
 * Money written here shows up on two other screens.
 *
 * A salary is what the staff screen reports as paid, and a supplier payment is
 * what the stock screen reports as owed — both are stale the moment a row lands
 * here. The Next version said the same thing as three `revalidatePath` calls.
 */
const useSettleLedger = () => {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    queryClient.invalidateQueries({ queryKey: ["workers"] });
  };
};

export const useCreateIncome = () => {
  const settle = useSettleLedger();

  return useMutation({
    mutationFn: (input: IncomeInput) =>
      apiPost<void>("/transactions/income", input),
    onSuccess: settle,
  });
};

export const useCreateExpense = () => {
  const settle = useSettleLedger();

  return useMutation({
    mutationFn: (input: ExpenseInput) =>
      apiPost<void>("/transactions/expense", input),
    onSuccess: settle,
  });
};

export const useCreateTransfer = () => {
  const settle = useSettleLedger();

  return useMutation({
    mutationFn: (input: TransferInput) =>
      apiPost<void>("/transactions/transfers", input),
    onSuccess: settle,
  });
};

export const useVoidTransaction = () => {
  const settle = useSettleLedger();

  return useMutation({
    mutationFn: (id: string) =>
      apiDelete(`/transactions/${encodeURIComponent(id)}`),
    onSuccess: settle,
  });
};

/**
 * The member picker on a custom membership payment.
 *
 * A search rather than a preloaded list: a gym's roster runs to thousands and
 * the picker is used on one category out of five, so shipping every member to
 * the browser to serve that case would be most of the payload wasted.
 *
 * Left as a plain function rather than a hook — the combobox calls it
 * imperatively as the operator types, and an empty result is the right answer
 * for a failed lookup rather than an error to surface mid-keystroke.
 */
export const searchMembers = async (query: string): Promise<PartyOption[]> => {
  const needle = query.trim();

  if (needle.length === 0) {
    return [];
  }

  try {
    const page = await apiFetch<MemberPage>(
      `/members/page?pageSize=8&filter=all&page=1&query=${encodeURIComponent(needle)}`
    );

    return page.rows.map((member) => ({
      id: member.id,
      name: member.uniqueId
        ? `${member.name} · ${member.uniqueId}`
        : member.name,
    }));
  } catch {
    return [];
  }
};
