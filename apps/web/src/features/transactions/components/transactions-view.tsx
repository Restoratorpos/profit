import { useRef, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import { toBareAmount } from "@/lib/money";
import {
  useCreateExpense,
  useCreateIncome,
  useCreateTransfer,
  useVoidTransaction,
} from "../api";
import {
  type Cashbox,
  categoryNeedsMember,
  categoryNeedsSupplier,
  categoryNeedsWorker,
  type LedgerFilter,
  type TransactionPage,
  type TransactionParties,
  type TxTab,
} from "../types";
import { CashboxTiles } from "./cashbox-tiles";
import { EntryForm, type FormState, initialForm } from "./entry-form";
import { LedgerPanel } from "./ledger-panel";

interface TransactionsViewProperties {
  filter: LedgerFilter;
  messages: Messages;
  onFilterChange: (next: LedgerFilter) => void;
  /** The ledger under the current filter. Owned by the page's query. */
  page: TransactionPage;
  parties: TransactionParties;
}

/**
 * Tiles across the top, form on the left, ledger on the right.
 *
 * This holds all the state and the three panels hold none: the ledger's filter
 * changes what the tiles highlight, and a save has to refresh both the balances
 * and the list, so a single owner is the only arrangement where those cannot
 * disagree with each other.
 */
export const TransactionsView = ({
  filter,
  messages,
  onFilterChange,
  page,
  parties,
}: TransactionsViewProperties) => {
  const [tab, setTab] = useState<TxTab>("expense");
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState<string | null>(null);

  /*
   * The ledger and the balances are no longer state here. They come from a
   * query keyed by the filter, so a filter change refetches and every write
   * refetches under whatever filter is on screen — which the Next version had
   * to arrange by hand, threading `filter` into each action and applying the
   * page it returned.
   */
  const createIncome = useCreateIncome();
  const createExpense = useCreateExpense();
  const createTransfer = useCreateTransfer();
  const voidTransaction = useVoidTransaction();

  const isPending =
    createIncome.isPending ||
    createExpense.isPending ||
    createTransfer.isPending ||
    voidTransaction.isPending;

  /*
   * Focus returns to the amount box after every save. The desk enters runs of
   * these — a shift's expenses in one sitting — and reaching for the mouse
   * between each is the whole cost of the screen.
   */
  const amountRef = useRef<HTMLInputElement>(null);

  const patch = (next: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...next }));
  };

  /** Shared by all three writes: clear the form, keep the till, refocus. */
  const onSaved = () => {
    setError(null);
    setForm((current) => ({
      ...initialForm(),
      // The till stays where the operator put it; the next entry is from it too.
      cashbox: current.cashbox,
    }));
    amountRef.current?.focus();
  };

  const onFailed = (cause: Error) => {
    setError(cause.message || messages["tx.failed"]);
  };

  const handlers = { onError: onFailed, onSuccess: onSaved };

  const category =
    tab === "expense" ? form.expenseCategory : form.incomeCategory;

  const isSalaryMissingWorker =
    tab === "expense" &&
    categoryNeedsWorker(category) &&
    form.workerId === null;

  const handleSave = () => {
    const amount = toBareAmount(form.amount);
    const note = form.note.trim() || null;

    if (tab === "transfer") {
      createTransfer.mutate(
        { amount, from: form.cashbox, note, to: form.target },
        handlers
      );

      return;
    }

    if (tab === "income") {
      createIncome.mutate(
        {
          amount,
          cashbox: form.cashbox,
          category: form.incomeCategory,
          memberId: categoryNeedsMember(form.incomeCategory)
            ? form.memberId
            : null,
          note,
        },
        handlers
      );

      return;
    }

    createExpense.mutate(
      {
        amount,
        cashbox: form.cashbox,
        category: form.expenseCategory,
        note,
        supplierId: categoryNeedsSupplier(form.expenseCategory)
          ? form.supplierId
          : null,
        workerId: categoryNeedsWorker(form.expenseCategory)
          ? form.workerId
          : null,
      },
      handlers
    );
  };

  const handleReset = () => {
    setForm(initialForm);
    setError(null);
  };

  const handleVoid = (id: string) => {
    // Voiding leaves the form alone — the operator was not filling one in.
    voidTransaction.mutate(id, {
      onError: onFailed,
      onSuccess: () => setError(null),
    });
  };

  /**
   * Just sets the filter. The query is keyed by it, so changing it *is* the
   * refetch — there is nothing to load by hand any more.
   */
  const handleFilter = (next: LedgerFilter) => {
    onFilterChange(next);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="sr-only">{messages["nav.transactions"]}</h1>

      <CashboxTiles
        balances={page.balances}
        messages={messages}
        onSelect={(cashbox: Cashbox | null) =>
          handleFilter({ ...filter, cashbox })
        }
        selected={filter.cashbox}
        today={page.today}
      />

      {/* The form keeps a fixed, readable column; the ledger takes the rest.
          Below `xl` they stack, form first — on a narrow desk terminal the thing
          being typed matters more than the history beside it. */}
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
        <EntryForm
          amountRef={amountRef}
          error={error}
          form={form}
          isPending={isPending}
          isSalaryMissingWorker={isSalaryMissingWorker}
          messages={messages}
          onPatch={patch}
          onReset={handleReset}
          onSave={handleSave}
          onTab={(next) => {
            setTab(next);
            setError(null);
          }}
          parties={parties}
          tab={tab}
        />

        <LedgerPanel
          disabled={isPending}
          filter={filter}
          messages={messages}
          onFilter={handleFilter}
          onVoid={handleVoid}
          rows={page.rows}
        />
      </div>
    </div>
  );
};
