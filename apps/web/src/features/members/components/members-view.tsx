import { formatPhone } from "@repo/auth/lib/countries";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusCircleIcon,
  SearchIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import { IdCode } from "@/components/id-code";
import { PAGE_SIZES } from "@/components/use-pagination";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { useDeleteMember, useMembersPage, useSetMemberActive } from "../api";
import {
  DEBT_FILTERS,
  DEFAULT_MEMBER_QUERY,
  type DebtFilter,
  formatDay,
  hasDebt,
  type MemberFilter,
  type MemberListItem,
  type MemberPage,
  type MemberQuery,
  type PlanOption,
} from "../types";
import { MemberSheet } from "./member-sheet";

interface MembersViewProperties {
  /** The first page, fetched by the server component so nothing flashes. */
  initial: MemberPage;
  messages: Messages;
  plans: readonly PlanOption[];
}

const FILTERS: readonly {
  key: MemberFilter;
  labelKey: keyof Messages;
}[] = [
  { key: "all", labelKey: "members.filterAll" },
  { key: "active", labelKey: "members.filterActive" },
  { key: "expiring", labelKey: "members.filterExpiring" },
  { key: "inactive", labelKey: "members.filterInactive" },
];

const DEBT_LABEL: Record<DebtFilter, keyof Messages> = {
  any: "members.debtAny",
  membership: "members.debtMembership",
  shop: "members.debtShop",
};

const DebtCell = ({ value }: { value: string }) => {
  if (!hasDebt(value)) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="font-semibold text-destructive">{formatMoney(value)}</span>
  );
};

/** `3× VIP 1 MONTH` — the multiplier only appears when there is more than one. */
const MembershipBadges = ({ member }: { member: MemberListItem }) => {
  if (member.plans.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {member.plans.map((plan) => (
        <Badge key={plan.name} variant="secondary">
          {plan.count > 1 ? `${plan.count}× ` : ""}
          {plan.name}
        </Badge>
      ))}
    </div>
  );
};

/** Escapes a CSV cell — a name with a comma must not split into two columns. */
const toCsvCell = (value: string | number | null): string => {
  const text = String(value ?? "");

  return `"${text.replace(/"/g, '""')}"`;
};

const buildCsv = (
  members: readonly MemberListItem[],
  messages: Messages
): string => {
  const header = [
    messages["members.colId"],
    messages["members.colName"],
    messages["members.colPhone"],
    messages["members.colMembership"],
    messages["members.colStart"],
    messages["members.colEnd"],
    messages["members.colRemaining"],
    messages["members.colMembershipDebt"],
    messages["members.colShopDebt"],
  ];

  const rows = members.map((member) => [
    member.uniqueId,
    member.name,
    formatPhone(member.phone),
    member.plans
      .map((plan) =>
        plan.count > 1 ? `${plan.count}x ${plan.name}` : plan.name
      )
      .join(" | "),
    formatDay(member.startsAt),
    formatDay(member.endsAt),
    member.remainingVisits ?? "",
    member.membershipDebt,
    member.shopDebt,
  ]);

  return [header, ...rows]
    .map((row) => row.map(toCsvCell).join(","))
    .join("\r\n");
};

export const MembersView = ({
  initial,
  messages,
  plans,
}: MembersViewProperties) => {
  const [request, setRequest] = useState<MemberQuery>(DEFAULT_MEMBER_QUERY);
  const [editing, setEditing] = useState<MemberListItem | null>(null);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Two copies of the query on purpose. `request` moves on every keystroke so
   * the inputs stay responsive; `debounced` lags 250ms behind and is what the
   * query is keyed by, because each change is a server round trip.
   *
   * The `cancelled` flag the old effect carried is gone: a slow reply for a
   * stale query can no longer overwrite a newer one, because it belongs to a
   * different cache key. `keepPreviousData` on the query is what stops the
   * table blanking between keystrokes.
   */
  const [debounced, setDebounced] = useState<MemberQuery>(DEFAULT_MEMBER_QUERY);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(request), 250);

    return () => clearTimeout(timer);
  }, [request]);

  const membersPage = useMembersPage(debounced);
  const deleteMember = useDeleteMember();
  const setMemberActive = useSetMemberActive();

  // The route loader warms the default query, so this is only ever empty on a
  // cold navigation straight into a filtered view.
  const page = membersPage.data ?? initial;

  /** Any change but the page itself returns to page one. */
  const narrow = (patch: Partial<MemberQuery>) => {
    setRequest((current) => ({ ...current, ...patch, page: 1 }));
  };

  const counts = page.counts;

  const lastPage = Math.max(1, Math.ceil(page.total / request.pageSize));

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (member: MemberListItem) => {
    setEditing(member);
    setSheetOpen(true);
  };

  const handleToggleActive = (member: MemberListItem) => {
    setError(null);
    setMemberActive.mutate(
      { isActive: !member.isActive, memberId: member.id },
      { onError: (cause) => setError(cause.message) }
    );
  };

  /**
   * The backend refuses a member with money on record and says why. That
   * refusal is the answer to the operator's question, not a crash, so it lands
   * in the same alert as everything else and the row stays exactly where it was.
   *
   * On success the mutation invalidates rather than splicing the row out: the
   * counts in the header and the page itself both move, and one of them being
   * stale is how a screen starts disagreeing with itself.
   */
  const handleDelete = (member: MemberListItem) => {
    setError(null);
    deleteMember.mutate(member.id, {
      onError: (cause) => setError(cause.message),
    });
  };

  /*
   * Exports the page on screen, which is now a page rather than the whole
   * filtered set — the rows the browser holds are the only rows it has. An
   * export of everything matching the filters would have to be built by the
   * backend, which is a different feature.
   */
  const handleExport = () => {
    const blob = new Blob([`﻿${buildCsv(page.rows, messages)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "members.csv";
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* The sidebar already says which page this is, so the heading only
            has to exist for a screen reader — on screen it was a second label
            for the same thing, costing a row the table could use. */}
        <h1 className="sr-only">{messages["nav.members"]}</h1>

        {/* Active members, not the total: the number the desk is asked for is
            how many memberships are live, and the total is a click away in the
            filter beside it. */}
        <p className="whitespace-nowrap">
          <span className="font-semibold text-lg tabular-nums">
            {counts.status.active}
          </span>{" "}
          <span className="text-muted-foreground text-sm">
            {messages["members.count"]}
          </span>
        </p>

        {/* Sized, not stretched. Stretching put a 900px box around a query
            that is never longer than a name, and pushed the two actions to
            the far edge of the screen from everything else on the row. */}
        <div className="w-96 max-w-full">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-5" />
            </InputGroupAddon>
            <InputGroupInput
              onChange={(event) => narrow({ query: event.target.value })}
              placeholder={messages["members.search"]}
              value={request.query}
            />
          </InputGroup>
        </div>

        {/* The count rides in the label rather than beside it — collapsed into
            a trigger there is no room for a second element, and the count of
            the filter you are not looking at is not worth a row of its own. */}
        <Select
          onValueChange={(value) => narrow({ filter: value as MemberFilter })}
          value={request.filter}
        >
          <SelectTrigger aria-label={messages["nav.members"]} className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {FILTERS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {`${messages[option.labelKey]} (${counts.status[option.key]})`}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Facets rather than a dropdown of choices, so "no debt filter" is
            simply nothing picked — there is no "hammasi" option to invent, and
            the button stays quiet until it is holding something. */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* Once it holds something, what it holds *is* the label — the
                  word "Qarz" beside "Qarzdorlar" only repeated it. It stays as
                  the accessible name so the control is still announced. */}
              <Button
                aria-label={messages["members.debtFilter"]}
                variant="outline"
              >
                <PlusCircleIcon className="size-5 text-muted-foreground" />
                {request.debt === null ? (
                  messages["members.debtFilter"]
                ) : (
                  <Badge variant="secondary">
                    {messages[DEBT_LABEL[request.debt]]}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {/* Radio, not checkboxes: the three overlap — "qarzdorlar" is the
                  other two put together — so holding more than one at a time
                  would only ever mean what one of them already meant. */}
              <DropdownMenuRadioGroup
                onValueChange={(value) => narrow({ debt: value as DebtFilter })}
                value={request.debt ?? ""}
              >
                {DEBT_FILTERS.map((key) => (
                  <DropdownMenuRadioItem key={key} value={key}>
                    <span className="flex-1">{messages[DEBT_LABEL[key]]}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {counts.debt[key]}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Outside the trigger, not inside it: a button cannot contain another
              button, and clearing must not also open the menu. */}
          {request.debt === null ? null : (
            <Button
              aria-label={messages["members.debtClear"]}
              onClick={() => narrow({ debt: null })}
              size="icon"
              title={messages["members.debtClear"]}
              variant="ghost"
            >
              <XIcon className="size-5" />
            </Button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Both icon-only, so both carry their label for a screen reader —
              and a title, so the desk can hover to find out which is which. */}
          <Button
            aria-label={messages["members.export"]}
            disabled={page.rows.length === 0}
            onClick={handleExport}
            size="icon"
            title={messages["members.export"]}
            variant="outline"
          >
            <DownloadIcon className="size-5" />
          </Button>
          <Button
            aria-label={messages["members.add"]}
            onClick={openCreate}
            size="icon"
            title={messages["members.add"]}
          >
            <UserPlusIcon className="size-5" />
          </Button>
        </div>
      </div>

      {error ? (
        <p
          className="rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-base text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* The footer sits inside the border but outside the horizontal scroller,
          so a wide table scrolls under a set of controls that stay put. */}
      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">
                  {messages["members.colId"]}
                </TableHead>
                <TableHead>{messages["members.colName"]}</TableHead>
                <TableHead>{messages["members.colPhone"]}</TableHead>
                <TableHead>{messages["members.colMembership"]}</TableHead>
                <TableHead>{messages["members.colStart"]}</TableHead>
                <TableHead>{messages["members.colEnd"]}</TableHead>
                <TableHead>{messages["members.colRemaining"]}</TableHead>
                <TableHead>{messages["members.colMembershipDebt"]}</TableHead>
                <TableHead>{messages["members.colShopDebt"]}</TableHead>
                <TableHead className="text-right">
                  {messages["members.colActions"]}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={10}
                  >
                    {/* "No members yet" and "nothing matched" are different
                        problems. The roster's own size answers which, and it
                        comes from the backend's count now rather than from the
                        length of a list this view no longer holds. */}
                    {counts.status.all === 0
                      ? messages["members.empty"]
                      : messages["members.noResults"]}
                  </TableCell>
                </TableRow>
              ) : (
                page.rows.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <IdCode code={member.uniqueId} />
                    </TableCell>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell>
                      {member.phone ? (
                        <a
                          className="underline-offset-4 hover:underline"
                          href={`tel:${member.phone}`}
                        >
                          {formatPhone(member.phone)}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <MembershipBadges member={member} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDay(member.startsAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDay(member.endsAt)}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {member.remainingVisits ?? "—"}
                    </TableCell>
                    <TableCell>
                      <DebtCell value={member.membershipDebt} />
                    </TableCell>
                    <TableCell>
                      <DebtCell value={member.shopDebt} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          aria-label={messages["common.edit"]}
                          className="text-muted-foreground"
                          onClick={() => openEdit(member)}
                          size="icon"
                          variant="ghost"
                        >
                          <PencilIcon className="size-5" />
                        </Button>

                        {/* Face first, then the row: the warning is what tells
                            the operator this also reaches the terminal. */}
                        <DeleteConfirmButton
                          isPending={
                            deleteMember.isPending &&
                            deleteMember.variables === member.id
                          }
                          itemName={member.name}
                          messages={messages}
                          onConfirm={() => handleDelete(member)}
                          warning={
                            member.hasFace
                              ? messages["members.deleteWithFace"]
                              : null
                          }
                        />

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label={messages["members.colActions"]}
                              className="text-muted-foreground"
                              size="icon"
                              variant="ghost"
                            >
                              <MoreVerticalIcon className="size-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onSelect={() => openEdit(member)}
                              >
                                <PencilIcon />
                                {messages["common.edit"]}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => handleToggleActive(member)}
                              >
                                {member.isActive
                                  ? messages["members.deactivate"]
                                  : messages["members.activate"]}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              {messages["common.rows"]}:
            </span>
            {PAGE_SIZES.map((size) => (
              <Button
                aria-pressed={request.pageSize === size}
                className={
                  request.pageSize === size
                    ? undefined
                    : "text-muted-foreground"
                }
                key={size}
                onClick={() => narrow({ pageSize: size })}
                size="sm"
                variant={request.pageSize === size ? "default" : "ghost"}
              >
                {size}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              aria-label={messages["common.prevPage"]}
              disabled={request.page <= 1}
              onClick={() =>
                setRequest((current) => ({
                  ...current,
                  page: Math.max(1, current.page - 1),
                }))
              }
              size="icon-sm"
              variant="outline"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <span className="text-sm tabular-nums">
              {request.page} / {lastPage}
            </span>
            <Button
              aria-label={messages["common.nextPage"]}
              disabled={request.page >= lastPage}
              onClick={() =>
                setRequest((current) => ({
                  ...current,
                  page: Math.min(lastPage, current.page + 1),
                }))
              }
              size="icon-sm"
              variant="outline"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <MemberSheet
        // Remount per member so the uncontrolled inputs pick up new defaults.
        key={editing?.id ?? "new"}
        member={editing}
        messages={messages}
        onOpenChange={setSheetOpen}
        open={isSheetOpen}
        plans={plans}
      />
    </div>
  );
};
