import { Button } from "@repo/design-system/components/ui/button";
import { Field, FieldLabel } from "@repo/design-system/components/ui/field";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { FacePersonType } from "@/lib/face/api";
import type { Messages } from "@/lib/i18n/dictionary";
import { FaceDialog } from "./face-dialog";

interface FaceFieldProperties {
  disabled?: boolean;
  /** True when this person already has a face on a terminal. */
  hasFace: boolean;
  messages: Messages;
  onHasFace: (hasFace: boolean) => void;
  /** Held by the form and uploaded once the person exists. */
  onPhoto: (photo: string) => void;
  onRemove?: () => Promise<void>;
  /** Writes the person so a brand-new one can be registered on a terminal. */
  onSaveFirst?: () => Promise<{ error?: string; ok: boolean }>;
  /** Null until they have been saved; the dialog adapts. */
  personId: string | null;
  personType: FacePersonType;
  /** A photo picked before they existed, waiting on the save. */
  photo: string | null;
}

/**
 * One button, and everything behind it happens in the dialog.
 *
 * The button used to set an intent that only took effect on save, which meant
 * pressing it appeared to do nothing at all — the worst possible answer for a
 * control whose whole job is "make this work now".
 */
export const FaceField = ({
  disabled,
  hasFace,
  messages,
  onHasFace,
  onPhoto,
  onRemove,
  onSaveFirst,
  personId,
  personType,
  photo,
}: FaceFieldProperties) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const isSet = hasFace || Boolean(photo);

  const status = (() => {
    if (photo && !hasFace) {
      return messages["members.facePicked"];
    }

    return hasFace
      ? messages["members.faceEnrolled"]
      : messages["members.faceNone"];
  })();

  const handleRemove = async () => {
    if (!onRemove) {
      return;
    }

    setIsRemoving(true);
    await onRemove();
    setIsRemoving(false);
  };

  return (
    <Field>
      {/* The state is the label: it says what this field is and where it stands,
          which a static "Face ID" heading above it would only repeat. */}
      <FieldLabel>{status}</FieldLabel>

      <div className="flex items-center gap-1">
        <Button
          disabled={disabled}
          onClick={() => setIsOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          {isSet ? (
            <RefreshCwIcon className="size-4" />
          ) : (
            <PlusIcon className="size-4" />
          )}
          {isSet ? messages["members.faceChange"] : messages["members.faceAdd"]}
        </Button>

        {hasFace && onRemove ? (
          <Button
            aria-label={messages["devices.revoke"]}
            className="text-muted-foreground"
            disabled={disabled || isRemoving}
            onClick={handleRemove}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {isRemoving ? <Spinner /> : <Trash2Icon className="size-5" />}
          </Button>
        ) : null}
      </div>

      <FaceDialog
        messages={messages}
        onDone={onHasFace}
        onOpenChange={setIsOpen}
        onPhotoPicked={onPhoto}
        onSaveFirst={onSaveFirst}
        open={isOpen}
        personId={personId}
        personType={personType}
      />
    </Field>
  );
};
