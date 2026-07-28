"use server";

import { revalidatePath } from "next/cache";
import { BackendError, backendFetch } from "@/lib/backend";
import type { ActionResult } from "@/lib/catalog";
import type { MemberPage } from "@/lib/members";
import type {
  Cashbox,
  LedgerFilter,
  PartyOption,
  TransactionPage,
} from "@/lib/transactions";

/**
 * Every export here must be declared `async` — Next checks a "use server"
 * module syntactically, not by return type.
 *
 * A write returns the recomputed page rather than just `{ ok }`: the balance is
 * derived from the ledger, so the number moving is what tells the desk the row
 * landed, and the backend already has both in hand.
 */
export interface TransactionResult extends ActionResult {
  page?: TransactionPage;
}

/** Not exported: a "use server" module may only export async functions. */
const LEDGER_LIMIT = 100;

/** Turns the list's filter into the backend's query string. */
const toQuery = (filter?: LedgerFilter): string => {
  const params = new URLSearchParams({ limit: String(LEDGER_LIMIT) });

  if (filter?.cashbox) {
    params.set("cashbox", filter.cashbox);
  }

  if (filter?.kind) {
    params.set("kind", filter.kind);
  }

  return params.toString();
};

/**
 * Runs a write, then refetches the ledger **under the filter the list is
 * currently showing** — so saving a row does not silently reset the operator's
 * view back to everything.
 */
const run = async (
  work: () => Promise<unknown>,
  filter?: LedgerFilter
): Promise<TransactionResult> => {
  try {
    await work();

    const page = await backendFetch<TransactionPage>(
      `/transactions?${toQuery(filter)}`
    );

    /*
     * A salary or a supplier payment is money the staff and stock screens report
     * on, so both are stale the moment one is written here.
     */
    revalidatePath("/transactions");
    revalidatePath("/inventory/suppliers");
    revalidatePath("/workers");

    return { ok: true, page };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

/** Re-reads the ledger under a new filter. Writes nothing. */
export const loadTransactionsAction = async (
  filter: LedgerFilter
): Promise<TransactionResult> => {
  try {
    const page = await backendFetch<TransactionPage>(
      `/transactions?${toQuery(filter)}`
    );

    return { ok: true, page };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, error: error.message };
    }

    throw error;
  }
};

export interface IncomeInput {
  amount: string;
  cashbox: Cashbox;
  category: string;
  memberId?: string | null;
  note?: string | null;
}

export const createIncomeAction = async (
  input: IncomeInput,
  filter?: LedgerFilter
): Promise<TransactionResult> =>
  run(
    () => backendFetch("/transactions/income", { method: "POST", body: input }),
    filter
  );

export interface ExpenseInput {
  amount: string;
  cashbox: Cashbox;
  category: string;
  note?: string | null;
  supplierId?: string | null;
  workerId?: string | null;
}

export const createExpenseAction = async (
  input: ExpenseInput,
  filter?: LedgerFilter
): Promise<TransactionResult> =>
  run(
    () =>
      backendFetch("/transactions/expense", { method: "POST", body: input }),
    filter
  );

export interface TransferInput {
  amount: string;
  from: Cashbox;
  note?: string | null;
  to: Cashbox;
}

export const createTransferAction = async (
  input: TransferInput,
  filter?: LedgerFilter
): Promise<TransactionResult> =>
  run(
    () =>
      backendFetch("/transactions/transfers", { method: "POST", body: input }),
    filter
  );

export const voidTransactionAction = async (
  id: string,
  filter?: LedgerFilter
): Promise<TransactionResult> =>
  run(
    () =>
      backendFetch(`/transactions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    filter
  );

/**
 * The member picker on a custom membership payment.
 *
 * A search rather than a preloaded list: a gym's roster runs to thousands and
 * the picker is used on one category out of five, so shipping every member to
 * the browser to serve that case would be the bulk of the payload wasted.
 */
export const searchMembersAction = async (
  query: string
): Promise<PartyOption[]> => {
  const needle = query.trim();

  if (needle.length === 0) {
    return [];
  }

  try {
    const page = await backendFetch<MemberPage>(
      `/members/page?pageSize=8&filter=all&page=1&query=${encodeURIComponent(needle)}`
    );

    return page.rows.map((member) => ({
      id: member.id,
      name: member.uniqueId
        ? `${member.name} · ${member.uniqueId}`
        : member.name,
    }));
  } catch (error) {
    if (error instanceof BackendError) {
      return [];
    }

    throw error;
  }
};
