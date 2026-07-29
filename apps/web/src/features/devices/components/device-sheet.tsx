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
import { Switch } from "@repo/design-system/components/ui/switch";
import { type FormEvent, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionary";
import { useSaveDevice } from "../api";
import {
  DEVICE_DIRECTIONS,
  type DeviceDirection,
  type DeviceView,
  directionLabel,
} from "../types";

interface DeviceSheetProperties {
  /** Present when editing; absent when adding. */
  device?: DeviceView | null;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface FieldErrors {
  ipAddress?: string;
  name?: string;
  password?: string;
  username?: string;
}

/** A labelled text box with its inline error, which this form repeats six times. */
const TextField = ({
  error,
  id,
  inputMode,
  label,
  onChange,
  placeholder,
  required,
  type,
  value,
}: {
  error?: string;
  id: string;
  inputMode?: "numeric" | "tel";
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "password";
  value: string;
}) => (
  <Field data-invalid={Boolean(error) || undefined}>
    <FieldLabel htmlFor={id}>
      {label}
      {required ? " *" : ""}
    </FieldLabel>
    <Input
      aria-invalid={Boolean(error)}
      // Browsers offer to fill and save these; a terminal's admin password is
      // not the operator's own credential and should not land in their manager.
      autoComplete={type === "password" ? "new-password" : "off"}
      id={id}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type={type}
      value={value}
    />
    {error ? <FieldError>{error}</FieldError> : null}
  </Field>
);

export const DeviceSheet = ({
  device,
  messages,
  onOpenChange,
  open,
}: DeviceSheetProperties) => {
  const isEditing = Boolean(device);

  const [name, setName] = useState(device?.name ?? "");
  const [ipAddress, setIpAddress] = useState(device?.ipAddress ?? "");
  const [port, setPort] = useState(String(device?.port ?? 80));
  const [username, setUsername] = useState(device?.username ?? "admin");
  // Never populated from the server: the stored password is write-only, so an
  // empty box on an edit means "leave it alone" rather than "clear it".
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState(device?.location ?? "");
  const [direction, setDirection] = useState<DeviceDirection>(
    (device?.direction as DeviceDirection) ?? "both"
  );
  const [isActive, setIsActive] = useState(device?.isActive ?? true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saveDevice = useSaveDevice();
  const isPending = saveDevice.isPending;

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (name.trim() === "") {
      errors.name = messages["devices.fieldName"];
    }

    if (ipAddress.trim() === "") {
      errors.ipAddress = messages["devices.fieldAddress"];
    }

    if (username.trim() === "") {
      errors.username = messages["devices.fieldUsername"];
    }

    if (!isEditing && password === "") {
      errors.password = messages["devices.fieldPassword"];
    }

    return errors;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const errors = validate();

    setFieldErrors(errors);
    setFormError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload = {
      direction,
      ipAddress: ipAddress.trim(),
      isActive,
      location: location.trim() || null,
      name: name.trim(),
      port: Number(port) || 80,
      username: username.trim(),
      ...(password === "" ? {} : { password }),
    };

    saveDevice.mutate(
      { deviceId: device?.id, input: payload },
      {
        onSuccess: () => onOpenChange(false),
        onError: (cause) => setFormError(cause.message),
      }
    );
  };

  const title = isEditing ? messages["devices.edit"] : messages["devices.add"];

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

            <TextField
              error={fieldErrors.name}
              id="device-name"
              label={messages["devices.fieldName"]}
              onChange={setName}
              required
              value={name}
            />

            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <TextField
                error={fieldErrors.ipAddress}
                id="device-ip"
                label={messages["devices.fieldAddress"]}
                onChange={setIpAddress}
                placeholder="192.168.1.64"
                required
                value={ipAddress}
              />
              <TextField
                id="device-port"
                inputMode="numeric"
                label={messages["devices.fieldPort"]}
                onChange={setPort}
                value={port}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                error={fieldErrors.username}
                id="device-username"
                label={messages["devices.fieldUsername"]}
                onChange={setUsername}
                required
                value={username}
              />
              <TextField
                error={fieldErrors.password}
                id="device-password"
                label={messages["devices.fieldPassword"]}
                onChange={setPassword}
                placeholder={isEditing ? "••••••" : undefined}
                required={!isEditing}
                type="password"
                value={password}
              />
            </div>

            {isEditing ? (
              <p className="-mt-2 text-muted-foreground text-sm">
                {messages["devices.passwordKeep"]}
              </p>
            ) : null}

            <TextField
              id="device-location"
              label={messages["devices.fieldLocation"]}
              onChange={setLocation}
              value={location}
            />

            <Field>
              <FieldLabel htmlFor="device-direction">
                {messages["devices.fieldDirection"]}
              </FieldLabel>
              <Select
                onValueChange={(next) => setDirection(next as DeviceDirection)}
                value={direction}
              >
                <SelectTrigger id="device-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DEVICE_DIRECTIONS.map((entry) => (
                      <SelectItem key={entry} value={entry}>
                        {directionLabel(entry, messages)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="device-active">
                {messages["devices.fieldActive"]}
              </FieldLabel>
              <Switch
                checked={isActive}
                id="device-active"
                onCheckedChange={setIsActive}
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
