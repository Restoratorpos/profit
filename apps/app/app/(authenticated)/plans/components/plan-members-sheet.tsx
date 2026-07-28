"use client";

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
import { useEffect, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import type { PlanMember } from "@/lib/plans";
import { listPlanMembersAction } from "../actions";

interface PlanMembersSheetProperties {
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  planId: string | null;
  planName: string;
}

/** Dates arrive as ISO strings; only the day matters at the desk. */
const formatDate = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(
    parsed
  );
};

const MemberRow = ({
  member,
  messages,
}: {
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

    {/* A phone number is the one thing the desk actually needs to act on, so
        it is a tel: link rather than plain text — one tap to call. */}
    {member.phone ? (
      <a
        className="w-fit text-primary-accent underline-offset-4 hover:underline"
        href={`tel:${member.phone}`}
      >
        {formatPhone(member.phone)}
      </a>
    ) : null}

    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
      <div className="flex gap-2">
        <dt>{messages["plans.memberEnds"]}:</dt>
        <dd className="text-foreground">{formatDate(member.endsAt)}</dd>
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
  const [members, setMembers] = useState<PlanMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!(open && planId)) {
      return;
    }

    // A late response from a previously opened plan must not overwrite the list
    // for the one now on screen.
    let active = true;

    setMembers(null);
    setError(null);

    listPlanMembersAction(planId).then((result) => {
      if (!active) {
        return;
      }

      if (result.ok) {
        setMembers(result.members ?? []);
        return;
      }

      setError(result.error ?? "Something went wrong.");
    });

    return () => {
      active = false;
    };
  }, [open, planId]);

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

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {error ? (
            <p
              className="rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
              role="alert"
            >
              {error}
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
