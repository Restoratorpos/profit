"use client";

import { useRef, useState, useTransition } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  type Cashbox,
  categoryNeedsMember,
  categoryNeedsSupplier,
  categoryNeedsWorker,
  DEFAULT_LEDGER_FILTER,
  digitsOnly,
  type LedgerFilter,
  type TransactionPage,
  type TransactionParties,
  type TxTab,
} from "@/lib/transactions";
import {
  createExpenseAction,
  createIncomeAction,
  createTransferAction,
  loadTransactionsAction,
  type TransactionResult,
  voidTransactionAction,
} from "../actions";
import { CashboxTiles } from "./cashbox-tiles";
import { EntryForm, type FormState, initialForm } from "./entry-form";
import { LedgerPanel } from "./ledger-panel";

interface TransactionsViewProperties {
  /** Fetched by the server component, so the balances never flash a zero. */
  initial: TransactionPage;
  messages: Messages;
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
  initial,
  messages,
  parties,
}: TransactionsViewProperties) => {
  const [tab, setTab] = useState<TxTab>("expense");
  const [form, setForm] = useState<FormState>(initialForm);
  const [page, setPage] = useState<TransactionPage>(initial);
  const [filter, setFilter] = useState<LedgerFilter>(DEFAULT_LEDGER_FILTER);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /*
   * Focus returns to the amount box after every save. The desk enters runs of
   * these — a shift's expenses in one sitting — and reaching for the mouse
   * between each is the whole cost of the screen.
   */
  const amountRef = useRef<HTMLInputElement>(null);

  const patch = (next: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...next }));
  };

  const apply = (result: TransactionResult, clearForm: boolean) => {
    if (result.page) {
      setPage(result.page);
    }

    if (!result.ok) {
      setError(result.error ?? messages["tx.failed"]);

      return;
    }

    setError(null);

    if (clearForm) {
      setForm((current) => ({
        ...initialForm(),
        // The till stays where the operator put it; the next entry is from it too.
        cashbox: current.cashbox,
      }));
      amountRef.current?.focus();
    }
  };

  const category =
    tab === "expense" ? form.expenseCategory : form.incomeCategory;

  const isSalaryMissingWorker =
    tab === "expense" &&
    categoryNeedsWorker(category) &&
    form.workerId === null;

  const handleSave = () => {
    const amount = digitsOnly(form.amount);
    const note = form.note.trim() || null;

    startTransition(async () => {
      if (tab === "transfer") {
        apply(
          await createTransferAction(
            { amount, from: form.cashbox, note, to: form.target },
            filter
          ),
          true
        );

        return;
      }

      if (tab === "income") {
        apply(
          await createIncomeAction(
            {
              amount,
              cashbox: form.cashbox,
              category: form.incomeCategory,
              memberId: categoryNeedsMember(form.incomeCategory)
                ? form.memberId
                : null,
              note,
            },
            filter
          ),
          true
        );

        return;
      }

      apply(
        await createExpenseAction(
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
          filter
        ),
        true
      );
    });
  };

  const handleReset = () => {
    setForm(initialForm);
    setError(null);
  };

  const handleVoid = (id: string) => {
    startTransition(async () => {
      apply(await voidTransactionAction(id, filter), false);
    });
  };

  /** Every filter change is a refetch — the list is a page, not a local slice. */
  const handleFilter = (next: LedgerFilter) => {
    setFilter(next);

    startTransition(async () => {
      apply(await loadTransactionsAction(next), false);
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
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
