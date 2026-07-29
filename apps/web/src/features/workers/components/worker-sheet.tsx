import { Button } from "@repo/design-system/components/ui/button";
import { DatePicker } from "@repo/design-system/components/ui/date-picker";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { TimePicker } from "@repo/design-system/components/ui/time-picker";
import { SELECTED_FILL } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import { UserPlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { FaceDialog } from "@/components/face-dialog";
import { FaceField } from "@/components/face-field";
import { removeFace, setFace } from "@/lib/face/api";
import type { Messages } from "@/lib/i18n/dictionary";
import { useCreateWorker, useUpdateWorker, type WorkerInput } from "../api";
import {
  positionLabelKey,
  WEEKDAYS,
  WORKER_POSITIONS,
  type WorkerListItem,
  type WorkerPosition,
  type WorkerSalaryType,
} from "../types";

interface WorkerSheetProperties {
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  worker?: WorkerListItem | null;
}

const DEFAULT_DAYS = [1, 2, 3, 4, 5];

export const WorkerSheet = ({
  messages,
  onOpenChange,
  open,
  worker,
}: WorkerSheetProperties) => {
  const isEditing = Boolean(worker);

  const [position, setPosition] = useState<WorkerPosition>(
    (WORKER_POSITIONS.find((value) => value === worker?.role) ??
      "trainer") as WorkerPosition
  );
  const [salaryType, setSalaryType] = useState<WorkerSalaryType>(
    worker?.salaryType === "hourly" ? "hourly" : "monthly"
  );
  const [days, setDays] = useState<Set<number>>(
    new Set(worker?.workingDays?.length ? worker.workingDays : DEFAULT_DAYS)
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  /**
   * A photo picked before the worker existed. On an edit the dialog uploads it
   * itself; on a create there is nothing to attach it to until the save, so it
   * waits here.
   */
  const [photo, setPhoto] = useState<string | null>(null);
  const [hasFace, setHasFace] = useState(worker?.hasFace ?? false);
  /** The id a create just minted — what the face dialog then enrols against. */
  const [createdId, setCreatedId] = useState<string | null>(null);

  const createWorker = useCreateWorker();
  const updateWorker = useUpdateWorker();
  const [isFaceOpen, setIsFaceOpen] = useState(false);

  const toggleDay = (day: number) =>
    setDays((current) => {
      const next = new Set(current);

      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }

      return next;
    });

  /**
   * Writes the worker, and hands back the id the face step needs.
   *
   * Editing already knows that id; creating only learns it from the response,
   * which is why the two branches cannot simply share a call.
   */
  const savePerson = async (
    input: WorkerInput,
    existingId: string | null
  ): Promise<{ error?: string; ok: boolean; workerId: string | null }> => {
    /*
     * `mutateAsync` rather than `mutate`, because this is one of the two places
     * the caller genuinely has to wait: the face step runs afterwards and needs
     * the id a create only learns from the response. The {ok, error} shape is
     * kept because the face flow branches on it.
     */
    try {
      if (existingId) {
        await updateWorker.mutateAsync({ input, workerId: existingId });

        return { ok: true, workerId: existingId };
      }

      const created = await createWorker.mutateAsync(input);

      setCreatedId(created.id);

      return { ok: true, workerId: created.id };
    } catch (cause) {
      return {
        error: (cause as Error).message,
        ok: false,
        workerId: existingId,
      };
    }
  };

  /**
   * Applies a photo picked before the worker existed, once there is somebody to
   * apply it to.
   *
   * It runs after the person is written, never with them: it needs an id that on
   * a create does not exist until the save returns, and it talks to hardware
   * over the LAN — a terminal that is unplugged must not undo a hire that
   * already succeeded.
   */
  const saveFace = async (
    workerId: string | null
  ): Promise<{ error?: string; ok: boolean }> => {
    if (!(photo && workerId)) {
      return { ok: true };
    }

    return await setFace("worker", workerId, photo);
  };

  const readForm = (form: HTMLFormElement): WorkerInput | null => {
    const data = new FormData(form);
    const fullname = String(data.get("fullname") ?? "").trim();

    if (fullname.length === 0) {
      setNameError("Required");
      return null;
    }

    setNameError(null);

    return {
      fullname,
      phone: String(data.get("phone") ?? "").trim(),
      role: position,
      salaryType,
      salaryAmount: String(data.get("salaryAmount") ?? "0").trim() || "0",
      hiredAt: String(data.get("hiredAt") ?? "").trim() || null,
      shiftStart: String(data.get("shiftStart") ?? "").trim() || null,
      shiftEnd: String(data.get("shiftEnd") ?? "").trim() || null,
      workingDays: [...days].sort((a, b) => a - b),
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const input = readForm(event.currentTarget);

    if (!input) {
      return;
    }

    setFormError(null);
    setIsPending(true);

    /*
     * `createdId` is set when a create already happened and the sheet stayed
     * open for the face step. From then on this is an edit, whatever it was
     * opened as — without it a second submit would hire the same person twice.
     */
    const existingId = worker?.id ?? createdId;
    const saved = await savePerson(input, existingId);

    if (!saved.ok) {
      setIsPending(false);
      setFormError(saved.error ?? "Something went wrong.");
      return;
    }

    const face = await saveFace(saved.workerId);

    setIsPending(false);

    if (!face.ok) {
      setFormError(face.error ?? "Something went wrong.");
      return;
    }

    /*
     * Hiring somebody ends at the terminal, not at a closed sheet: their face is
     * what clocks them on, they are standing right there, and this is the only
     * moment it is easy to take. The dialog carries a Skip, so this is an offer
     * rather than a gate.
     */
    if (!(isEditing || existingId) && saved.workerId) {
      setIsFaceOpen(true);
      return;
    }

    onOpenChange(false);
  };

  const handleRemoveFace = async () => {
    const workerId = worker?.id ?? createdId;

    if (!workerId) {
      return;
    }

    const result = await removeFace("worker", workerId);

    if (result.ok) {
      setHasFace(false);
      setPhoto(null);
      return;
    }

    setFormError(result.error ?? "Something went wrong.");
  };

  const salaryLabel =
    salaryType === "hourly"
      ? messages["workers.hourlyRate"]
      : messages["workers.monthlySalary"];

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserPlusIcon className="size-5 text-primary-accent" />
            {isEditing ? messages["workers.edit"] : messages["workers.add"]}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {isEditing ? messages["workers.edit"] : messages["workers.add"]}
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <Field data-invalid={Boolean(nameError) || undefined}>
              <FieldLabel htmlFor="worker-name">
                <span className="text-destructive">*</span>{" "}
                {messages["workers.fieldFullName"]}
              </FieldLabel>
              <Input
                aria-invalid={Boolean(nameError)}
                defaultValue={worker?.name ?? ""}
                disabled={isPending}
                id="worker-name"
                name="fullname"
              />
              {nameError ? <FieldError>{nameError}</FieldError> : null}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="worker-phone">
                  {messages["workers.fieldPhone"]}
                </FieldLabel>
                <Input
                  defaultValue={worker?.phone ?? "+998"}
                  disabled={isPending}
                  id="worker-phone"
                  inputMode="tel"
                  name="phone"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="worker-position">
                  {messages["workers.fieldPosition"]}
                </FieldLabel>
                <Select
                  disabled={isPending}
                  onValueChange={(next) => setPosition(next as WorkerPosition)}
                  value={position}
                >
                  <SelectTrigger className="w-full" id="worker-position">
                    <SelectValue placeholder={messages["workers.pickRole"]} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {WORKER_POSITIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {messages[positionLabelKey(value)]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Sits with the person, above the pay: their face is what clocks
                them on, so it belongs to who they are rather than to what they
                cost. Only when editing — adding ends *in* the face dialog
                instead (see handleSubmit), because a face needs an id, and a
                field offered before there is one is a button that appears to do
                nothing. */}
            {isEditing ? (
              <FaceField
                disabled={isPending}
                hasFace={hasFace}
                messages={messages}
                onHasFace={setHasFace}
                onPhoto={setPhoto}
                onRemove={handleRemoveFace}
                personId={worker?.id ?? null}
                personType="worker"
                photo={photo}
              />
            ) : null}

            <Field>
              <FieldLabel>{messages["workers.payType"]}</FieldLabel>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {(["monthly", "hourly"] as WorkerSalaryType[]).map((type) => {
                  const active = salaryType === type;

                  return (
                    <Button
                      aria-checked={active}
                      className={cn(active && SELECTED_FILL)}
                      disabled={isPending}
                      key={type}
                      onClick={() => setSalaryType(type)}
                      role="radio"
                      type="button"
                      variant="outline"
                    >
                      {type === "monthly"
                        ? messages["workers.payMonthly"]
                        : messages["workers.payHourly"]}
                    </Button>
                  );
                })}
              </div>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="worker-salary">{salaryLabel}</FieldLabel>
                <Input
                  defaultValue={
                    worker
                      ? String(Math.round(Number(worker.salaryAmount)))
                      : ""
                  }
                  disabled={isPending}
                  id="worker-salary"
                  inputMode="decimal"
                  name="salaryAmount"
                  placeholder="0"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="worker-hired">
                  {messages["workers.hireDate"]}
                </FieldLabel>
                <DatePicker
                  defaultValue={worker?.hiredAt?.slice(0, 10) ?? ""}
                  disabled={isPending}
                  id="worker-hired"
                  name="hiredAt"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="worker-shift-start">
                  {messages["workers.shiftStart"]}
                </FieldLabel>
                <TimePicker
                  defaultValue={worker?.shiftStart ?? "09:00"}
                  disabled={isPending}
                  id="worker-shift-start"
                  name="shiftStart"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="worker-shift-end">
                  {messages["workers.shiftEnd"]}
                </FieldLabel>
                <TimePicker
                  defaultValue={worker?.shiftEnd ?? "18:00"}
                  disabled={isPending}
                  id="worker-shift-end"
                  name="shiftEnd"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>{messages["workers.workingDays"]}</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(({ day, labelKey }) => {
                  const active = days.has(day);

                  return (
                    <Button
                      aria-checked={active}
                      aria-label={messages[labelKey]}
                      className={cn("min-w-14", active && SELECTED_FILL)}
                      disabled={isPending}
                      key={day}
                      onClick={() => toggleDay(day)}
                      role="checkbox"
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {messages[labelKey]}
                    </Button>
                  );
                })}
              </div>
            </Field>

            {formError ? (
              <FieldError role="alert">{formError}</FieldError>
            ) : null}
          </div>

          <SheetFooter className="flex-row gap-3">
            <Button
              className="flex-1"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {messages["common.cancel"]}
            </Button>
            <Button className="flex-1" disabled={isPending} type="submit">
              {isPending ? <Spinner /> : null}
              {/* "Continue", not "Add": hiring saves and then goes on to the
                  face step, and a button should say where it leads. */}
              {isEditing
                ? messages["common.save"]
                : messages["workers.continue"]}
            </Button>
          </SheetFooter>
        </form>

        {/* Raised after a hire, against the id that create just minted. */}
        <FaceDialog
          messages={messages}
          onDone={setHasFace}
          onOpenChange={(next) => {
            setIsFaceOpen(next);

            // Closing it — by Skip, by Done, or by Escape — closes the sheet:
            // the worker is already hired, so there is nothing left to do here.
            if (!next) {
              onOpenChange(false);
            }
          }}
          onPhotoPicked={setPhoto}
          open={isFaceOpen}
          personId={createdId}
          personType="worker"
        />
      </SheetContent>
    </Sheet>
  );
};
