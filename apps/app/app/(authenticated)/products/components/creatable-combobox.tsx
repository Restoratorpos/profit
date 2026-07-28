"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/design-system/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  type LucideIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

export interface ComboboxOption {
  label: string;
  value: string;
}

interface CreatableComboboxProperties {
  /** Label for the "nothing selected" entry, e.g. "Kategoriyasiz". */
  emptyLabel: string;
  icon?: LucideIcon;
  id?: string;
  /** Omit to make the field select-only. */
  onCreate?: (label: string) => Promise<{ error?: string; value?: string }>;
  onSelect: (value: string | null) => void;
  options: readonly ComboboxOption[];
  /** Text shown on the trigger while nothing is selected. */
  placeholder: string;
  searchPlaceholder: string;
  value: string | null;
}

/**
 * Pick an existing value, clear it, or type a new one and create it without
 * leaving the form — which is the whole point: a cashier adding a product
 * should not have to abandon the form to add the category it belongs to.
 */
export const CreatableCombobox = ({
  emptyLabel,
  icon: Icon,
  id,
  onCreate,
  onSelect,
  options,
  placeholder,
  searchPlaceholder,
  value,
}: CreatableComboboxProperties) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * What was created here and is not in `options` yet. A unit is free text on
   * the product, so a new one only reaches `options` once a product carrying it
   * has been saved — never while this form is still open. Without this the
   * trigger falls back to the placeholder the moment you create something, and
   * the field reads as broken even though the value was accepted. The
   * round-trip pickers (category, hall) need it too: their list is only
   * refreshed by the server, which lands some renders later.
   */
  const [created, setCreated] = useState<readonly ComboboxOption[]>([]);

  const pending = created.filter(
    (option) => !options.some((known) => known.value === option.value)
  );
  const choices = pending.length > 0 ? [...options, ...pending] : options;

  const selected = choices.find((option) => option.value === value) ?? null;

  const trimmed = query.trim();
  const isExisting = choices.some(
    (option) => option.label.toLowerCase() === trimmed.toLowerCase()
  );
  const canCreate = Boolean(onCreate) && trimmed.length > 0 && !isExisting;

  const choose = (next: string | null) => {
    onSelect(next);
    setOpen(false);
    setQuery("");
    setError(null);
  };

  const handleCreate = async () => {
    if (!onCreate) {
      return;
    }

    setIsCreating(true);
    setError(null);

    const { error: failure, value: createdValue } = await onCreate(trimmed);

    setIsCreating(false);

    if (createdValue) {
      // Remember it before selecting it: `choose` clears the query, and the
      // typed text is the only label this value has until the parent catches up.
      setCreated((current) => [
        ...current,
        { label: trimmed, value: createdValue },
      ]);
      choose(createdValue);
      return;
    }

    setError(failure ?? "Could not create.");
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <div className="relative">
        <PopoverTrigger asChild>
          {/* Deliberately mirrors SelectTrigger class for class. This control
              and a plain Select sit side by side in the same form (trainer next
              to hall), and two pickers that do the same job must not look like
              two different widgets. */}
          <Button
            className={cn(
              "h-12 w-full justify-start gap-2 rounded-lg border-input bg-transparent py-2 pl-3.5 font-normal text-base shadow-none hover:bg-transparent dark:bg-input/30 dark:hover:bg-input/50",
              // Room for the clear button only when there is one; otherwise the
              // chevron has to land on the same edge a Select's does.
              selected ? "pr-12" : "pr-3.5",
              !selected && "text-muted-foreground"
            )}
            id={id}
            role="combobox"
            variant="outline"
          >
            {Icon ? (
              <Icon className="size-5 shrink-0 text-muted-foreground" />
            ) : null}
            <span className="flex-1 truncate text-left">
              {selected?.label ?? placeholder}
            </span>
            {selected ? null : (
              <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground" />
            )}
          </Button>
        </PopoverTrigger>

        {/* Sits outside the trigger so clearing does not also open the list. */}
        {selected ? (
          <Button
            aria-label="Clear"
            className="absolute top-1/2 right-1.5 size-9 -translate-y-1/2 text-muted-foreground"
            onClick={() => choose(null)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-5" />
          </Button>
        ) : null}
      </div>

      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command shouldFilter>
          <CommandInput
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
            value={query}
          />
          <CommandList>
            {canCreate ? null : <CommandEmpty>—</CommandEmpty>}

            <CommandGroup>
              <CommandItem onSelect={() => choose(null)} value="__none__">
                <span className="flex-1 text-muted-foreground">
                  {emptyLabel}
                </span>
                {value === null ? (
                  <CheckIcon className="size-5 text-primary-accent" />
                ) : null}
              </CommandItem>

              {choices.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => choose(option.value)}
                  value={option.label}
                >
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.value === value ? (
                    <CheckIcon className="size-5 text-primary-accent" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>

            {canCreate ? (
              // Force-mounted, group and item both: cmdk scores every row
              // against the raw query, and the trimmed text loses that match as
              // soon as the query has a trailing space — which hid the one row
              // the user was reaching for, mid-word, while they typed.
              <CommandGroup forceMount>
                <CommandItem
                  disabled={isCreating}
                  forceMount
                  onSelect={handleCreate}
                  value={trimmed}
                >
                  {isCreating ? (
                    <Spinner />
                  ) : (
                    <PlusIcon className="size-5 text-primary-accent" />
                  )}
                  <span className="truncate">{trimmed}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>

        {error ? (
          <p
            className="border-t px-4 py-2.5 font-medium text-destructive text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
