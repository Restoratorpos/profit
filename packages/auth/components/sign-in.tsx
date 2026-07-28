"use client";

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
  FieldGroup,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { isSupportedPhone } from "../lib/countries";
import { normalizePhone } from "../lib/phone";
import { PhoneField } from "./phone-field";

type FieldErrors = {
  phone?: string;
  password?: string;
};

const AUTH_PAGES = ["/sign-in", "/sign-up"];

/**
 * Mirrors resolveCallbackUrl in ../config.ts. `callbackUrl` comes off the query
 * string, so it is only followed when it points back at this origin — otherwise
 * a crafted link would turn a successful login into an off-site redirect. Auth
 * pages fall back to "/" so we never bounce straight back to the form.
 */
const safeDestination = (raw: string | null): string => {
  if (!raw) {
    return "/";
  }

  try {
    const target = new URL(raw, window.location.origin);

    if (target.origin !== window.location.origin) {
      return "/";
    }

    if (AUTH_PAGES.some((page) => target.pathname.startsWith(page))) {
      return "/";
    }

    return `${target.pathname}${target.search}`;
  } catch {
    return "/";
  }
};

const validate = (phone: string, password: string): FieldErrors => {
  const errors: FieldErrors = {};

  // Length alone is too loose once several countries are in play: a Turkmen
  // number one digit short is the length of a valid Uzbek one.
  if (!isSupportedPhone(phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  if (password.length < 4) {
    errors.password = "Password must be at least 4 characters.";
  }

  return errors;
};

export const SignIn = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const phone = String(formData.get("phone") ?? "");
    const password = String(formData.get("password") ?? "");

    const errors = validate(phone, password);

    setFieldErrors(errors);
    setFormError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsPending(true);

    const response = await signIn("credentials", {
      // The backend stores and compares bare digits, so normalize before the
      // request rather than making every caller remember to.
      phone: normalizePhone(phone),
      password,
      redirect: false,
    });

    setIsPending(false);

    if (response?.error) {
      // Deliberately generic: never reveal whether the phone number exists.
      setFormError("Invalid phone number or password.");
      return;
    }

    // Return the user to whatever the middleware bounced them off, not always "/".
    router.push(safeDestination(searchParams.get("callbackUrl")));
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Enter your details to sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.phone) || undefined}>
              <FieldLabel htmlFor="phone">Phone number</FieldLabel>
              <PhoneField
                disabled={isPending}
                invalid={Boolean(fieldErrors.phone)}
              />
              {fieldErrors.phone && (
                <FieldError>{fieldErrors.phone}</FieldError>
              )}
            </Field>

            <Field data-invalid={Boolean(fieldErrors.password) || undefined}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                aria-invalid={Boolean(fieldErrors.password)}
                autoComplete="current-password"
                disabled={isPending}
                id="password"
                name="password"
                type="password"
              />
              {fieldErrors.password && (
                <FieldError>{fieldErrors.password}</FieldError>
              )}
            </Field>

            {formError && <FieldError role="alert">{formError}</FieldError>}

            <Button disabled={isPending} type="submit">
              {isPending && <Spinner />}
              {isPending ? "Signing in..." : "Sign in"}
            </Button>

            <p className="text-center text-base text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                className="text-primary-accent underline-offset-4 hover:underline"
                href="/sign-up"
              >
                Sign up
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
};
