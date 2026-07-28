"use client";

import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext } from "react";

type TConfirmationState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-denied"
  | "output-error";

type TToolUIPartApproval =
  | {
      id: string;
      approved?: never;
      reason?: never;
    }
  | {
      id: string;
      approved: true;
      reason?: string;
    }
  | {
      id: string;
      approved: false;
      reason?: string;
    }
  | undefined;

interface TConfirmationContextValue {
  approval: TToolUIPartApproval;
  state: TConfirmationState;
}

const ConfirmationContext = createContext<TConfirmationContextValue | null>(
  null
);

const useConfirmation = () => {
  const context = useContext(ConfirmationContext);

  if (!context) {
    throw new Error("Confirmation components must be used within Confirmation");
  }

  return context;
};

// ─── Root ────────────────────────────────────────────────────────────

export type ConfirmationProps = ComponentProps<typeof Alert> & {
  approval?: TToolUIPartApproval;
  state: TConfirmationState;
};

export const Confirmation = ({
  className,
  approval,
  state,
  ...props
}: ConfirmationProps) => {
  if (!approval || state === "input-streaming" || state === "input-available") {
    return null;
  }

  return (
    <ConfirmationContext.Provider value={{ approval, state }}>
      <Alert className={cn("flex flex-col gap-2", className)} {...props} />
    </ConfirmationContext.Provider>
  );
};

// ─── Description ─────────────────────────────────────────────────────

export type ConfirmationTitleProps = ComponentProps<typeof AlertDescription>;

export const ConfirmationTitle = (props: ConfirmationTitleProps) => (
  <AlertDescription {...props} />
);

// ─── State slots ─────────────────────────────────────────────────────

export interface ConfirmationRequestProps {
  children?: ReactNode;
}

export const ConfirmationRequest = ({ children }: ConfirmationRequestProps) => {
  const { state } = useConfirmation();

  if (state !== "approval-requested") {
    return null;
  }

  return children;
};

export interface ConfirmationAcceptedProps {
  children?: ReactNode;
}

export const ConfirmationAccepted = ({
  children,
}: ConfirmationAcceptedProps) => {
  const { approval, state } = useConfirmation();

  if (
    !approval?.approved ||
    (state !== "approval-responded" &&
      state !== "output-denied" &&
      state !== "output-available")
  ) {
    return null;
  }

  return children;
};

export interface ConfirmationRejectedProps {
  children?: ReactNode;
}

export const ConfirmationRejected = ({
  children,
}: ConfirmationRejectedProps) => {
  const { approval, state } = useConfirmation();

  if (
    approval?.approved !== false ||
    (state !== "approval-responded" &&
      state !== "output-denied" &&
      state !== "output-available")
  ) {
    return null;
  }

  return children;
};

// ─── Actions ─────────────────────────────────────────────────────────

export type ConfirmationActionsProps = ComponentProps<"div">;

export const ConfirmationActions = ({
  className,
  ...props
}: ConfirmationActionsProps) => {
  const { state } = useConfirmation();

  if (state !== "approval-requested") {
    return null;
  }

  return (
    <div
      className={cn("flex items-center justify-end gap-2 self-end", className)}
      {...props}
    />
  );
};

export type ConfirmationActionProps = ComponentProps<typeof Button>;

export const ConfirmationAction = ({
  size = "sm",
  ...props
}: ConfirmationActionProps) => <Button size={size} type="button" {...props} />;
