import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowUpIcon,
  BanknoteIcon,
  CheckIcon,
  CreditCardIcon,
  LandmarkIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import type { Messages } from "@/lib/i18n/dictionary";
import { toBareAmount } from "@/lib/money";
import { searchMembers } from "../api";
import {
  ACTIVE_FILL_DANGER,
  CASHBOX_LABEL,
  CASHBOXES,
  type Cashbox,
  categoryNeedsMember,
  categoryNeedsSupplier,
  categoryNeedsWorker,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  labelForCategory,
  type PartyOption,
  type TransactionParties,
  TX_TABS,
  type TxTab,
} from "../types";

/**
 * The entry form. One column, one field per line, in the order the desk fills
 * them: how much, where it goes, what for, who for, why.
 *
 * Payment type is a field of its own now rather than a dropdown at the top of
 * the page doing double duty as both the list's filter and the new row's till.
 * One control cannot mean two things without the operator eventually getting one
 * of them wrong, and the one it would get wrong is where the money landed.
 */

const TAB_META: Record<
  TxTab,
  { icon: typeof ArrowUpIcon; labelKey: keyof Messages }
> = {
  expense: { icon: ArrowUpIcon, labelKey: "tx.tabExpense" },
  income: { icon: ArrowDownIcon, labelKey: "tx.tabIncome" },
  transfer: { icon: ArrowLeftRightIcon, labelKey: "tx.tabTransfer" },
};

const CASHBOX_ICON: Record<Cashbox, typeof BanknoteIcon> = {
  card: CreditCardIcon,
  cash: BanknoteIcon,
  transfer: LandmarkIcon,
};

/** "Not chosen" as a Select value — Radix rejects "" as an item value. */
export const NONE = "__none__";

export interface FormState {
  amount: string;
  cashbox: Cashbox;
  expenseCategory: string;
  incomeCategory: string;
  memberId: string | null;
  memberLabel: string;
  note: string;
  supplierId: string | null;
  target: Cashbox;
  workerId: string | null;
}

/*
 * The screen opens on the expense tab, so `expenseCategory` is what it opens on
 * full stop — and it is `supplier` (Tovar xaridi) rather than `salary` for two
 * reasons. It is what the desk actually types most of: goods bought in, several
 * times a shift, against a wage run once a month. And a salary needs a worker
 * attached before it can be saved, so opening on it meant opening on a form that
 * refused to submit until a second field was answered.
 */
export const initialForm = (): FormState => ({
  amount: "",
  cashbox: "cash",
  expenseCategory: "supplier",
  incomeCategory: "membership",
  memberId: null,
  memberLabel: "",
  note: "",
  supplierId: null,
  target: "transfer",
  workerId: null,
});

/**
 * Payment type as three buttons rather than a dropdown. It has exactly three
 * options that never grow, it is answered on every single entry, and a segmented
 * control shows the chosen one without being opened — which a Select cannot.
 */
const CashboxChoice = ({
  disabled,
  exclude,
  id,
  label,
  messages,
  onChange,
  value,
}: {
  disabled: boolean;
  /** The other side of a transfer — money cannot move to where it already is. */
  exclude?: Cashbox;
  id: string;
  label: string;
  messages: Messages;
  onChange: (next: Cashbox) => void;
  value: Cashbox;
}) => (
  <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <div className="grid grid-cols-3 gap-2" id={id}>
      {CASHBOXES.map((box) => {
        const Icon = CASHBOX_ICON[box];
        const isActive = value === box;

        return (
          <Button
            aria-pressed={isActive}
            className={cn("justify-center", isActive && "font-semibold")}
            disabled={disabled || box === exclude}
            key={box}
            onClick={() => onChange(box)}
            variant={isActive ? "default" : "outline"}
          >
            <Icon className="size-4" />
            {messages[CASHBOX_LABEL[box]]}
          </Button>
        );
      })}
    </div>
  </Field>
);

/** A labelled Select over `{ id, name }` — five fields here are exactly that. */
const PickerField = ({
  disabled,
  id,
  invalid,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled: boolean;
  id: string;
  invalid?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: readonly { id: string; name: string }[];
  placeholder?: string;
  value: string;
}) => (
  <Field data-invalid={invalid || undefined}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select disabled={disabled} onValueChange={onChange} value={value}>
      <SelectTrigger aria-invalid={invalid} className="w-full" id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
);

/**
 * The member search on a custom membership payment. Debounced for the same
 * reason the roster's own search is — every keystroke is a round trip — and it
 * drops its own late replies, so a slow answer for "ali" cannot overwrite the
 * results for "alisher".
 */
const MemberPicker = ({
  disabled,
  label,
  messages,
  onPick,
  value,
}: {
  disabled: boolean;
  label: string;
  messages: Messages;
  onPick: (member: PartyOption | null) => void;
  value: string | null;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PartyOption[]>([]);
  const [isSearching, setSearching] = useState(false);

  useEffect(() => {
    const needle = query.trim();

    if (value !== null || needle.length === 0) {
      setResults([]);
      setSearching(false);

      return;
    }

    let cancelled = false;

    setSearching(true);

    const timer = setTimeout(async () => {
      const found = await searchMembers(needle);

      if (!cancelled) {
        setResults(found);
        setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, value]);

  if (value !== null) {
    return (
      <Field>
        <FieldLabel>{messages["tx.member"]}</FieldLabel>
        <div className="flex items-center gap-2">
          <Badge className="px-3 py-1.5 text-sm" variant="secondary">
            {label}
          </Badge>
          <Button
            aria-label={messages["tx.memberClear"]}
            disabled={disabled}
            onClick={() => {
              onPick(null);
              setQuery("");
            }}
            size="icon-sm"
            title={messages["tx.memberClear"]}
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <Field>
      <FieldLabel htmlFor="tx-member">{messages["tx.member"]}</FieldLabel>
      <Input
        autoComplete="off"
        disabled={disabled}
        id="tx-member"
        onChange={(event) => setQuery(event.target.value)}
        placeholder={messages["tx.memberSearch"]}
        value={query}
      />
      {isSearching ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner className="size-4" />
          {messages["tx.searching"]}
        </p>
      ) : null}
      {results.length > 0 ? (
        <div className="flex max-h-56 flex-col overflow-y-auto rounded-lg border">
          {results.map((member) => (
            <Button
              className="justify-start rounded-none"
              key={member.id}
              onClick={() => {
                onPick(member);
                setQuery("");
              }}
              variant="ghost"
            >
              {member.name}
            </Button>
          ))}
        </div>
      ) : null}
    </Field>
  );
};

interface EntryFormProperties {
  amountRef: React.RefObject<HTMLInputElement | null>;
  error: string | null;
  form: FormState;
  isPending: boolean;
  isSalaryMissingWorker: boolean;
  messages: Messages;
  onPatch: (next: Partial<FormState>) => void;
  onReset: () => void;
  onSave: () => void;
  onTab: (tab: TxTab) => void;
  parties: TransactionParties;
  tab: TxTab;
}

export const EntryForm = ({
  amountRef,
  error,
  form,
  isPending,
  isSalaryMissingWorker,
  messages,
  onPatch,
  onReset,
  onSave,
  onTab,
  parties,
  tab,
}: EntryFormProperties) => {
  const isTransfer = tab === "transfer";
  const isExpense = tab === "expense";

  const categories = isExpense ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const category = isExpense ? form.expenseCategory : form.incomeCategory;

  const categoryOptions = categories.map((key) => ({
    id: key,
    name: messages[labelForCategory(key)],
  }));

  const supplierOptions = [
    { id: NONE, name: messages["tx.supplierNone"] },
    ...parties.suppliers,
  ];

  const canSave =
    toBareAmount(form.amount).length > 0 &&
    Number(toBareAmount(form.amount)) > 0 &&
    !isSalaryMissingWorker &&
    !(isTransfer && form.cashbox === form.target) &&
    !isPending;

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      {/* Three tabs, not four — a gym on this plan does not file its tax from the
          front desk, so a Tax payment tab would be a permanently empty ledger. */}
      <div
        aria-label={messages["tx.kind"]}
        className="flex items-center gap-1 rounded-lg bg-muted p-1"
        role="tablist"
      >
        {TX_TABS.map((key) => {
          const meta = TAB_META[key];
          const Icon = meta.icon;
          const isActive = tab === key;

          return (
            <Button
              aria-selected={isActive}
              className={cn(
                "flex-1",
                // Money out is red once it is the tab being filled in — the same
                // signal the ledger rows already use, so the form and the list
                // agree about which direction the operator is looking at. Money
                // in needs nothing: that is the Button's own filled variant.
                isActive && key === "expense" && ACTIVE_FILL_DANGER
              )}
              key={key}
              onClick={() => onTab(key)}
              role="tab"
              variant={isActive ? "default" : "ghost"}
            >
              <Icon className="size-4" />
              {messages[meta.labelKey]}
            </Button>
          );
        })}
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="tx-amount">{messages["tx.amount"]}</FieldLabel>
          {/* The one figure the whole screen exists to capture, so it is set
              larger than everything around it. Digits in state, grouped only for
              reading — the submitted value is never the formatted string. */}
          <div className="relative">
            <MoneyInput
              autoComplete="off"
              className="h-14 pr-16 font-semibold text-2xl tabular-nums"
              disabled={isPending}
              id="tx-amount"
              onChange={(amount) => onPatch({ amount })}
              placeholder="0"
              ref={amountRef}
              value={form.amount}
            />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground text-sm">
              {messages["tx.currency"]}
            </span>
          </div>
        </Field>

        <CashboxChoice
          disabled={isPending}
          id="tx-cashbox"
          label={
            isTransfer ? messages["tx.fromCashbox"] : messages["tx.method"]
          }
          messages={messages}
          onChange={(next) => onPatch({ cashbox: next })}
          value={form.cashbox}
        />

        {isTransfer ? (
          <CashboxChoice
            disabled={isPending}
            exclude={form.cashbox}
            id="tx-target"
            label={messages["tx.targetCashbox"]}
            messages={messages}
            onChange={(next) => onPatch({ target: next })}
            value={form.target}
          />
        ) : (
          <PickerField
            disabled={isPending}
            id="tx-category"
            label={messages["tx.category"]}
            onChange={(value) =>
              onPatch(
                isExpense
                  ? { expenseCategory: value }
                  : { incomeCategory: value }
              )
            }
            options={categoryOptions}
            value={category}
          />
        )}

        {/* Salary names a worker. Required — an unattributed salary cannot be
            reconciled against anybody's pay later. */}
        {isExpense && categoryNeedsWorker(category) ? (
          <PickerField
            disabled={isPending}
            id="tx-worker"
            invalid={isSalaryMissingWorker}
            label={messages["tx.worker"]}
            onChange={(value) => onPatch({ workerId: value })}
            options={parties.workers}
            placeholder={messages["tx.workerPick"]}
            value={form.workerId ?? ""}
          />
        ) : null}

        {/* Goods names a supplier, and does not require one — plenty is bought
            from a market stall that will never be a row in `suppliers`. */}
        {isExpense && categoryNeedsSupplier(category) ? (
          <PickerField
            disabled={isPending}
            id="tx-supplier"
            label={messages["tx.supplier"]}
            onChange={(value) =>
              onPatch({ supplierId: value === NONE ? null : value })
            }
            options={supplierOptions}
            value={form.supplierId ?? NONE}
          />
        ) : null}

        {tab === "income" && categoryNeedsMember(category) ? (
          <MemberPicker
            disabled={isPending}
            label={form.memberLabel}
            messages={messages}
            onPick={(member) =>
              onPatch({
                memberId: member?.id ?? null,
                memberLabel: member?.name ?? "",
              })
            }
            value={form.memberId}
          />
        ) : null}

        <Field>
          <FieldLabel htmlFor="tx-note">{messages["tx.note"]}</FieldLabel>
          <Textarea
            disabled={isPending}
            id="tx-note"
            onChange={(event) => onPatch({ note: event.target.value })}
            placeholder={messages["tx.notePlaceholder"]}
            rows={2}
            value={form.note}
          />
        </Field>
      </FieldGroup>

      {error ? (
        <p
          className="rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {isSalaryMissingWorker ? (
        <p className="text-destructive text-sm" role="alert">
          {messages["tx.workerRequired"]}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          className="flex-1"
          disabled={!canSave}
          onClick={onSave}
          size="lg"
        >
          {isPending ? (
            <Spinner className="size-4" />
          ) : (
            <CheckIcon className="size-5" />
          )}
          {messages["tx.save"]}
        </Button>
        <Button
          aria-label={messages["tx.reset"]}
          disabled={isPending}
          onClick={onReset}
          size="icon-lg"
          title={messages["tx.reset"]}
          variant="outline"
        >
          <RotateCcwIcon className="size-5" />
        </Button>
      </div>
    </section>
  );
};
