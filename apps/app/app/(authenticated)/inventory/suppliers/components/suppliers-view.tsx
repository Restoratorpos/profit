"use client";

import { formatPhone } from "@repo/auth/lib/countries";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowLeftIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TruckIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import { formatMoney, type SupplierSummary } from "@/lib/inventory";
import { DeleteConfirmButton } from "../../../products/components/delete-confirm-button";
import { deleteSupplierAction } from "../../actions";
import { PaySupplierSheet } from "./pay-supplier-sheet";
import { SupplierSheet } from "./supplier-sheet";

interface SuppliersViewProperties {
  messages: Messages;
  suppliers: readonly SupplierSummary[];
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const formatDay = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? "—" : DATE_FORMAT.format(parsed);
};

export const SuppliersView = ({
  messages,
  suppliers,
}: SuppliersViewProperties) => {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SupplierSummary | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [paying, setPaying] = useState<SupplierSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle === "") {
      return suppliers;
    }

    return suppliers.filter(
      (supplier) =>
        supplier.name.toLowerCase().includes(needle) ||
        supplier.phone?.includes(needle)
    );
  }, [query, suppliers]);

  const totalOwed = useMemo(
    () =>
      suppliers.reduce((sum, supplier) => sum + Number(supplier.remaining), 0),
    [suppliers]
  );

  const handleDelete = async (supplierId: string) => {
    setDeletingId(supplierId);
    await deleteSupplierAction(supplierId);
    setDeletingId(null);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="ghost">
            <Link aria-label={messages["nav.inventory"]} href="/inventory">
              <ArrowLeftIcon className="size-5" />
            </Link>
          </Button>
          <h1 className="font-semibold text-2xl tracking-tight">
            {messages["suppliers.title"]}
          </h1>
        </div>

        <Button onClick={() => setIsCreating(true)}>
          <PlusIcon className="size-5" />
          {messages["suppliers.add"]}
        </Button>
      </div>

      {suppliers.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-64 flex-1">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <SearchIcon className="size-5" />
              </InputGroupAddon>
              <InputGroupInput
                onChange={(event) => setQuery(event.target.value)}
                placeholder={messages["suppliers.search"]}
                value={query}
              />
            </InputGroup>
          </div>

          <div className="flex items-baseline gap-2 rounded-lg bg-muted/50 px-4 py-2.5">
            <span className="text-muted-foreground text-sm">
              {messages["suppliers.totalDebt"]}
            </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                totalOwed > 0 && "text-destructive"
              )}
            >
              {formatMoney(totalOwed.toFixed(2))}
            </span>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TruckIcon />
            </EmptyMedia>
            <EmptyTitle className="text-base">
              {messages["suppliers.empty"]}
            </EmptyTitle>
            <EmptyDescription>
              {messages["suppliers.emptyHint"]}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setIsCreating(true)}>
              <PlusIcon className="size-5" />
              {messages["suppliers.add"]}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{messages["suppliers.colName"]}</TableHead>
                <TableHead>{messages["suppliers.colPhone"]}</TableHead>
                <TableHead>{messages["suppliers.colLast"]}</TableHead>
                <TableHead className="text-right">
                  {messages["suppliers.colDelivered"]}
                </TableHead>
                <TableHead className="text-right">
                  {messages["suppliers.colPaid"]}
                </TableHead>
                <TableHead className="text-right">
                  {messages["suppliers.colRemaining"]}
                </TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((supplier) => {
                const owed = Number(supplier.remaining);

                return (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <p className="truncate font-medium">{supplier.name}</p>
                      {supplier.supplierType ? (
                        <p className="truncate text-muted-foreground text-sm">
                          {supplier.supplierType}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {supplier.phone ? formatPhone(supplier.phone) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatDay(supplier.lastDeliveryAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(supplier.delivered)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatMoney(supplier.paid)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          owed > 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        {owed > 0
                          ? formatMoney(supplier.remaining)
                          : messages["suppliers.noDebt"]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {owed > 0 ? (
                          <Button
                            onClick={() => setPaying(supplier)}
                            size="sm"
                            variant="outline"
                          >
                            {messages["suppliers.pay"]}
                          </Button>
                        ) : null}
                        <Button
                          aria-label={`${messages["common.edit"]}: ${supplier.name}`}
                          className="text-muted-foreground"
                          onClick={() => setEditing(supplier)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <PencilIcon className="size-5" />
                        </Button>
                        <DeleteConfirmButton
                          isPending={deletingId === supplier.id}
                          itemName={supplier.name}
                          messages={messages}
                          onConfirm={() => handleDelete(supplier.id)}
                          warning={null}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Keyed so a second row opens a fresh form rather than the first one's
          values — the fields are initialised from props exactly once. */}
      <SupplierSheet
        key={editing?.id ?? "new"}
        messages={messages}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setIsCreating(false);
          }
        }}
        open={isCreating || Boolean(editing)}
        supplier={editing}
      />

      <PaySupplierSheet
        key={`pay-${paying?.id ?? "none"}`}
        messages={messages}
        onOpenChange={(open) => setPaying(open ? paying : null)}
        supplier={paying}
      />
    </div>
  );
};
