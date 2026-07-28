import { PhoneField } from "@repo/auth/components/phone-field";
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
import { z } from "zod";
import { useAuth } from "@/lib/auth/context";
import { safeDestination } from "@/lib/auth/safe-destination";

const searchSchema = z.object({
  /** Where to land after signing in. Attacker-controlled — see safeDestination. */
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/sign-in")({
  validateSearch: searchSchema,
  /*
   * The other half of the redirect matrix: signed-in operators never see the
   * sign-in form. packages/auth/config.ts enforced both directions in one
   * `authorized` callback; here it is this guard plus the one in _authed.tsx.
   */
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: safeDestination(search.redirect) });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { redirect: destination } = Route.useSearch();

  const mutation = useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      signIn(phone, password),
    onSuccess: () =>
      navigate({ to: safeDestination(destination), replace: true }),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    mutation.mutate({
      // PhoneField assembles country code + national digits into one hidden
      // input, so the form still reads a single bare-digit `phone` value.
      phone: String(data.get("phone") ?? ""),
      password: String(data.get("password") ?? ""),
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
          <CardTitle>Xush kelibsiz</CardTitle>
          <CardDescription>Davom etish uchun tizimga kiring.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="phone">Telefon raqami</FieldLabel>
                <PhoneField
                  disabled={mutation.isPending}
                  id="phone"
                  invalid={mutation.isError}
                  name="phone"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Parol</FieldLabel>
                <Input
                  aria-invalid={mutation.isError}
                  autoComplete="current-password"
                  /* Kept mounted and merely disabled while submitting, so the
                     operator's typed value stays on screen. */
                  disabled={mutation.isPending}
                  id="password"
                  name="password"
                  required
                  type="password"
                />
                {mutation.isError ? (
                  <FieldError>{mutation.error.message}</FieldError>
                ) : null}
              </Field>

              <Button disabled={mutation.isPending} type="submit">
                {mutation.isPending ? <Spinner /> : null}
                Kirish
              </Button>

              {/* The only way to reach sign-up: it is deliberately not in the
                  sidebar, since registration onboards a whole new tenant. */}
              <p className="text-center text-base text-muted-foreground">
                Hisobingiz yo'qmi?{" "}
                <Link
                  className="text-primary-accent underline-offset-4 hover:underline"
                  to="/sign-up"
                >
                  Hisob yaratish
                </Link>
              </p>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
