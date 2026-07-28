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
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { isSupportedPhone } from "../lib/countries";
import { normalizePhone } from "../lib/phone";
import { PhoneField } from "./phone-field";

type FieldErrors = {
  name?: string;
  phone?: string;
  password?: string;
};

// Mirrors apps/backend/src/schemas/auth.ts. The backend is still the authority;
// this only spares the user a round-trip to learn they typed four characters.
const validate = (
  name: string,
  phone: string,
  password: string
): FieldErrors => {
  const errors: FieldErrors = {};

  if (name.trim().length < 2) {
    errors.name = "Enter your name.";
  }

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

export const SignUp = () => {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const phone = String(formData.get("phone") ?? "");
    const password = String(formData.get("password") ?? "");

    const errors = validate(name, phone, password);

    setFieldErrors(errors);
    setFormError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsPending(true);

    try {
      // Same-origin: the backend URL is server-only (see app/api/register).
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: normalizePhone(phone),
          password,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        setFormError(body?.error ?? "Could not create your account.");
        return;
      }

      // Registering without landing logged in would just make the user type the
      // same credentials again, so sign them in with what they already gave us.
      const signInResponse = await signIn("credentials", {
        phone: normalizePhone(phone),
        password,
        redirect: false,
      });

      if (signInResponse?.error) {
        setFormError("Account created. Please sign in.");
        router.push("/sign-in");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Enter your details to get started.</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.name) || undefined}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                aria-invalid={Boolean(fieldErrors.name)}
                autoComplete="name"
                disabled={isPending}
                id="name"
                name="name"
                placeholder="Diyorbek"
                type="text"
              />
              {fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}
            </Field>

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
                autoComplete="new-password"
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
              {isPending ? "Creating account..." : "Create account"}
            </Button>

            <p className="text-center text-base text-muted-foreground">
              Already have an account?{" "}
              <Link
                className="text-primary-accent underline-offset-4 hover:underline"
                href="/sign-in"
              >
                Sign in
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
};
