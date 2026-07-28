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
import { CreatableCombobox } from "@/components/creatable-combobox";
import type { MemberListItem } from "@/features/members/types";
import type { Messages } from "@/lib/i18n/dictionary";
import { useRecordManualVisit } from "../api";

interface ManualVisitSheetProperties {
  members: readonly MemberListItem[];
  messages: Messages;
  onOpenChange: (open: boolean) => void;
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
  open,
}: ManualVisitSheetProperties) => {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const recordVisit = useRecordManualVisit();
  const isPending = recordVisit.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!memberId) {
      setFormError(messages["devices.pickPerson"]);
      return;
    }

    setFormError(null);

    recordVisit.mutate(memberId, {
      // No onRecorded callback: the mutation invalidates the attendance queries,
      // so the table behind catches up on its own.
      onSuccess: () => {
        setMemberId(null);
        onOpenChange(false);
      },
      onError: (cause) => setFormError(cause.message),
    });
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
