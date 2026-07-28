import { Logo } from "@repo/design-system/components/logo";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { Link } from "@tanstack/react-router";
import { FileQuestionIcon } from "lucide-react";

/**
 * Shown while the boot session check is in flight.
 *
 * Branded rather than a bare spinner because on a cold load this is the first
 * thing the front desk sees, and it resolves in a LAN round trip.
 */
export const BootScreen = () => (
  <div
    aria-busy="true"
    className="flex min-h-svh flex-col items-center justify-center gap-4"
  >
    <Logo
      accentClassName="text-primary-accent"
      markClassName="size-10 text-primary"
      wordmarkClassName="text-2xl"
    />
    <Spinner />
  </div>
);

/**
 * The last resort when a route throws.
 *
 * Without this a render error unmounts the tree and leaves a blank page — no
 * message, no stack, nothing to act on. Showing the message costs nothing and
 * turns "the app is broken" into a sentence someone can paste into a bug report.
 * The reload button matters on a touchscreen terminal with no visible browser
 * chrome to refresh from.
 */
export const CrashScreen = ({ error }: { error: Error }) => (
  <div
    className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
    role="alert"
  >
    <Logo
      accentClassName="text-primary-accent"
      markClassName="size-10 text-primary"
      wordmarkClassName="text-2xl"
    />
    <div className="space-y-1">
      <p className="font-medium">Nimadir noto'g'ri ketdi</p>
      <p className="max-w-md text-muted-foreground text-sm">{error.message}</p>
    </div>
    <Button onClick={() => window.location.reload()} variant="outline">
      Qayta yuklash
    </Button>
  </div>
);

/** Replaces the 404 that lived in the deleted app.tsx. */
export const NotFound = () => (
  <div className="flex flex-1 items-center justify-center p-8">
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestionIcon />
        </EmptyMedia>
        <EmptyTitle>404</EmptyTitle>
        <EmptyDescription>This page does not exist.</EmptyDescription>
      </EmptyHeader>
      <Button asChild variant="outline">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </Empty>
  </div>
);
