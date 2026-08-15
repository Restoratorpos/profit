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
import { CheckIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import { useChangePassword } from "../api";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../types";

interface PasswordSectionProperties {
  messages: Messages;
}

interface FieldErrors {
  confirm?: string;
  next?: string;
}

const EMPTY = { current: "", next: "", confirm: "" };

/**
 * Changing your own password — not anybody else's. Whose it is comes from the
 * token, so there is no worker to pick here and nothing to get wrong.
 *
 * The current password is asked for even though the caller is already signed
 * in: on a shared desk terminal a live session is whoever walked up to it, and
 * taking the account over should cost knowing the password.
 */
export const PasswordSection = ({ messages }: PasswordSectionProperties) => {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});

  const change = useChangePassword();
  const isPending = change.isPending;

  const set = (key: keyof typeof EMPTY) => (value: string) => {
    if (change.isSuccess || change.isError) {
      change.reset();
    }

    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const found: FieldErrors = {};

    if (values.next.length < MIN_PASSWORD_LENGTH) {
      found.next = messages["settings.passwordTooShort"];
    }

    if (values.confirm !== values.next) {
      found.confirm = messages["settings.passwordMismatch"];
    }

    setErrors(found);

    if (found.next || found.confirm) {
      return;
    }

    change.mutate(
      {
        currentPassword: values.current,
        newPassword: values.next,
      },
      // Clearing on success only: a wrong current password should leave the new
      // one typed, or the whole form has to be entered again over one typo.
      { onSuccess: () => setValues(EMPTY) }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages["settings.password"]}</CardTitle>
        <CardDescription>{messages["settings.passwordHint"]}</CardDescription>
      </CardHeader>

      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="settings-current-password">
              {messages["settings.currentPassword"]}
            </FieldLabel>
            <Input
              autoComplete="current-password"
              disabled={isPending}
              id="settings-current-password"
              maxLength={MAX_PASSWORD_LENGTH}
              onChange={(event) => set("current")(event.target.value)}
              type="password"
              value={values.current}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.next) || undefined}>
              <FieldLabel htmlFor="settings-new-password">
                {messages["settings.newPassword"]}
              </FieldLabel>
              <Input
                aria-invalid={Boolean(errors.next)}
                autoComplete="new-password"
                disabled={isPending}
                id="settings-new-password"
                maxLength={MAX_PASSWORD_LENGTH}
                onChange={(event) => set("next")(event.target.value)}
                type="password"
                value={values.next}
              />
              {errors.next ? <FieldError>{errors.next}</FieldError> : null}
            </Field>

            <Field data-invalid={Boolean(errors.confirm) || undefined}>
              <FieldLabel htmlFor="settings-confirm-password">
                {messages["settings.confirmPassword"]}
              </FieldLabel>
              <Input
                aria-invalid={Boolean(errors.confirm)}
                autoComplete="new-password"
                disabled={isPending}
                id="settings-confirm-password"
                maxLength={MAX_PASSWORD_LENGTH}
                onChange={(event) => set("confirm")(event.target.value)}
                type="password"
                value={values.confirm}
              />
              {errors.confirm ? (
                <FieldError>{errors.confirm}</FieldError>
              ) : null}
            </Field>
          </div>

          {change.error ? (
            <p className="font-medium text-destructive text-sm" role="alert">
              {change.error.message}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button
              disabled={
                isPending || values.current === "" || values.next === ""
              }
              type="submit"
            >
              {isPending ? <Spinner className="size-4" /> : null}
              {messages["settings.changePassword"]}
            </Button>

            {change.isSuccess ? (
              <span className="flex items-center gap-1.5 text-primary-accent text-sm">
                <CheckIcon className="size-4" />
                {messages["settings.passwordChanged"]}
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
