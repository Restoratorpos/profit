import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import { CalendarDaysIcon } from "lucide-react";
import { useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import { usePayday, useSetPayday } from "../api";

/**
 * 1 to 28.
 *
 * Not 31: every month has a 28th and only seven have a 31st, so a payday past
 * it would simply not occur in February. A day that silently skips a month is a
 * worse setting than one the desk cannot pick.
 */
const DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

interface PaydayDialogProperties {
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/** Which day of the month the gym settles monthly salaries on. */
export const PaydayDialog = ({
  messages,
  onOpenChange,
  open,
}: PaydayDialogProperties) => {
  const { data } = usePayday();
  const setPayday = useSetPayday();

  /*
   * Null until touched, then the local choice wins. Seeding straight from the
   * query would reset the grid under the operator's finger when the setting
   * refetches, so the saved day is only a fallback for "nothing picked yet".
   */
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? data?.payday ?? null;

  const save = () => {
    if (selected === null) {
      return;
    }

    setPayday.mutate(selected, {
      onSuccess: () => {
        setPicked(null);
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {/* No description: the grid says what it is, and a paragraph above it
          would only push the days further from the button that opens them. */}
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDaysIcon className="size-5 text-primary-accent" />
            {messages["workers.paydayTitle"]}
          </DialogTitle>
        </DialogHeader>

        <div
          aria-label={messages["workers.paydayTitle"]}
          className="grid grid-cols-7 gap-2"
          role="radiogroup"
        >
          {DAYS.map((day) => {
            const active = day === selected;

            return (
              <Button
                aria-checked={active}
                className={cn("h-11 tabular-nums", active && SELECTED_TINT)}
                disabled={setPayday.isPending}
                key={day}
                onClick={() => setPicked(day)}
                role="radio"
                type="button"
                variant="outline"
              >
                {day}
              </Button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            className="w-full"
            disabled={selected === null || setPayday.isPending}
            onClick={save}
            type="button"
          >
            {setPayday.isPending ? <Spinner /> : null}
            {messages["common.save"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
