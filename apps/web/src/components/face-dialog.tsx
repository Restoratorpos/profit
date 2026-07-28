import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import {
  CameraIcon,
  CheckIcon,
  ImageIcon,
  RefreshCwIcon,
  ScanFaceIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  armFaceCapture,
  captureFace,
  disarmFaceCapture,
  type FacePersonType,
  setFace,
  syncFace,
  type TerminalFaceStatus,
} from "@/lib/face/api";
import type { Messages } from "@/lib/i18n/dictionary";
import { prepareFacePhoto } from "@/lib/images";

/**
 * How often the terminals are re-asked while the dialog is open.
 *
 * Each tick costs every active terminal a registration and a face check — six
 * round trips on the box that is also trying to recognise people walking in — and
 * since Capture now answers on the spot, this only has to catch the fallback
 * route. Slow enough to stay out of the device's way, fast enough that a face
 * enrolled at the door shows up before anybody reaches for Refresh.
 */
const POLL_MS = 6000;

interface FaceDialogProperties {
  messages: Messages;
  onDone: (hasFace: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onPhotoPicked: (photo: string) => void;
  /**
   * Writes the person so a brand-new one can be registered on a terminal. A
   * face has to attach to an `employeeNo`, and until they are saved there is no
   * id to be — so the dialog offers to do the save rather than sending the
   * operator back out to press a different button.
   */
  onSaveFirst?: () => Promise<{ error?: string; ok: boolean }>;
  open: boolean;
  /** Null until they have been saved — there is no id to register yet. */
  personId: string | null;
  /**
   * Which collection they belong to. The enrolment is identical either way; this
   * only decides which endpoint it goes to and which list gets revalidated.
   */
  personType: FacePersonType;
}

/** One terminal, whether it has this person's face yet, and the way to take it. */
const TerminalRow = ({
  hasAttempted,
  isBusy,
  isCapturing,
  messages,
  onCapture,
  terminal,
}: {
  /** True once a scan has been tried and finished, which makes this a retry. */
  hasAttempted: boolean;
  isBusy: boolean;
  isCapturing: boolean;
  messages: Messages;
  onCapture: () => void;
  terminal: TerminalFaceStatus;
}) => {
  const state = (() => {
    if (isCapturing) {
      return {
        icon: <Spinner />,
        text: messages["members.faceCapturing"],
        tone: "bg-primary/10 text-primary-accent",
      };
    }

    if (terminal.error) {
      return {
        icon: <TriangleAlertIcon className="size-4" />,
        text: terminal.error,
        tone: "bg-destructive/10 text-destructive",
      };
    }

    if (terminal.hasFace) {
      return {
        icon: <CheckIcon className="size-4" />,
        text: messages["members.faceEnrolled"],
        tone: "bg-primary/10 text-primary-accent",
      };
    }

    return {
      icon: <ScanFaceIcon className="size-4" />,
      text: messages["members.faceWaiting"],
      tone: "bg-muted text-muted-foreground",
    };
  })();

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          state.tone
        )}
      >
        {state.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{terminal.name}</p>
        <p
          className={cn(
            "truncate text-sm",
            terminal.error ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {state.text}
        </p>
      </div>

      {/* The scan starts on its own, so by the time anybody reads this button it
          is a second chance: the terminal timed out, or the person was not
          looking, or it is the wrong door and this is the right one. It stays
          available when a face is already on file, because replacing one is the
          other half of this. */}
      <Button
        disabled={isBusy}
        onClick={onCapture}
        size="sm"
        type="button"
        variant="outline"
      >
        {hasAttempted ? (
          <RefreshCwIcon className="size-4" />
        ) : (
          <CameraIcon className="size-4" />
        )}
        {hasAttempted
          ? messages["members.faceRetry"]
          : messages["members.faceCapture"]}
      </Button>
    </div>
  );
};

/**
 * Getting a face onto the terminals.
 *
 * Opening it registers the person on every active terminal straight away, so
 * the operator can walk over and capture the face with the device's own camera —
 * the better template by some distance, because it is taken by the same lens and
 * IR sensor that will later match it. The refresh button then answers "have they
 * done it yet?" without anybody walking back.
 *
 * Uploading a photo stays available underneath, because sometimes the person is
 * not in the building.
 */
export const FaceDialog = ({
  messages,
  onDone,
  onOpenChange,
  onPhotoPicked,
  onSaveFirst,
  open,
  personId,
  personType,
}: FaceDialogProperties) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [terminals, setTerminals] = useState<TerminalFaceStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  /** The terminal currently holding its camera open, if any. */
  const [capturingId, setCapturingId] = useState<string | null>(null);
  /** Stops the poll once a face has landed; nothing left to wait for. */
  const [hasCaptured, setHasCaptured] = useState(false);
  /**
   * True once a scan has run to a conclusion. Only used to word the buttons: a
   * "Capture" the operator never pressed cannot be offered again as "Capture".
   */
  const [hasAttempted, setHasAttempted] = useState(false);

  /**
   * Saves the person, which turns `personId` from null into an id — and the
   * effect below then registers them on the terminals without another press.
   */
  const saveFirst = async () => {
    if (!onSaveFirst) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const result = await onSaveFirst();

    setIsSaving(false);

    if (!result.ok) {
      setError(result.error ?? messages["members.faceSaveFailed"]);
    }
  };

  /**
   * Re-reads the terminals.
   *
   * `silent` is the whole difference between this being helpful and being in the
   * way. A background tick must not touch `isSyncing` or the error banner: a poll
   * takes a couple of seconds of talking to the terminal, and anything gated on
   * "busy" would spend half its life disabled under the operator's cursor — which
   * is exactly what happened to the Capture button.
   */
  const sync = useCallback(
    async ({
      isInitial = false,
      silent = false,
    }: {
      isInitial?: boolean;
      silent?: boolean;
    } = {}): Promise<TerminalFaceStatus[]> => {
      if (!personId) {
        return [];
      }

      if (!silent) {
        setIsSyncing(true);
        setError(null);
      }

      const result = await syncFace(personType, personId);

      setTerminals(result.terminals);

      if (!silent) {
        setError(result.error ?? null);
        setIsSyncing(false);
      }

      if (result.terminals.some((terminal) => terminal.hasFace)) {
        onDone(true);

        /*
         * A face that was already on the terminal when the dialog opened is not
         * something that just happened. Counting it would open "Change the face"
         * on a finished-looking dialog and stop the poll before the replacement
         * the operator came here for.
         */
        if (!isInitial) {
          setHasCaptured(true);
        }
      }

      return result.terminals;
    },
    [onDone, personId, personType]
  );

  /**
   * Asks the terminal to take the photo. It holds its camera open for about
   * twenty seconds, so this is deliberately a long wait with the row saying so —
   * the operator is standing there watching for the tick.
   */
  const capture = async (terminalId: string) => {
    if (!personId) {
      return;
    }

    setCapturingId(terminalId);
    setError(null);

    const result = await captureFace(personType, personId, terminalId);

    setCapturingId(null);
    setHasAttempted(true);

    if (!result.ok) {
      setError(result.error ?? messages["members.faceCaptureFailed"]);
      return;
    }

    setHasCaptured(true);
    onDone(true);
    // Re-read the terminals so every row shows the face, not just this one.
    await sync();
  };

  // Kept in refs so the effects below never re-subscribe as these are rebuilt.
  const syncRef = useRef(sync);
  const captureRef = useRef(capture);
  /** Mirrors `capturingId` for the effects, which must not depend on it. */
  const isCapturingRef = useRef(false);

  useEffect(() => {
    syncRef.current = sync;
    captureRef.current = capture;
    isCapturingRef.current = Boolean(capturingId);
  });

  /*
   * Reopening is a fresh attempt. Everything below describes the *last* one, and
   * showing a finished dialog to somebody who just pressed "Change the face"
   * answers a question they did not ask.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    setHasCaptured(false);
    setHasAttempted(false);
    setTerminals([]);
  }, [open]);

  /*
   * Opening this dialog *is* the instruction to scan.
   *
   * The operator got here by pressing "Add a face", "Change the face", or
   * Continue on a new member — in every case with the person standing at the
   * terminal — so there is nothing left to decide and nothing worth making them
   * press. Registering them, arming the fallback and opening the terminal's
   * camera all happen on their own; the buttons underneath exist for when this
   * does not work the first time.
   */
  useEffect(() => {
    if (!(open && personId) || isCapturingRef.current) {
      return;
    }

    let isCancelled = false;

    const begin = async () => {
      // The fallback, armed first because it costs nothing and covers the case
      // where the capture below times out: a face the terminal refuses while
      // this dialog is open still lands on this member.
      armFaceCapture(personType, personId);

      const terminals = await syncRef.current({ isInitial: true });

      // Closed, or reopened against somebody else, while we were registering.
      if (isCancelled) {
        return;
      }

      /*
       * One terminal, not all of them. A person can only stand in front of one,
       * and a second camera held open at another door would happily enrol
       * whoever walks past it — a stranger's face on the member is a far worse
       * outcome than a retry, and a silent one.
       */
      const target = terminals.find((terminal) => !terminal.error);

      if (!target) {
        return;
      }

      await captureRef.current(target.id);
    };

    begin();

    return () => {
      isCancelled = true;
      // Whatever happens next, this member is no longer the one waiting.
      disarmFaceCapture(personType, personId);
    };
  }, [open, personId, personType]);

  /*
   * Polled rather than pressed: the operator is at the terminal with their back
   * to the screen, and coming back to a tick already showing is the difference
   * between this feeling automatic and feeling like homework.
   */
  useEffect(() => {
    // Never while a capture is running: polling re-registers the person on every
    // terminal, and that is the last thing to put in front of a camera that is
    // mid-capture.
    if (!(open && personId) || hasCaptured || capturingId) {
      return;
    }

    const timer = setInterval(() => syncRef.current({ silent: true }), POLL_MS);

    return () => clearInterval(timer);
  }, [capturingId, hasCaptured, personId, open]);

  const handlePhoto = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setIsUploading(true);
    setError(null);

    const photo = await prepareFacePhoto(file);

    if (!personId) {
      // Nothing to attach it to yet — hand it back to the form, which will
      // upload it the moment the member is created.
      onPhotoPicked(photo);
      setIsUploading(false);
      onOpenChange(false);
      return;
    }

    const result = await setFace(personType, personId, photo);

    setIsUploading(false);

    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }

    onDone(true);
    onOpenChange(false);
  };

  const isBusy = isSyncing || isUploading || isSaving || Boolean(capturingId);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{messages["members.faceDialogTitle"]}</DialogTitle>
          <DialogDescription>
            {(() => {
              if (!personId) {
                return messages["members.faceDialogUnsaved"];
              }

              if (hasCaptured) {
                return messages["members.faceCaptured"];
              }

              // The camera is open right now — this is the one line the operator
              // actually needs, and it has to beat the generic hint to be read.
              if (capturingId) {
                return messages["members.faceDialogScanning"];
              }

              return isSyncing
                ? messages["members.faceDialogPreparing"]
                : messages["members.faceDialogHint"];
            })()}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {personId ? (
          <div className="flex flex-col gap-2">
            {isSyncing && terminals.length === 0 ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : null}

            {terminals.map((terminal) => (
              <TerminalRow
                hasAttempted={hasAttempted}
                isBusy={isBusy}
                isCapturing={capturingId === terminal.id}
                key={terminal.id}
                messages={messages}
                onCapture={() => capture(terminal.id)}
                terminal={terminal}
              />
            ))}
          </div>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-2">
            {personId ? (
              <Button
                disabled={isBusy}
                onClick={() => sync()}
                type="button"
                variant="outline"
              >
                {isSyncing ? <Spinner /> : <RefreshCwIcon className="size-4" />}
                {messages["members.faceRefresh"]}
              </Button>
            ) : null}

            {/* The way out of "you have to save first": press it here, and the
                terminal rows appear underneath without leaving the dialog. */}
            {personId || !onSaveFirst ? null : (
              <Button disabled={isBusy} onClick={saveFirst} type="button">
                {isSaving ? <Spinner /> : <ScanFaceIcon className="size-4" />}
                {messages["members.faceSaveFirst"]}
              </Button>
            )}

            <Button
              disabled={isBusy}
              onClick={() => inputRef.current?.click()}
              type="button"
              variant="outline"
            >
              {isUploading ? <Spinner /> : <ImageIcon className="size-4" />}
              {messages["members.faceFromPhoto"]}
            </Button>
          </div>

          {/* Skip until a face lands, then Done — the same button, saying what
              leaving actually means at that moment. */}
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant={hasCaptured ? "default" : "ghost"}
          >
            {hasCaptured
              ? messages["members.faceDone"]
              : messages["members.faceSkip"]}
          </Button>
        </DialogFooter>

        <Input
          accept="image/jpeg,image/png"
          className="sr-only"
          onChange={(event) => handlePhoto(event.target.files?.[0])}
          ref={inputRef}
          tabIndex={-1}
          type="file"
        />
      </DialogContent>
    </Dialog>
  );
};
