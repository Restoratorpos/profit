"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { cn } from "@repo/design-system/lib/utils";
import { ClipboardListIcon, Undo2Icon } from "lucide-react";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  ACTIVE_FILL_DANGER,
  CASHBOX_LABEL,
  CASHBOXES,
  type Cashbox,
  formatSigned,
  formatTime,
  LEDGER_KINDS,
  type LedgerFilter,
  labelForCategory,
  type TransactionRow,
} from "@/lib/transactions";

/**
 * The ledger beside the form, rather than under it.
 *
 * The desk types a row and checks it landed; putting the list where that check
 * costs a scroll is the whole reason the original layout felt empty at the top
 * and cramped at the bottom. Side by side, both halves are on screen at once and
 * the page uses its width.
 */

const isKnownCashbox = (value: string | null): value is Cashbox =>
  value !== null && (CASHBOXES as readonly string[]).includes(value);

const LedgerRow = ({
  disabled,
  messages,
  onVoid,
  row,
}: {
  disabled: boolean;
  messages: Messages;
  onVoid: (id: string) => void;
  row: TransactionRow;
}) => {
  const isIncome = row.kind === "income";

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40",
        row.isVoided && "opacity-50"
      )}
    >
      {/* A hairline in the row's own direction. Colour is never the only signal:
          the amount carries an explicit + or −, and the category names itself. */}
      <span
        aria-hidden="true"
        className={cn(
          "h-8 w-1 shrink-0 rounded-full",
          isIncome ? "bg-primary/70" : "bg-destructive/70"
        )}
      />

      <span className="w-12 shrink-0 text-muted-foreground text-xs tabular-nums">
        {formatTime(row.occurredAt)}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-sm">
          {messages[labelForCategory(row.category)]}
          {row.counterparty ? (
            <span className="text-muted-foreground"> · {row.counterparty}</span>
          ) : null}
        </span>
        {row.note ? (
          <span className="truncate text-muted-foreground text-xs">
            {row.note}
          </span>
        ) : null}
      </div>

      {isKnownCashbox(row.cashbox) ? (
        <Badge className="hidden shrink-0 sm:inline-flex" variant="outline">
          {messages[CASHBOX_LABEL[row.cashbox]]}
        </Badge>
      ) : null}

      <span
        className={cn(
          "w-32 shrink-0 text-right font-semibold text-sm tabular-nums",
          row.isVoided && "line-through",
          !row.isVoided &&
            (isIncome ? "text-primary-accent" : "text-destructive")
        )}
      >
        {formatSigned(row)}
      </span>

      {/* The slot is always there, so a row does not shift sideways when the
          button appears on hover. */}
      <div className="w-8 shrink-0">
        {row.isManual && !row.isVoided ? (
          <Button
            aria-label={messages["tx.void"]}
            className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            disabled={disabled}
            onClick={() => onVoid(row.id)}
            size="icon-sm"
            title={messages["tx.void"]}
            variant="ghost"
          >
            <Undo2Icon className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
};

interface LedgerPanelProperties {
  disabled: boolean;
  filter: LedgerFilter;
  messages: Messages;
  onFilter: (filter: LedgerFilter) => void;
  onVoid: (id: string) => void;
  rows: readonly TransactionRow[];
}

export const LedgerPanel = ({
  disabled,
  filter,
  messages,
  onFilter,
  onVoid,
  rows,
}: LedgerPanelProperties) => (
  <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
    <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
      <h2 className="font-medium text-sm">{messages["tx.recent"]}</h2>

      <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-1">
        {LEDGER_KINDS.map((option) => {
          const isActive = filter.kind === option.key;

          return (
            <Button
              aria-pressed={isActive}
              className={cn(
                isActive && option.key === "expense" && ACTIVE_FILL_DANGER
              )}
              key={option.labelKey}
              onClick={() => onFilter({ ...filter, kind: option.key })}
              size="sm"
              variant={isActive ? "default" : "ghost"}
            >
              {messages[option.labelKey]}
            </Button>
          );
        })}
      </div>

      {/* Only offered once a till is actually pinned — a permanently visible
          clear button on an unfiltered list is a control that does nothing. */}
      {filter.cashbox ? (
        <Button
          onClick={() => onFilter({ ...filter, cashbox: null })}
          size="sm"
          variant="outline"
        >
          {messages[CASHBOX_LABEL[filter.cashbox]]} ✕
        </Button>
      ) : null}
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto">
      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardListIcon />
            </EmptyMedia>
            <EmptyTitle>{messages["tx.empty"]}</EmptyTitle>
            <EmptyDescription>{messages["tx.emptyHint"]}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="divide-y">
          {rows.map((row) => (
            <LedgerRow
              disabled={disabled}
              key={row.id}
              messages={messages}
              onVoid={onVoid}
              row={row}
            />
          ))}
        </div>
      )}
    </div>
  </section>
);
