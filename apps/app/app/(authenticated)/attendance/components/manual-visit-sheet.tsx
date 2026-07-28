"use client";

import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import { Field, FieldLabel } from "@repo/design-system/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { UserIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import type { MemberListItem } from "@/lib/members";
import { CreatableCombobox } from "../../products/components/creatable-combobox";
import { recordManualVisitAction } from "../actions";

interface ManualVisitSheetProperties {
  members: readonly MemberListItem[];
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
  open: boolean;
}

/**
 * A visit written by hand — the terminal is down, the member forgot their face,
 * or somebody is being let in for a reason no rule covers. It skips the plan
 * check on purpose: a human is standing there making that call, which is the
 * same authority the "let them in anyway" button carries.
 */
export const ManualVisitSheet = ({
  members,
  messages,
  onOpenChange,
  onRecorded,
  open,
}: ManualVisitSheetProperties) => {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!memberId) {
      setFormError(messages["devices.pickPerson"]);
      return;
    }

    setFormError(null);
    setIsPending(true);

    const result = await recordManualVisitAction(memberId);

    setIsPending(false);

    if (result.ok) {
      setMemberId(null);
      onOpenChange(false);
      onRecorded();
      return;
    }

    setFormError(result.error ?? "Something went wrong.");
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{messages["attendance.manualTitle"]}</SheetTitle>
          <SheetDescription className="sr-only">
            {messages["attendance.manualTitle"]}
          </SheetDescription>
        </SheetHeader>

        <form className="contents" onSubmit={handleSubmit}>
          <fieldset
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4"
            disabled={isPending}
          >
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel htmlFor="manual-member">
                {messages["attendance.colMember"]}
              </FieldLabel>
              <CreatableCombobox
                emptyLabel={messages["devices.pickPerson"]}
                icon={UserIcon}
                id="manual-member"
                // Select-only: somebody who is not a member yet is a sale at the
                // desk, not an attendance row.
                onSelect={setMemberId}
                options={members.map((member) => ({
                  label: member.name,
                  value: member.id,
                }))}
                placeholder={messages["devices.pickPerson"]}
                searchPlaceholder={messages["attendance.search"]}
                value={memberId}
              />
            </Field>
          </fieldset>

          <SheetFooter>
            <Button disabled={isPending} type="submit">
              {isPending ? <Spinner /> : null}
              {messages["common.save"]}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {messages["common.cancel"]}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
