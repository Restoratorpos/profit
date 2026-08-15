import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { TimePicker } from "@repo/design-system/components/ui/time-picker";
import { CheckIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import { useSaveGymSettings } from "../api";
import {
  DEFAULT_CLOSE_TIME,
  DEFAULT_OPEN_TIME,
  type GymSettings,
} from "../types";

interface GymSectionProperties {
  /** Owners and admins may save; everyone else reads. */
  canEdit: boolean;
  messages: Messages;
  settings: GymSettings;
}

/**
 * The gym's name and the hours its doors are open.
 *
 * The hours are stored on the branch rather than the gym — a chain opens its
 * locations at different times — but there is one branch per gym today, so the
 * screen calls them the gym's and the backend resolves which branch that means.
 */
export const GymSection = ({
  canEdit,
  messages,
  settings,
}: GymSectionProperties) => {
  const [name, setName] = useState(settings.name);
  const [openTime, setOpenTime] = useState(
    settings.openTime ?? DEFAULT_OPEN_TIME
  );
  const [closeTime, setCloseTime] = useState(
    settings.closeTime ?? DEFAULT_CLOSE_TIME
  );
  const [nameError, setNameError] = useState<string | null>(null);

  const save = useSaveGymSettings();
  const isPending = save.isPending;

  /**
   * Retires the "Saved" tick as soon as a field moves again. Left standing it
   * would sit beside an edited form claiming the value on screen is the value
   * on the server.
   */
  const edit =
    <T,>(apply: (value: T) => void) =>
    (value: T) => {
      if (save.isSuccess || save.isError) {
        save.reset();
      }

      apply(value);
    };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (name.trim() === "") {
      setNameError(messages["settings.gymNameRequired"]);
      return;
    }

    setNameError(null);
    save.mutate({ name: name.trim(), openTime, closeTime });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages["settings.gym"]}</CardTitle>
        <CardDescription>{messages["settings.gymHint"]}</CardDescription>
      </CardHeader>

      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <Field data-invalid={Boolean(nameError) || undefined}>
            <FieldLabel htmlFor="settings-gym-name">
              {messages["settings.gymName"]}
            </FieldLabel>
            <Input
              aria-invalid={Boolean(nameError)}
              autoComplete="organization"
              disabled={!canEdit || isPending}
              id="settings-gym-name"
              maxLength={200}
              onChange={(event) => edit(setName)(event.target.value)}
              value={name}
            />
            {nameError ? <FieldError>{nameError}</FieldError> : null}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="settings-open-time">
                {messages["settings.openTime"]}
              </FieldLabel>
              {/* Capped, not stretched. Both of the picker's selects are
                  `w-full`, so in a card this wide two-digit hours would sit in
                  boxes the width of the gym's name — the staff sheet only looks
                  tidier because a sheet is narrow. */}
              <TimePicker
                className="max-w-56"
                disabled={!canEdit || isPending}
                id="settings-open-time"
                onChange={edit(setOpenTime)}
                value={openTime}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="settings-close-time">
                {messages["settings.closeTime"]}
              </FieldLabel>
              <TimePicker
                className="max-w-56"
                disabled={!canEdit || isPending}
                id="settings-close-time"
                onChange={edit(setCloseTime)}
                value={closeTime}
              />
            </Field>
          </div>

          {save.error ? (
            <p className="font-medium text-destructive text-sm" role="alert">
              {save.error.message}
            </p>
          ) : null}

          {canEdit ? (
            <div className="flex items-center gap-3">
              <Button disabled={isPending} type="submit">
                {isPending ? <Spinner className="size-4" /> : null}
                {messages["common.save"]}
              </Button>

              {/* Only after a save that landed, and dropped the moment the form
                  is edited again — a tick beside a changed field would be
                  claiming something that is not true yet. */}
              {save.isSuccess && !isPending ? (
                <span className="flex items-center gap-1.5 text-primary-accent text-sm">
                  <CheckIcon className="size-4" />
                  {messages["settings.saved"]}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {messages["settings.readOnly"]}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
};
