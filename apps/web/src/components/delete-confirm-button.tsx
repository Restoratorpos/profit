import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { Trash2Icon } from "lucide-react";
import type { Messages } from "@/lib/i18n/dictionary";

interface DeleteConfirmButtonProperties {
  /** True while this row's delete is in flight. */
  isPending: boolean;
  /** Shown in the prompt so the operator can see *what* they are deleting. */
  itemName: string;
  messages: Messages;
  onConfirm: () => void;
  /** An extra consequence worth spelling out, e.g. "used in 3 combos". */
  warning?: string | null;
}

/**
 * Deleting from the catalog used to happen on a single click of a trash icon,
 * next to the edit icon, with no way back — and this repo has no git history to
 * recover from. One confirm step is the cheapest fix, and it is also where the
 * knock-on effects (an ingredient that several combos are costed from) can be
 * said out loud instead of discovered afterwards.
 */
export const DeleteConfirmButton = ({
  isPending,
  itemName,
  messages,
  onConfirm,
  warning,
}: DeleteConfirmButtonProperties) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button
        aria-label={`${messages["common.delete"]}: ${itemName}`}
        className="text-muted-foreground hover:text-destructive"
        disabled={isPending}
        size="icon-sm"
        variant="ghost"
      >
        {isPending ? <Spinner /> : <Trash2Icon className="size-5" />}
      </Button>
    </AlertDialogTrigger>

    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogMedia className="bg-destructive/10 text-destructive">
          <Trash2Icon />
        </AlertDialogMedia>
        <AlertDialogTitle>{messages["common.confirmDelete"]}</AlertDialogTitle>
        <AlertDialogDescription>
          <span className="block font-medium text-foreground">{itemName}</span>
          {messages["common.confirmDeleteBody"]}
          {warning ? (
            <span className="mt-2 block text-destructive">{warning}</span>
          ) : null}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <AlertDialogFooter>
        <AlertDialogCancel>{messages["common.cancel"]}</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} variant="destructive">
          {messages["common.delete"]}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
