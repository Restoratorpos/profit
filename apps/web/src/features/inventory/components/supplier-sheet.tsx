import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@repo/design-system/components/ui/field";
import { Input } from "@repo/design-system/components/ui/input";
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
import { type FormEvent, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import { useCreateSupplier, useUpdateSupplier } from "../api";
import type { SupplierSummary } from "../types";

interface SupplierSheetProperties {
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Present when editing; absent when creating. */
  supplier?: SupplierSummary | null;
}

export const SupplierSheet = ({
  messages,
  onOpenChange,
  open,
  supplier,
}: SupplierSheetProperties) => {
  /*
   * Controlled rather than uncontrolled with defaultValue: the sheet is keyed by
   * supplier id upstream, so these initialisers run once per row and the values
   * survive the disabled-while-submitting pass.
   */
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [supplierType, setSupplierType] = useState(
    supplier?.supplierType ?? ""
  );
  const [passport, setPassport] = useState(supplier?.passport ?? "");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const isPending = createSupplier.isPending || updateSupplier.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (name.trim() === "") {
      setNameError(messages["suppliers.fieldName"]);
      return;
    }

    setNameError(null);
    setFormError(null);

    const payload = {
      description: description.trim() || null,
      passport: passport.trim() || null,
      phone: phone.trim() || null,
      supplier: name.trim(),
      supplierType: supplierType.trim() || null,
    };

    const handlers = {
      onSuccess: () => onOpenChange(false),
      onError: (cause: Error) => setFormError(cause.message),
    };

    if (supplier) {
      updateSupplier.mutate(
        { input: payload, supplierId: supplier.id },
        handlers
      );

      return;
    }

    createSupplier.mutate(payload, handlers);
  };

  const title = supplier ? messages["common.edit"] : messages["suppliers.add"];

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      {/* Side panels open from the right everywhere in this app. */}
      <SheetContent className="w-full sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>

        <form className="contents" onSubmit={handleSubmit}>
          <fieldset
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4"
            disabled={isPending}
          >
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <Field data-invalid={Boolean(nameError) || undefined}>
              <FieldLabel htmlFor="supplier-name">
                {messages["suppliers.fieldName"]} *
              </FieldLabel>
              <Input
                aria-invalid={Boolean(nameError)}
                id="supplier-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
              {nameError ? <FieldError>{nameError}</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="supplier-phone">
                {messages["suppliers.fieldPhone"]}
              </FieldLabel>
              <Input
                id="supplier-phone"
                inputMode="tel"
                onChange={(event) => setPhone(event.target.value)}
                value={phone}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="supplier-type">
                  {messages["suppliers.fieldType"]}
                </FieldLabel>
                <Input
                  id="supplier-type"
                  onChange={(event) => setSupplierType(event.target.value)}
                  value={supplierType}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="supplier-passport">
                  {messages["suppliers.fieldPassport"]}
                </FieldLabel>
                <Input
                  id="supplier-passport"
                  onChange={(event) => setPassport(event.target.value)}
                  value={passport}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="supplier-description">
                {messages["suppliers.fieldDescription"]}
              </FieldLabel>
              <Textarea
                id="supplier-description"
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                value={description}
              />
            </Field>
          </fieldset>

          <SheetFooter>
            <Button disabled={isPending} type="submit">
              {isPending ? <Spinner /> : null}
              {messages["common.save"]}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {messages["common.cancel"]}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
