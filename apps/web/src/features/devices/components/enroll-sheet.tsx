import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import { Field, FieldLabel } from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import { Trash2Icon, UserIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { CreatableCombobox } from "@/components/creatable-combobox";
import type { MemberListItem } from "@/features/members/types";
import type { WorkerListItem } from "@/features/workers/types";
import type { Messages } from "@/lib/i18n/dictionary";
import { useLocale } from "@/lib/i18n/provider";
import { prepareFacePhoto } from "@/lib/images";
import { useEnrollPerson, useRevokePerson } from "../api";
import { type DeviceView, type EnrolledPerson, formatWhen } from "../types";

interface EnrollSheetProperties {
  /** The terminal being managed; null keeps the sheet closed. */
  device: DeviceView | null;
  enrolled: readonly EnrolledPerson[];
  isLoading: boolean;
  members: readonly MemberListItem[];
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  workers: readonly WorkerListItem[];
}

type PersonType = "member" | "worker";

/**
 * Who is on the terminal, and how somebody gets added.
 *
 * The photo never touches this server's storage: it is read in the browser,
 * passed through the action, and pushed straight into the device's own face
 * library. There is no image column anywhere in this app on purpose — a gym
 * holding a database of faces is a liability nobody asked for.
 */
export const EnrollSheet = ({
  device,
  enrolled,
  isLoading,
  members,
  messages,
  onOpenChange,
  workers,
}: EnrollSheetProperties) => {
  const { locale } = useLocale();
  const [personType, setPersonType] = useState<PersonType>("worker");
  const [personId, setPersonId] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const enrollPerson = useEnrollPerson(device?.id ?? "");
  const revokePerson = useRevokePerson(device?.id ?? "");
  const isPending = enrollPerson.isPending;

  // `variables` is the credential id of the in-flight revoke — the row to spin.
  const revokingId = revokePerson.isPending ? revokePerson.variables : null;

  const enrolledIds = new Set(enrolled.map((person) => person.personId));

  const options = (
    personType === "worker"
      ? workers.map((worker) => ({ id: worker.id, name: worker.name }))
      : members.map((member) => ({ id: member.id, name: member.name }))
  ).filter((person) => !enrolledIds.has(person.id));

  const reset = () => {
    setPersonId(null);
    setPhoto(null);
    setPhotoName(null);
    setFormError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!(device && personId)) {
      setFormError(messages["devices.pickPerson"]);
      return;
    }

    setFormError(null);

    enrollPerson.mutate(
      { personId, personType, ...(photo ? { photo } : {}) },
      {
        // No onReload(): the mutation invalidates this device's people query,
        // so the list below refreshes itself.
        onSuccess: reset,
        onError: (cause) => setFormError(cause.message),
      }
    );
  };

  const handleRevoke = (credentialId: string) => {
    if (!device) {
      return;
    }

    revokePerson.mutate(credentialId, {
      onError: (cause) => setFormError(cause.message),
    });
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(device)}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>{messages["devices.enrollTitle"]}</SheetTitle>
          <SheetDescription className="truncate">
            {device?.name ?? ""}
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
              <FieldLabel>{messages["devices.personType"]}</FieldLabel>
              <div
                aria-label={messages["devices.personType"]}
                className="flex w-fit items-center gap-1 rounded-lg bg-muted p-1"
                role="radiogroup"
              >
                {(["worker", "member"] as const).map((entry) => {
                  const isActive = personType === entry;

                  return (
                    <Button
                      aria-checked={isActive}
                      className={cn(!isActive && "text-muted-foreground")}
                      key={entry}
                      onClick={() => {
                        setPersonType(entry);
                        setPersonId(null);
                      }}
                      role="radio"
                      size="sm"
                      type="button"
                      variant={isActive ? "default" : "ghost"}
                    >
                      {entry === "worker"
                        ? messages["devices.typeWorker"]
                        : messages["devices.typeMember"]}
                    </Button>
                  );
                })}
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="enroll-person">
                {messages["devices.pickPerson"]}
              </FieldLabel>
              <CreatableCombobox
                emptyLabel={messages["devices.pickPerson"]}
                icon={UserIcon}
                id="enroll-person"
                // Select-only: somebody who is not on the books yet belongs in
                // the staff or member list first, not invented at a door.
                onSelect={setPersonId}
                options={options.map((person) => ({
                  label: person.name,
                  value: person.id,
                }))}
                placeholder={messages["devices.pickPerson"]}
                searchPlaceholder={messages["products.search"]}
                value={personId}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="enroll-photo">
                {messages["devices.photo"]}
              </FieldLabel>
              <Input
                accept="image/jpeg,image/png"
                id="enroll-photo"
                onChange={async (event) => {
                  const file = event.target.files?.[0];

                  if (!file) {
                    setPhoto(null);
                    setPhotoName(null);
                    return;
                  }

                  setPhotoName(file.name);
                  // Resized before upload for the same reason as on the member
                  // form: a terminal refuses a phone-sized photo outright.
                  setPhoto(await prepareFacePhoto(file));
                }}
                type="file"
              />
              <p className="text-muted-foreground text-sm">
                {messages["devices.photoHint"]}
              </p>
              {photoName ? (
                <p className="truncate text-sm">{photoName}</p>
              ) : null}
            </Field>

            <Button className="w-fit" disabled={isPending} type="submit">
              {isPending ? <Spinner /> : null}
              {messages["devices.enroll"]}
            </Button>

            <div className="flex flex-col gap-2 border-t pt-4">
              <p className="font-medium text-sm">
                {messages["devices.people"]}
              </p>

              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : null}

              {isLoading || enrolled.length > 0 ? null : (
                <p className="py-4 text-center text-muted-foreground text-sm">
                  {messages["devices.noPeople"]}
                </p>
              )}

              {enrolled.map((person) => (
                <div
                  className="flex items-center gap-3 rounded-lg border px-3 py-2"
                  key={person.credentialId}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{person.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {person.personType === "member"
                        ? messages["devices.typeMember"]
                        : messages["devices.typeWorker"]}
                      {" · "}
                      {formatWhen(person.issuedAt, locale)}
                    </p>
                  </div>
                  <Button
                    aria-label={`${messages["devices.revoke"]}: ${person.name}`}
                    className="text-muted-foreground"
                    disabled={revokingId === person.credentialId}
                    onClick={() => handleRevoke(person.credentialId)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    {revokingId === person.credentialId ? (
                      <Spinner />
                    ) : (
                      <Trash2Icon className="size-5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </fieldset>

          <SheetFooter>
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
