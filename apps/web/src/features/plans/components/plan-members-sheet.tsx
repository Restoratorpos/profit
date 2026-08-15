import { formatPhone } from "@repo/auth/lib/countries";
import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { UsersIcon } from "lucide-react";
import { formatDate } from "@/lib/date";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import { useLocale } from "@/lib/i18n/provider";
import { usePlanMembers } from "../api";
import type { PlanMember } from "../types";

interface PlanMembersSheetProperties {
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  planId: string | null;
  planName: string;
}

const MemberRow = ({
  locale,
  member,
  messages,
}: {
  locale: Locale;
  member: PlanMember;
  messages: Messages;
}) => (
  <li className="flex flex-col gap-2 rounded-xl border p-4">
    <div className="flex items-start justify-between gap-3">
      <span className="font-medium text-lg">{member.name || "—"}</span>
      {member.status ? (
        <Badge variant={member.status === "active" ? "default" : "secondary"}>
          {member.status === "active"
            ? messages["plans.active"]
            : messages["plans.inactive"]}
        </Badge>
      ) : null}
    </div>

    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
      {/* Labelled like the two facts under it. A bare string of digits under a
          name is read as an ID as readily as a phone number — this row already
          carries both kinds of number elsewhere in the app.

          Plain text, not a `tel:` link: this is read on a desk PC with no dialer
          behind it, so the link went nowhere and made the number look clickable.
          `members.colPhone` rather than a fourth copy of the word "Telefon". */}
      {member.phone ? (
        <div className="flex gap-2">
          <dt>{messages["members.colPhone"]}:</dt>
          <dd className="text-foreground tabular-nums">
            {formatPhone(member.phone)}
          </dd>
        </div>
      ) : null}
      <div className="flex gap-2">
        <dt>{messages["plans.memberEnds"]}:</dt>
        <dd className="text-foreground">{formatDate(member.endsAt, locale)}</dd>
      </div>
      {member.remainingVisits === null ? null : (
        <div className="flex gap-2">
          <dt>{messages["plans.memberRemaining"]}:</dt>
          <dd className="text-foreground">{member.remainingVisits}</dd>
        </div>
      )}
    </dl>
  </li>
);

export const PlanMembersSheet = ({
  messages,
  onOpenChange,
  open,
  planId,
  planName,
}: PlanMembersSheetProperties) => {
  const { locale } = useLocale();

  /*
   * Replaces a hand-rolled effect that fetched on open and carried an `active`
   * flag so a late response from a previously opened plan could not overwrite
   * the list for the one now on screen. Keying the query by `planId` makes that
   * structural rather than something to remember — and reopening the same plan
   * now paints from cache instead of re-fetching.
   */
  const { data: members, error } = usePlanMembers(open ? planId : null);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UsersIcon className="size-5 text-primary-accent" />
            {messages["plans.membersTitle"]}
          </SheetTitle>
          <SheetDescription>{planName}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {error ? (
            <p
              className="rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
              role="alert"
            >
              {error.message}
            </p>
          ) : null}

          {!(error || members) && (
            <output
              aria-label={messages["plans.membersTitle"]}
              className="flex justify-center py-10"
            >
              <Spinner className="size-8" />
            </output>
          )}

          {members && members.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              {messages["plans.membersEmpty"]}
            </p>
          ) : null}

          {members && members.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {members.map((member) => (
                <MemberRow
                  key={member.membershipId}
                  locale={locale}
                  member={member}
                  messages={messages}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};
