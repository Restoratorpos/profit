"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
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
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { cn } from "@repo/design-system/lib/utils";
import { TagIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { MessageKey, Messages } from "@/lib/i18n/dictionary";
import {
  type BillingType,
  HOURS,
  MINUTES,
  type NamedOption,
  type PlanListItem,
  splitTime,
  WEEKDAYS,
} from "@/lib/plans";
import { CreatableCombobox } from "../../products/components/creatable-combobox";
import {
  createHallAction,
  createPlanAction,
  type PlanInput,
  updatePlanAction,
} from "../actions";

const NO_TRAINER = "__none__";

interface PlanSheetProperties {
  halls: readonly NamedOption[];
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  plan?: PlanListItem | null;
  trainers: readonly NamedOption[];
}

interface FieldErrors {
  duration?: string;
  name?: string;
  price?: string;
}

const validate = (
  name: string,
  price: string,
  duration: string
): FieldErrors => {
  const errors: FieldErrors = {};

  if (name.trim().length === 0) {
    errors.name = "Required";
  }

  if (price.trim().length === 0 || Number.isNaN(Number(price))) {
    errors.price = "Required";
  }

  const days = Number(duration);

  if (!Number.isInteger(days) || days < 1) {
    errors.duration = "Required";
  }

  return errors;
};

interface FormState {
  allBranches: boolean;
  billingType: BillingType;
  branchId: string | null;
  from: string;
  hallId: string | null;
  isActive: boolean;
  slots: number | null;
  to: string;
  trainerId: string;
  weekdays: number[];
}

/** Kept out of the component so submitting stays a flat read-and-send. */
const buildPayload = (data: FormData, state: FormState): PlanInput => {
  return {
    name: String(data.get("name") ?? "").trim(),
    billingType: state.billingType,
    price: String(data.get("price") ?? "").replace(/\s/g, ""),
    duration: Number(String(data.get("duration") ?? "")),
    entryLimit: Number(String(data.get("entryLimit") ?? "0")) || 0,
    accessFrom: state.from,
    accessTo: state.to,
    // No days still means no entry — deselecting every day is how that is set.
    weekdays: state.weekdays,
    trainerId: state.trainerId === NO_TRAINER ? null : state.trainerId,
    hallId: state.hallId,
    slots: state.slots,
    description: String(data.get("description") ?? "").trim() || null,
    branchId: state.allBranches ? null : state.branchId,
    isActive: state.isActive,
  };
};

/** A time control is two selects; this keeps the pair together. */
const TimeSelect = ({
  disabled,
  hour,
  label,
  minute,
  onHour,
  onMinute,
}: {
  disabled: boolean;
  hour: string;
  label: string;
  minute: string;
  onHour: (value: string) => void;
  onMinute: (value: string) => void;
}) => (
  <Field>
    <FieldLabel>{label}</FieldLabel>
    <div className="flex items-center gap-1">
      <Select disabled={disabled} onValueChange={onHour} value={hour}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {HOURS.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select disabled={disabled} onValueChange={onMinute} value={minute}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {MINUTES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  </Field>
);

const BillingToggle = ({
  disabled,
  messages,
  onChange,
  value,
}: {
  disabled: boolean;
  messages: Messages;
  onChange: (next: BillingType) => void;
  value: BillingType;
}) => (
  <Field>
    <FieldLabel>{messages["plans.fieldBilling"]}</FieldLabel>
    <div
      aria-label={messages["plans.fieldBilling"]}
      className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      role="radiogroup"
    >
      {(
        [
          ["recurring", messages["plans.billingRecurring"]],
          ["one_time", messages["plans.billingOneTime"]],
        ] as const
      ).map(([option, label]) => {
        const active = value === option;

        return (
          <Button
            aria-checked={active}
            className={cn(
              "h-8 font-medium",
              !active && "text-muted-foreground hover:bg-background/60"
            )}
            disabled={disabled}
            key={option}
            onClick={() => onChange(option)}
            role="radio"
            type="button"
            variant={active ? "default" : "ghost"}
          >
            {label}
          </Button>
        );
      })}
    </div>
  </Field>
);

/** What the plan costs and how long it runs — the two required numbers. */
const PricingFields = ({
  billingType,
  disabled,
  duration,
  errors,
  messages,
  price,
}: {
  billingType: BillingType;
  disabled: boolean;
  duration: number | null;
  errors: FieldErrors;
  messages: Messages;
  price: string | null;
}) => (
  <div className="grid grid-cols-2 gap-3">
    <Field data-invalid={Boolean(errors.price) || undefined}>
      <FieldLabel htmlFor="plan-price">
        {billingType === "recurring"
          ? messages["plans.fieldAmountRecurring"]
          : messages["plans.fieldAmountOneTime"]}
      </FieldLabel>
      <Input
        aria-invalid={Boolean(errors.price)}
        defaultValue={price ?? ""}
        disabled={disabled}
        id="plan-price"
        inputMode="decimal"
        name="price"
        placeholder="0"
      />
      {errors.price ? <FieldError>{errors.price}</FieldError> : null}
    </Field>

    <Field data-invalid={Boolean(errors.duration) || undefined}>
      <FieldLabel htmlFor="plan-duration">
        {messages["plans.fieldDuration"]}
      </FieldLabel>
      <Input
        aria-invalid={Boolean(errors.duration)}
        defaultValue={duration?.toString() ?? "30"}
        disabled={disabled}
        id="plan-duration"
        inputMode="numeric"
        name="duration"
      />
      {errors.duration ? <FieldError>{errors.duration}</FieldError> : null}
    </Field>
  </div>
);

/** Who runs the plan and where — the trainer and the hall, side by side. */
const ResourceFields = ({
  disabled,
  hallId,
  halls,
  messages,
  onHall,
  onTrainer,
  trainerId,
  trainers,
}: {
  disabled: boolean;
  hallId: string | null;
  halls: readonly NamedOption[];
  messages: Messages;
  onHall: (value: string | null) => void;
  onTrainer: (value: string) => void;
  trainerId: string;
  trainers: readonly NamedOption[];
}) => (
  <div className="grid grid-cols-2 gap-3">
    <Field>
      <FieldLabel htmlFor="plan-trainer">
        {messages["plans.fieldTrainer"]}
      </FieldLabel>
      <Select disabled={disabled} onValueChange={onTrainer} value={trainerId}>
        <SelectTrigger className="w-full" id="plan-trainer">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={NO_TRAINER}>
              {messages["common.none"]}
            </SelectItem>
            {trainers.map((trainer) => (
              <SelectItem key={trainer.id} value={trainer.id}>
                {trainer.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>

    <Field>
      <FieldLabel htmlFor="plan-hall">{messages["plans.fieldHall"]}</FieldLabel>
      <CreatableCombobox
        emptyLabel={messages["common.none"]}
        id="plan-hall"
        onCreate={async (label) => {
          const result = await createHallAction(label);

          return { error: result.error, value: result.hall?.id };
        }}
        onSelect={onHall}
        options={halls.map((hall) => ({
          label: hall.name,
          value: hall.id,
        }))}
        placeholder={messages["plans.hallPlaceholder"]}
        searchPlaceholder={messages["products.searchOrCreate"]}
        value={hallId}
      />
    </Field>
  </div>
);

interface AccessFieldsProperties {
  disabled: boolean;
  entryLimit: number;
  from: [string, string];
  messages: Messages;
  onFrom: (hour: string, minute: string) => void;
  onTo: (hour: string, minute: string) => void;
  onToggleDay: (day: number) => void;
  to: [string, string];
  weekdays: number[];
}

/** Everything that only matters when the plan actually grants gym entry. */
const AccessFields = ({
  disabled,
  entryLimit,
  from,
  messages,
  onFrom,
  onTo,
  onToggleDay,
  to,
  weekdays,
}: AccessFieldsProperties) => (
  <>
    <Field>
      <FieldLabel htmlFor="plan-entry-limit">
        {messages["plans.fieldEntryLimit"]}
      </FieldLabel>
      <Input
        defaultValue={entryLimit.toString()}
        disabled={disabled}
        id="plan-entry-limit"
        inputMode="numeric"
        name="entryLimit"
      />
    </Field>

    <div className="grid grid-cols-2 gap-3">
      <TimeSelect
        disabled={disabled}
        hour={from[0]}
        label={messages["plans.fieldAccessFrom"]}
        minute={from[1]}
        onHour={(value) => onFrom(value, from[1])}
        onMinute={(value) => onFrom(from[0], value)}
      />
      <TimeSelect
        disabled={disabled}
        hour={to[0]}
        label={messages["plans.fieldAccessTo"]}
        minute={to[1]}
        onHour={(value) => onTo(value, to[1])}
        onMinute={(value) => onTo(to[0], value)}
      />
    </div>

    <Field>
      <FieldLabel>{messages["plans.fieldWeekdays"]}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((day) => {
          const on = weekdays.includes(day);

          return (
            <Button
              aria-pressed={on}
              className={cn(
                "h-8 rounded-full px-4",
                !on && "text-muted-foreground"
              )}
              disabled={disabled}
              key={day}
              onClick={() => onToggleDay(day)}
              size="sm"
              type="button"
              variant={on ? "default" : "outline"}
            >
              {messages[`plans.day${day}` as MessageKey]}
            </Button>
          );
        })}
      </div>
    </Field>
  </>
);

export const PlanSheet = ({
  halls,
  messages,
  onOpenChange,
  open,
  plan,
  trainers,
}: PlanSheetProperties) => {
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, setIsPending] = useState(false);

  const [billingType, setBillingType] = useState<BillingType>(
    plan?.billingType === "one_time" ? "one_time" : "recurring"
  );
  const [weekdays, setWeekdays] = useState<number[]>(
    plan && plan.weekdays.length > 0 ? plan.weekdays : [...WEEKDAYS]
  );
  const [fromHour, setFromHour] = useState(
    () => splitTime(plan?.accessFrom ?? null, "00:00")[0]
  );
  const [fromMinute, setFromMinute] = useState(
    () => splitTime(plan?.accessFrom ?? null, "00:00")[1]
  );
  const [toHour, setToHour] = useState(
    () => splitTime(plan?.accessTo ?? null, "23:45")[0]
  );
  const [toMinute, setToMinute] = useState(
    () => splitTime(plan?.accessTo ?? null, "23:45")[1]
  );
  const [trainerId, setTrainerId] = useState(plan?.trainerId ?? NO_TRAINER);
  const [hallId, setHallId] = useState<string | null>(plan?.hallId ?? null);
  const [allBranches, setAllBranches] = useState(plan ? !plan.branchId : true);
  // Neither is edited in this form any more — activation is toggled from the
  // table and capacity is not exposed — so a save carries the current values
  // through rather than clearing them.
  const isActive = plan?.isActive ?? true;
  const slots = plan?.slots ?? null;

  const toggleDay = (day: number) => {
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((entry) => entry !== day)
        : [...current, day].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    const errors = validate(
      String(data.get("name") ?? ""),
      String(data.get("price") ?? ""),
      String(data.get("duration") ?? "")
    );

    setFieldErrors(errors);
    setFormError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsPending(true);

    const payload = buildPayload(data, {
      allBranches,
      billingType,
      branchId: plan?.branchId ?? null,
      from: `${fromHour}:${fromMinute}`,
      hallId,
      isActive,
      slots,
      to: `${toHour}:${toMinute}`,
      trainerId,
      weekdays,
    });

    const result = plan
      ? await updatePlanAction(plan.id, payload)
      : await createPlanAction(payload);

    setIsPending(false);

    if (result.ok) {
      onOpenChange(false);
      return;
    }

    setFormError(result.error ?? "Something went wrong.");
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <TagIcon className="size-4 text-primary-accent" />
            {plan ? messages["plans.edit"] : messages["plans.new"]}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {plan ? messages["plans.edit"] : messages["plans.new"]}
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <Field data-invalid={Boolean(fieldErrors.name) || undefined}>
              <FieldLabel htmlFor="plan-name">
                <span className="text-destructive">*</span>{" "}
                {messages["plans.fieldName"]}
              </FieldLabel>
              <Input
                aria-invalid={Boolean(fieldErrors.name)}
                defaultValue={plan?.name ?? ""}
                disabled={isPending}
                id="plan-name"
                name="name"
                placeholder={messages["plans.namePlaceholder"]}
              />
              {fieldErrors.name ? (
                <FieldError>{fieldErrors.name}</FieldError>
              ) : null}
            </Field>

            <BillingToggle
              disabled={isPending}
              messages={messages}
              onChange={setBillingType}
              value={billingType}
            />

            <PricingFields
              billingType={billingType}
              disabled={isPending}
              duration={plan?.duration ?? null}
              errors={fieldErrors}
              messages={messages}
              price={plan?.price ?? null}
            />

            <AccessFields
              disabled={isPending}
              entryLimit={plan?.entryLimit ?? 0}
              from={[fromHour, fromMinute]}
              messages={messages}
              onFrom={(hour, minute) => {
                setFromHour(hour);
                setFromMinute(minute);
              }}
              onTo={(hour, minute) => {
                setToHour(hour);
                setToMinute(minute);
              }}
              onToggleDay={toggleDay}
              to={[toHour, toMinute]}
              weekdays={weekdays}
            />

            <ResourceFields
              disabled={isPending}
              hallId={hallId}
              halls={halls}
              messages={messages}
              onHall={setHallId}
              onTrainer={setTrainerId}
              trainerId={trainerId}
              trainers={trainers}
            />

            <Field>
              <FieldLabel htmlFor="plan-description">
                {messages["plans.fieldNotes"]}
              </FieldLabel>
              <Textarea
                defaultValue={plan?.description ?? ""}
                disabled={isPending}
                id="plan-description"
                name="description"
                placeholder={messages["plans.notesPlaceholder"]}
                rows={3}
              />
            </Field>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={allBranches}
                disabled={isPending}
                id="plan-all-branches"
                onCheckedChange={(next) => setAllBranches(next === true)}
              />
              <FieldLabel className="font-normal" htmlFor="plan-all-branches">
                {messages["plans.allBranches"]}
              </FieldLabel>
            </div>

            {formError ? (
              <FieldError role="alert">{formError}</FieldError>
            ) : null}
          </div>

          <SheetFooter className="gap-3">
            <Button className="w-full" disabled={isPending} type="submit">
              {isPending ? <Spinner /> : null}
              {plan ? messages["common.save"] : messages["plans.create"]}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
