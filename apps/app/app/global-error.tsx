"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import type NextError from "next/error";
import { useEffect } from "react";
import { inter } from "./fonts";

interface GlobalErrorProperties {
  readonly error: NextError & { digest?: string };
  readonly reset: () => void;
}

const GlobalError = ({ error, reset }: GlobalErrorProperties) => {
  useEffect(() => {
    // No observability package is wired up yet; swap this for the real reporter
    // when one lands, so crashes stop dying in the user's console.
    // biome-ignore lint/suspicious/noConsole: only channel available today
    console.error(error);
  }, [error]);

  return (
    <html className={cn(fonts, inter.variable)} lang="en">
      <body className="flex h-dvh flex-col items-center justify-center gap-4">
        <h1 className="font-semibold text-lg">Oops, something went wrong</h1>
        <Button onClick={() => reset()}>Try again</Button>
      </body>
    </html>
  );
};

export default GlobalError;
