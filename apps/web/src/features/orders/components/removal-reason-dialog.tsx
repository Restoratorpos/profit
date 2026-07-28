import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { cn } from "@repo/design-system/lib/utils";
import { useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import type {
  RemovalDetail,
  RemovalDisposition,
  RemovalReason,
} from "../types";

const REASONS: readonly { labelKey: keyof Messages; value: RemovalReason }[] = [
  { value: "changed_mind", labelKey: "orders.reasonChangedMind" },
  { value: "customer_fault", labelKey: "orders.reasonCustomerFault" },
  { value: "wrong_item", labelKey: "orders.reasonWrongItem" },
  { value: "damaged", labelKey: "orders.reasonDamaged" },
  { value: "other", labelKey: "orders.reasonOther" },
];

const DISPOSITIONS: readonly {
  labelKey: keyof Messages;
  value: RemovalDisposition;
}[] = [
  { value: "wasted", labelKey: "orders.dispositionWasted" },
  { value: "returned", labelKey: "orders.dispositionReturned" },
];

/** The line the dialog is currently asking about. */
export interface RemovalRequest {
  /** True when the whole line goes, false when it is only being stepped down. */
  isRemoval: boolean;
  name: string;
  /** `order_rep_id`. */
  targetId: string;
}

interface RemovalReasonDialogProperties {
  messages: Messages;
  onCancel: () => void;
  onConfirm: (detail: RemovalDetail) => void;
  /** How many lines are still to be answered, including this one. */
  remaining: number;
  request: RemovalRequest | null;
}

/**
 * Asks why units came off a sale and where they went. Raised on Save, once per
 * reduced line — so it names the line, which is the only thing tying the question
 * back to the row the operator changed a few taps ago.
 *
 * `wasted` is the default because that is the honest assumption: goods only go
 * back on the shelf if somebody says they did.
 *
 * Remounted per line by the caller (keyed), so it always opens blank rather than
 * carrying the previous line's answer.
 */
export const RemovalReasonDialog = ({
  messages,
  onCancel,
  onConfirm,
  remaining,
  request,
}: RemovalReasonDialogProperties) => {
  const [reason, setReason] = useState<RemovalReason | null>(null);
  const [disposition, setDisposition] = useState<RemovalDisposition>("wasted");

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      open={request !== null}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>
              {request?.isRemoval
                ? messages["orders.removeTitle"]
                : messages["orders.reduceTitle"]}
            </span>
            {/* Several lines changed — say how many questions are left, so the
                run of dialogs does not feel open-ended. */}
            {remaining > 1 ? (
              <span className="font-normal text-muted-foreground text-sm tabular-nums">
                {remaining}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {messages["orders.reasonPrompt"]}
          </DialogDescription>
        </DialogHeader>

        {/* The line in question. Asked at Save time, this is the only thing
            connecting the question to the row that changed. */}
        <p className="rounded-xl bg-muted px-4 py-2.5 font-semibold">
          {request?.name}
        </p>

        <div
          aria-label={messages["orders.reasonPrompt"]}
          className="flex flex-col gap-2"
          role="radiogroup"
        >
          {REASONS.map((option) => {
            const active = reason === option.value;

            return (
              <Button
                aria-checked={active}
                className={cn(
                  "h-11 justify-start rounded-xl font-normal",
                  active &&
                    "border-primary bg-primary/10 font-medium text-primary-accent"
                )}
                key={option.value}
                onClick={() => setReason(option.value)}
                role="radio"
                type="button"
                variant="outline"
              >
                {messages[option.labelKey]}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            {messages["orders.dispositionPrompt"]}
          </p>
          <div
            aria-label={messages["orders.dispositionPrompt"]}
            className="grid grid-cols-2 gap-3"
            role="radiogroup"
          >
            {DISPOSITIONS.map((option) => {
              const active = disposition === option.value;

              return (
                <Button
                  aria-checked={active}
                  className={cn(
                    "h-11 rounded-xl",
                    active &&
                      "border-primary bg-primary/10 font-semibold text-primary-accent"
                  )}
                  key={option.value}
                  onClick={() => setDisposition(option.value)}
                  role="radio"
                  type="button"
                  variant="outline"
                >
                  {messages[option.labelKey]}
                </Button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex-row gap-3">
          <Button
            className="flex-1 rounded-xl"
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            {messages["common.cancel"]}
          </Button>
          <Button
            className="flex-1 rounded-xl"
            disabled={reason === null}
            onClick={() => {
              if (reason) {
                onConfirm({ disposition, reason });
              }
            }}
            title={reason === null ? messages["orders.reasonRequired"] : ""}
            type="button"
          >
            {messages["orders.confirm"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
