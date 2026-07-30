import { Button } from "@repo/design-system/components/ui/button";
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
import { SELECTED_TINT } from "@repo/design-system/lib/selected";
import { cn } from "@repo/design-system/lib/utils";
import {
  BanknoteIcon,
  ClockIcon,
  CreditCardIcon,
  type LucideIcon,
  SlashIcon,
  UserPlusIcon,
} from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { DateField } from "@/components/date-field";
import { FaceDialog } from "@/components/face-dialog";
import { FaceField } from "@/components/face-field";
import { MoneyInput } from "@/components/money-input";
import { removeFace, setFace } from "@/lib/face/api";
import { formatMoney } from "@/lib/format";
import type { Messages } from "@/lib/i18n/dictionary";
import { formatAmountInput } from "@/lib/money";
import { type MemberInput, useCreateMember, useUpdateMember } from "../api";
import {
  canTypeAmount,
  firstLeg,
  isFinalLeg,
  type MemberGender,
  type MemberListItem,
  needsTill,
  type PaymentLeg,
  type PaymentType,
  type PlanOption,
  settlementOf,
  type Till,
  todayIso,
  toPayments,
  visibleLegCount,
  withLeg,
} from "../types";

/** The "no plan chosen" sentinel: Radix reserves "" for "nothing selected". */
export const NO_PLAN = "__none__";

interface MemberSheetProperties {
  member?: MemberListItem | null;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  plans: readonly PlanOption[];
}

interface FieldErrors {
  fullname?: string;
  phone?: string;
}

const validate = (fullname: string, phone: string): FieldErrors => {
  const errors: FieldErrors = {};

  if (fullname.trim().length === 0) {
    errors.fullname = "Required";
  }

  if (phone.replace(/\D/g, "").length === 0) {
    errors.phone = "Required";
  }

  return errors;
};

const PAYMENT_OPTIONS: readonly {
  icon: LucideIcon;
  labelKey: keyof Messages;
  value: PaymentType;
}[] = [
  { value: "cash", labelKey: "members.paymentCash", icon: BanknoteIcon },
  { value: "card", labelKey: "members.paymentCard", icon: CreditCardIcon },
  { value: "debt", labelKey: "members.paymentDebt", icon: ClockIcon },
  { value: "free", labelKey: "members.paymentFree", icon: SlashIcon },
];

/** Where a part payment against a qarz landed. Only real drawers, by definition. */
const TILL_OPTIONS: readonly {
  icon: LucideIcon;
  labelKey: keyof Messages;
  value: Till;
}[] = [
  { value: "cash", labelKey: "members.paymentCash", icon: BanknoteIcon },
  { value: "card", labelKey: "members.paymentCard", icon: CreditCardIcon },
];

/**
 * Whether this leg's amount is settled by where it sits rather than by typing.
 *
 * The third and last takes whatever is left: there is no fourth row to carry a
 * shortfall, so letting the desk enter less would offer to leave money
 * somewhere that does not exist. A qarz there is the tail of the sale, not a
 * payment, so it keeps its empty box.
 */
const isFixedLeg = (index: number, leg: PaymentLeg): boolean =>
  isFinalLeg(index) && leg.method !== "debt" && canTypeAmount(leg.method);

const legAmountValue = (
  index: number,
  leg: PaymentLeg,
  outstanding: number
): string => {
  if (isFixedLeg(index, leg)) {
    return Math.max(outstanding, 0).toFixed(2);
  }

  return canTypeAmount(leg.method) ? leg.amount : "";
};

/**
 * Four big tiles rather than a dropdown — this is the most-tapped control.
 *
 * Drawn once per leg, because the remainder of a sale can end any way a whole
 * one can: taken now by a second method, left on the member's balance, or
 * discounted away.
 */
const PaymentPicker = ({
  disabled,
  messages,
  onChange,
  value,
}: {
  disabled: boolean;
  messages: Messages;
  onChange: (next: PaymentType) => void;
  value: PaymentType;
}) => (
  <Field>
    <FieldLabel>{messages["members.fieldPaymentType"]}</FieldLabel>
    <div
      aria-label={messages["members.fieldPaymentType"]}
      className="grid grid-cols-2 gap-3"
      role="radiogroup"
    >
      {PAYMENT_OPTIONS.map((option) => {
        const active = value === option.value;

        return (
          <Button
            aria-checked={active}
            className={cn("h-20 flex-col gap-1.5", active && SELECTED_TINT)}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
            variant="outline"
          >
            <option.icon className="size-6" />
            {messages[option.labelKey]}
          </Button>
        );
      })}
    </div>
  </Field>
);

/** Who the person is. No section heading — the sheet title already says it. */
const PersonFields = ({
  disabled,
  errors,
  gender,
  member,
  messages,
  onGender,
}: {
  disabled: boolean;
  errors: FieldErrors;
  gender: MemberGender;
  member?: MemberListItem | null;
  messages: Messages;
  onGender: (next: MemberGender) => void;
}) => (
  <>
    <Field data-invalid={Boolean(errors.fullname) || undefined}>
      <FieldLabel htmlFor="member-name">
        <span className="text-destructive">*</span>{" "}
        {messages["members.fieldName"]}
      </FieldLabel>
      <Input
        aria-invalid={Boolean(errors.fullname)}
        defaultValue={member?.name ?? ""}
        disabled={disabled}
        id="member-name"
        name="fullname"
      />
      {errors.fullname ? <FieldError>{errors.fullname}</FieldError> : null}
    </Field>

    <div className="grid gap-3 sm:grid-cols-2">
      <Field data-invalid={Boolean(errors.phone) || undefined}>
        <FieldLabel htmlFor="member-phone">
          <span className="text-destructive">*</span>{" "}
          {messages["members.fieldPhone"]}
        </FieldLabel>
        <Input
          aria-invalid={Boolean(errors.phone)}
          defaultValue={member?.phone ?? ""}
          disabled={disabled}
          id="member-phone"
          inputMode="tel"
          name="phone"
        />
        {errors.phone ? <FieldError>{errors.phone}</FieldError> : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="member-gender">
          {messages["members.fieldGender"]}
        </FieldLabel>
        <Select
          disabled={disabled}
          onValueChange={(next) => onGender(next as MemberGender)}
          value={gender}
        >
          <SelectTrigger className="w-full" id="member-gender">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="male">
                {messages["members.genderMale"]}
              </SelectItem>
              <SelectItem value="female">
                {messages["members.genderFemale"]}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </div>

    <Field>
      <FieldLabel htmlFor="member-birthdate">
        {messages["members.fieldBirthdate"]}
      </FieldLabel>
      <DateField
        defaultValue={member?.birthdate?.slice(0, 10) ?? ""}
        disabled={disabled}
        id="member-birthdate"
        name="birthdate"
      />
    </Field>

    <Field>
      <FieldLabel htmlFor="member-note">
        {messages["members.fieldNote"]}
      </FieldLabel>
      <Textarea
        disabled={disabled}
        id="member-note"
        name="note"
        placeholder={messages["members.notePlaceholder"]}
        rows={3}
      />
    </Field>
  </>
);

/** What the money adds up to. Recomputed as the operator types. */
const PaymentSummary = ({
  debt,
  messages,
  paid,
  total,
}: {
  debt: number;
  messages: Messages;
  paid: number;
  total: number;
}) => (
  <dl className="flex flex-col gap-1 rounded-xl bg-muted p-4">
    <div className="flex justify-between">
      <dt className="text-muted-foreground">
        {messages["members.totalLabel"]}
      </dt>
      <dd className="font-semibold">{formatMoney(total.toFixed(2))}</dd>
    </div>
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{messages["members.paidLabel"]}</dt>
      <dd className="font-semibold">{formatMoney(paid.toFixed(2))}</dd>
    </div>
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{messages["members.debtLabel"]}</dt>
      <dd className={cn("font-semibold", debt > 0 && "text-destructive")}>
        {formatMoney(debt.toFixed(2))}
      </dd>
    </div>
  </dl>
);

export interface MembershipSectionProperties {
  /** What each leg covers, in order — the placeholders are read off this. */
  applied: readonly number[];
  debt: number;
  disabled: boolean;
  /** How the sale is being settled, in order. Grows as the desk splits it. */
  legs: readonly PaymentLeg[];
  messages: Messages;
  onLegAmount: (index: number, next: string) => void;
  onLegMethod: (index: number, next: PaymentType) => void;
  onLegTill: (index: number, next: Till) => void;
  onPlan: (next: string) => void;
  onStartsAt: (next: string) => void;
  paid: number;
  planId: string;
  plans: readonly PlanOption[];
  /** How many legs to draw — one more than filled, while something is short. */
  shown: number;
  startsAt: string;
  total: number;
}

/** The plan being sold and how it is being paid for. */
export const MembershipSection = ({
  applied,
  debt,
  disabled,
  legs,
  messages,
  onLegAmount,
  onLegMethod,
  onLegTill,
  onPlan,
  onStartsAt,
  paid,
  planId,
  plans,
  shown,
  startsAt,
  total,
}: MembershipSectionProperties) => (
  <>
    <h3 className="pt-2 font-semibold text-lg">
      {messages["members.sectionMembership"]}
    </h3>

    <div className="grid gap-3 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="member-plan">
          {messages["members.fieldPlan"]}
        </FieldLabel>
        <Select disabled={disabled} onValueChange={onPlan} value={planId}>
          <SelectTrigger className="w-full" id="member-plan">
            <SelectValue placeholder={messages["members.planPlaceholder"]} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NO_PLAN}>{messages["common.none"]}</SelectItem>
              {plans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="member-start">
          {messages["members.fieldStartDate"]}
        </FieldLabel>
        <DateField
          disabled={disabled || planId === NO_PLAN}
          id="member-start"
          onChange={onStartsAt}
          value={startsAt}
        />
      </Field>
    </div>

    {/* Nothing is being sold until a plan is picked, so there is nothing to
        pay for either. */}
    {planId === NO_PLAN ? null : (
      <>
        <h3 className="pt-2 font-semibold text-lg">
          {messages["members.sectionPayment"]}
        </h3>

        {/* One block per leg. The second appears the moment the first is
            short, the third the moment the second is — each a full set of tiles
            and its own amount, because a split is just this sale being rung up
            again for what is left of it. */}
        {Array.from({ length: shown }, (_, index) => {
          const leg = legs[index] ?? { amount: "", method: "cash" };
          // What is still unpaid when this leg is reached — its own share
          // included, so typing in it does not move its own placeholder.
          const outstanding =
            total -
            applied.slice(0, index).reduce((sum, value) => sum + value, 0);

          return (
            <div
              className="flex flex-col gap-3"
              // Positional on purpose: a leg *is* its position in the chain,
              // and nothing is ever inserted or reordered.
              // biome-ignore lint/suspicious/noArrayIndexKey: legs are positional
              key={index}
            >
              {index > 0 ? (
                <p className="text-muted-foreground text-sm uppercase tracking-wide">
                  {messages["members.remainderType"]}
                </p>
              ) : null}

              <PaymentPicker
                disabled={disabled}
                messages={messages}
                onChange={(next) => onLegMethod(index, next)}
                value={leg.method}
              />

              <Field>
                <FieldLabel htmlFor={`member-paid-${index}`}>
                  {messages["members.fieldPaidAmount"]}
                </FieldLabel>
                {/* The final leg shows the rest as a fact rather than a field:
                    there is no fourth row to carry a shortfall, so it takes
                    whatever is left and only its method is a choice. */}
                <MoneyInput
                  className={cn(
                    isFixedLeg(index, leg) && "text-muted-foreground"
                  )}
                  disabled={disabled || !canTypeAmount(leg.method)}
                  id={`member-paid-${index}`}
                  onChange={(next) => onLegAmount(index, next)}
                  placeholder={
                    // A qarz's blank box takes nothing; a till's takes the rest.
                    canTypeAmount(leg.method) && leg.method !== "debt"
                      ? formatAmountInput(String(Math.round(outstanding)))
                      : "0"
                  }
                  readOnly={isFixedLeg(index, leg)}
                  value={legAmountValue(index, leg, outstanding)}
                />
              </Field>

              {/* A qarz names no drawer, so a part payment against one has to
                  say where it went — otherwise the member's debt comes out
                  right while the cashbox is quietly short. */}
              {needsTill(leg, index) ? (
                <Field>
                  <FieldLabel htmlFor={`member-till-${index}`}>
                    {messages["members.receivedAs"]}
                  </FieldLabel>
                  <div
                    aria-label={messages["members.receivedAs"]}
                    className="grid grid-cols-2 gap-3"
                    id={`member-till-${index}`}
                    role="radiogroup"
                  >
                    {TILL_OPTIONS.map((option) => {
                      const active = (leg.till ?? "cash") === option.value;

                      return (
                        <Button
                          aria-checked={active}
                          className={cn(active && SELECTED_TINT)}
                          disabled={disabled}
                          key={option.value}
                          onClick={() => onLegTill(index, option.value)}
                          role="radio"
                          type="button"
                          variant="outline"
                        >
                          <option.icon className="size-5" />
                          {messages[option.labelKey]}
                        </Button>
                      );
                    })}
                  </div>
                </Field>
              ) : null}
            </div>
          );
        })}

        <PaymentSummary
          debt={debt}
          messages={messages}
          paid={paid}
          total={total}
        />
      </>
    )}
  </>
);

export const MemberSheet = ({
  member,
  messages,
  onOpenChange,
  open,
  plans,
}: MemberSheetProperties) => {
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, setIsPending] = useState(false);
  /**
   * A photo picked before the member existed. On an edit the dialog uploads it
   * itself; on a create there is nothing to attach it to until the save, so it
   * waits here.
   */
  const [photo, setPhoto] = useState<string | null>(null);
  const [hasFace, setHasFace] = useState(member?.hasFace ?? false);
  /** The id a create just minted — what the face dialog then enrols against. */
  const [createdId, setCreatedId] = useState<string | null>(null);

  const createMember = useCreateMember();
  const updateMember = useUpdateMember();
  const [isFaceOpen, setIsFaceOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [gender, setGender] = useState<MemberGender>(
    member?.gender === "female" ? "female" : "male"
  );
  const [planId, setPlanId] = useState(NO_PLAN);
  const [startsAt, setStartsAt] = useState(todayIso);
  /**
   * How the sale is settled, in order. One leg is the ordinary sale — cash,
   * blank box, the whole price. A second and third appear only as the desk
   * splits it, and are dropped again the moment they stop being needed.
   */
  const [legs, setLegs] = useState<PaymentLeg[]>(firstLeg);

  const isEditing = Boolean(member);
  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null;
  const listPrice = Number(selectedPlan?.price ?? 0);

  const { applied, debt, paid, total } = settlementOf(listPrice, legs);
  const shown = visibleLegCount(listPrice, legs);

  const handlePlanChange = (next: string) => {
    setPlanId(next);
    // Amounts are relative to a price that has just changed, so a figure typed
    // against the old one would silently mean something else. A blank box is
    // "the whole price", which is what picking a plan usually means anyway.
    setLegs(firstLeg);
  };

  const patchLeg = (index: number, patch: Partial<PaymentLeg>) => {
    setLegs((current) => withLeg(listPrice, current, index, patch));
  };

  /**
   * Writes the person, and hands back the id the face step needs. Editing
   * already knows it; creating only learns it from the response, which is why
   * the two branches cannot simply share a call.
   */
  const savePerson = async (
    person: Omit<MemberInput, "membership">
  ): Promise<{ error?: string; memberId: string | null; ok: boolean }> => {
    // `createdId` is set when the face dialog saved a brand-new member early:
    // from then on this sheet is editing, whatever it was opened as. Without it
    // a second submit would register the same person twice.
    const existingId = member?.id ?? createdId;

    /*
     * `mutateAsync` rather than `mutate`, because this is the one place the
     * caller genuinely needs to wait: the face step runs afterwards and needs
     * the id a create only learns from the response. The {ok, error} shape is
     * kept because the face flow branches on it.
     */
    try {
      if (existingId) {
        await updateMember.mutateAsync({ input: person, memberId: existingId });

        return { memberId: existingId, ok: true };
      }

      const created = await createMember.mutateAsync({
        ...person,
        membership:
          planId === NO_PLAN
            ? null
            : {
                planId,
                startsAt,
                // Only the legs on screen, flattened into what the ledger
                // records: a qarz carrying a part payment becomes that payment
                // plus the balance behind it.
                payments: toPayments(legs.slice(0, shown)),
              },
      });

      setCreatedId(created.id);

      return { memberId: created.id, ok: true };
    } catch (cause) {
      return {
        error: (cause as Error).message,
        memberId: existingId ?? null,
        ok: false,
      };
    }
  };

  /**
   * Applies whatever the face field asked for, once the member exists to apply
   * it to.
   *
   * It runs after the person is written, never with them: it needs an id that on
   * a create does not exist until the save returns, and it talks to hardware
   * over the LAN — a terminal that is unplugged must not undo a registration
   * that already succeeded. A failure here is reported against the face; the
   * person is registered either way.
   */
  const saveFace = async (
    memberId: string | null
  ): Promise<{ error?: string; ok: boolean }> => {
    if (!(photo && memberId)) {
      return { ok: true };
    }

    return await setFace("member", memberId, photo);
  };

  /**
   * Validates and writes the person, reading the form through a ref rather than
   * a submit event — the face dialog needs to save a brand-new member before it
   * can register them on a terminal, and it has no event to hand over.
   */
  const submitPerson = async (): Promise<{
    error?: string;
    memberId: string | null;
    ok: boolean;
  }> => {
    const form = formRef.current;

    if (!form) {
      return { memberId: null, ok: false };
    }

    const data = new FormData(form);
    const fullname = String(data.get("fullname") ?? "");
    const phone = String(data.get("phone") ?? "");

    const errors = validate(fullname, phone);

    setFieldErrors(errors);
    setFormError(null);

    if (Object.keys(errors).length > 0) {
      return { memberId: null, ok: false };
    }

    return await savePerson({
      birthdate: String(data.get("birthdate") ?? "").trim() || null,
      fullname: fullname.trim(),
      gender,
      note: String(data.get("note") ?? "").trim() || null,
      // Bare digits everywhere in this system.
      phone: phone.replace(/\D/g, ""),
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);

    const saved = await submitPerson();

    if (!saved.ok) {
      setIsPending(false);
      setFormError(saved.error ?? "Something went wrong.");
      return;
    }

    const face = await saveFace(saved.memberId);

    setIsPending(false);

    if (!face.ok) {
      setFormError(face.error ?? "Something went wrong.");
      return;
    }

    /*
     * Registering somebody ends at the terminal, not at a closed sheet: the
     * person is standing right there, which is the only moment their face is
     * easy to take. The dialog carries a Skip, so this is an offer rather than
     * a gate.
     */
    if (!isEditing && saved.memberId) {
      setIsFaceOpen(true);
      return;
    }

    onOpenChange(false);
  };

  const handleRemoveFace = async () => {
    const memberId = member?.id ?? createdId;

    if (!memberId) {
      return;
    }

    const result = await removeFace("member", memberId);

    if (result.ok) {
      setHasFace(false);
      setPhoto(null);
      return;
    }

    setFormError(result.error ?? "Something went wrong.");
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserPlusIcon className="size-5 text-primary-accent" />
            {isEditing ? messages["members.edit"] : messages["members.add"]}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {isEditing ? messages["members.edit"] : messages["members.add"]}
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={handleSubmit}
          ref={formRef}
        >
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <PersonFields
              disabled={isPending}
              errors={fieldErrors}
              gender={gender}
              member={member}
              messages={messages}
              onGender={setGender}
            />

            {/* Sits with the person, above the money: taking the photo is part
                of registering somebody, and the desk has them standing there. */}
            {/* Only when editing. Adding a member ends *in* the face dialog
                instead — see handleSubmit — because a face needs an id, and a
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
                personId={member?.id ?? null}
                personType="member"
                photo={photo}
              />
            ) : null}

            {/* Selling a membership belongs to creating a person, not to
                editing one — changing a name must not re-charge anybody. */}
            {isEditing ? null : (
              <MembershipSection
                applied={applied}
                debt={debt}
                disabled={isPending}
                legs={legs}
                messages={messages}
                onLegAmount={(index, next) => patchLeg(index, { amount: next })}
                onLegMethod={(index, next) => patchLeg(index, { method: next })}
                onLegTill={(index, next) => patchLeg(index, { till: next })}
                onPlan={handlePlanChange}
                onStartsAt={setStartsAt}
                paid={paid}
                planId={planId}
                plans={plans}
                shown={shown}
                startsAt={startsAt}
                total={total}
              />
            )}

            {formError ? (
              <FieldError role="alert">{formError}</FieldError>
            ) : null}
          </div>

          <SheetFooter>
            <Button
              className="w-full"
              disabled={isPending}
              size="lg"
              type="submit"
            >
              {isPending ? <Spinner /> : null}
              {/* "Continue", not "Add": registering saves and then goes on to
                  the face step, and a button should say where it leads. */}
              {isEditing
                ? messages["common.save"]
                : messages["members.continue"]}
            </Button>
          </SheetFooter>
        </form>

        {/* Raised after a create, against the id that create just minted. */}
        <FaceDialog
          messages={messages}
          onDone={setHasFace}
          onOpenChange={(next) => {
            setIsFaceOpen(next);

            // Closing it — by Skip, by Done, or by Escape — closes the sheet:
            // the member is already saved, so there is nothing left to do here.
            if (!next) {
              onOpenChange(false);
            }
          }}
          onPhotoPicked={setPhoto}
          open={isFaceOpen}
          personId={createdId}
          personType="member"
        />
      </SheetContent>
    </Sheet>
  );
};
