import { PhoneField } from "@repo/auth/components/phone-field";
import { isSupportedPhone } from "@repo/auth/lib/countries";
import { normalizePhone } from "@repo/auth/lib/phone";
import { Logo } from "@repo/design-system/components/logo";
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
import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { useAuth } from "@/lib/auth/context";

interface FieldErrors {
  name?: string;
  password?: string;
  phone?: string;
}

/*
 * Mirrors apps/backend/src/schemas/auth.ts. The backend is still the authority;
 * this only spares the operator a round trip to learn they typed four
 * characters.
 */
const validate = (
  name: string,
  phone: string,
  password: string
): FieldErrors => {
  const errors: FieldErrors = {};

  if (name.trim().length < 2) {
    errors.name = "Ismingizni kiriting.";
  }

  /*
   * Length alone is too loose once several countries are in play: a Turkmen
   * number one digit short is the length of a valid Uzbek one.
   */
  if (!isSupportedPhone(phone)) {
    errors.phone = "To'g'ri telefon raqamini kiriting.";
  }

  if (password.length < 4) {
    errors.password = "Parol kamida 4 ta belgidan iborat bo'lsin.";
  }

  return errors;
};

export const Route = createFileRoute("/sign-up")({
  // Same rule as sign-in: a signed-in operator has no business here.
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: "/" });
    }
  },
  component: SignUpPage,
});

function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const mutation = useMutation({
    mutationFn: signUp,
    // Registration signs them in, so there is nowhere to go but the dashboard.
    onSuccess: () => navigate({ to: "/", replace: true }),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "");
    // PhoneField assembles country code + national digits into one hidden input.
    const phone = String(data.get("phone") ?? "");
    const password = String(data.get("password") ?? "");

    const errors = validate(name, phone, password);

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    mutation.mutate({
      name: name.trim(),
      password,
      phone: normalizePhone(phone),
    });
  };

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center gap-2 text-center">
          <Logo
            accentClassName="text-primary-accent"
            markClassName="size-9 text-primary"
            wordmarkClassName="text-2xl"
          />
          <CardTitle>Hisob yarating</CardTitle>
          <CardDescription>
            Zalingizni ro'yxatdan o'tkazing — sizdan boshqa hech kim ko'rmaydi.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form noValidate onSubmit={handleSubmit}>
            <FieldGroup>
              <Field data-invalid={Boolean(fieldErrors.name) || undefined}>
                <FieldLabel htmlFor="name">Ismingiz</FieldLabel>
                <Input
                  aria-invalid={Boolean(fieldErrors.name)}
                  autoComplete="name"
                  disabled={mutation.isPending}
                  id="name"
                  name="name"
                  type="text"
                />
                {fieldErrors.name ? (
                  <FieldError>{fieldErrors.name}</FieldError>
                ) : null}
              </Field>

              <Field data-invalid={Boolean(fieldErrors.phone) || undefined}>
                <FieldLabel htmlFor="phone">Telefon raqami</FieldLabel>
                <PhoneField
                  disabled={mutation.isPending}
                  invalid={Boolean(fieldErrors.phone)}
                />
                {fieldErrors.phone ? (
                  <FieldError>{fieldErrors.phone}</FieldError>
                ) : null}
              </Field>

              <Field data-invalid={Boolean(fieldErrors.password) || undefined}>
                <FieldLabel htmlFor="password">Parol</FieldLabel>
                <Input
                  aria-invalid={Boolean(fieldErrors.password)}
                  autoComplete="new-password"
                  /* Kept mounted and merely disabled while submitting, so what
                     was typed stays on screen. */
                  disabled={mutation.isPending}
                  id="password"
                  name="password"
                  type="password"
                />
                {fieldErrors.password ? (
                  <FieldError>{fieldErrors.password}</FieldError>
                ) : null}
              </Field>

              {mutation.isError ? (
                <FieldError role="alert">{mutation.error.message}</FieldError>
              ) : null}

              <Button disabled={mutation.isPending} type="submit">
                {mutation.isPending ? <Spinner /> : null}
                Hisob yaratish
              </Button>

              <p className="text-center text-base text-muted-foreground">
                Hisobingiz bormi?{" "}
                <Link
                  className="text-primary-accent underline-offset-4 hover:underline"
                  to="/sign-in"
                >
                  Kirish
                </Link>
              </p>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
