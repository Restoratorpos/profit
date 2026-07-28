"use client";

import { Calendar } from "@repo/design-system/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@repo/design-system/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Switch } from "@repo/design-system/components/ui/switch";
import { cn } from "@repo/design-system/lib/utils";
import type { VariantProps } from "class-variance-authority";
import { format } from "date-fns";
import { CalendarIcon, CheckIcon, Plus, X } from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { DEFAULT_I18N } from "./constants";
import { FilterContext, useFilterContext } from "./context";
import { FilterInput } from "./filter-input";
import {
  flattenFields,
  getFieldsMap,
  getOperatorsForField,
  isFieldGroup,
  isGroupLevelField,
} from "./lib";
import type {
  Filter,
  FilterFieldConfig,
  FilterI18nConfig,
  FilterOperatorDropdownProps,
  FiltersContentProps,
  FiltersProps,
  FilterValueSelectorProps,
  SelectOptionsPopoverProps,
} from "./types";
import {
  filterAddButtonVariants,
  filterFieldBetweenVariants,
  filterFieldLabelVariants,
  filterFieldValueVariants,
  filterItemVariants,
  filterOperatorVariants,
  filterRemoveButtonVariants,
  filtersContainerVariants,
} from "./variants";

export const createFilter = <T = unknown>(
  field: string,
  operator?: string,
  values: T[] = []
): Filter<T> => ({
  id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
  field,
  operator: operator || "is",
  values,
});

interface FilterRemoveButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof filterRemoveButtonVariants> {
  icon?: React.ReactNode;
}

function FilterRemoveButton({
  className,
  icon = <X />,
  ...props
}: FilterRemoveButtonProps) {
  const context = useFilterContext();

  return (
    <button
      className={cn(
        filterRemoveButtonVariants({
          variant: context.variant,
          size: context.size,
          cursorPointer: context.cursorPointer,
          radius: context.radius,
        }),
        className
      )}
      data-slot="filters-remove"
      {...props}
    >
      {icon}
    </button>
  );
}

function FilterOperatorDropdown<T = unknown>({
  field,
  operator,
  values,
  onChange,
}: FilterOperatorDropdownProps<T>) {
  const context = useFilterContext();
  const operators = getOperatorsForField(field, values, context.i18n);

  // Find the operator label, with fallback to formatted operator name
  const operatorLabel =
    operators.find((op) => op.value === operator)?.label ||
    context.i18n.helpers.formatOperator(operator);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={filterOperatorVariants({
          variant: context.variant,
          size: context.size,
        })}
      >
        {operatorLabel}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-fit min-w-fit">
        {operators.map((op) => (
          <DropdownMenuItem
            className="flex items-center gap-2"
            key={op.value}
            onClick={() => onChange(op.value)}
          >
            <span>{op.label}</span>
            <CheckIcon
              className={cn(
                "ml-auto size-3.5 shrink-0",
                op.value !== operator && "opacity-0"
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectOptionsPopover<T = unknown>({
  field,
  values,
  onChange,
  onClose,
  inline = false,
}: SelectOptionsPopoverProps<T>) {
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const context = useFilterContext();

  const isMultiSelect = field.type === "multiselect" || values.length > 1;
  const effectiveValues =
    (field.value === undefined ? values : (field.value as T[])) || [];
  const selectedOptions =
    field.options?.filter((opt) => effectiveValues.includes(opt.value)) || [];
  const unselectedOptions =
    field.options?.filter((opt) => !effectiveValues.includes(opt.value)) || [];

  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  // If inline mode, render the content directly without popover
  if (inline) {
    return (
      <div className="w-full">
        <Command>
          {field.searchable !== false && (
            <CommandInput
              onValueChange={setSearchInput}
              placeholder={context.i18n.placeholders.searchField(
                field.label || ""
              )}
              value={searchInput}
            />
          )}
          <CommandList>
            <CommandEmpty>{context.i18n.noResultsFound}</CommandEmpty>

            {/* Selected items */}
            {selectedOptions.length > 0 && (
              <CommandGroup>
                {selectedOptions.map((option) => (
                  <CommandItem
                    data-checked="true"
                    key={String(option.value)}
                    onSelect={() => {
                      if (isMultiSelect) {
                        const next = effectiveValues.filter(
                          (v) => v !== option.value
                        ) as T[];
                        if (field.onValueChange) {
                          field.onValueChange(next);
                        } else {
                          onChange(next);
                        }
                      } else if (field.onValueChange) {
                        field.onValueChange([] as T[]);
                      } else {
                        onChange([] as T[]);
                      }
                    }}
                  >
                    {option.icon && option.icon}
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Available items */}
            {unselectedOptions.length > 0 && (
              <>
                {selectedOptions.length > 0 && <CommandSeparator />}
                <CommandGroup>
                  {unselectedOptions.map((option) => (
                    <CommandItem
                      key={String(option.value)}
                      onSelect={() => {
                        if (isMultiSelect) {
                          const newValues = [
                            ...effectiveValues,
                            option.value,
                          ] as T[];
                          if (
                            field.maxSelections &&
                            newValues.length > field.maxSelections
                          ) {
                            return; // Don't exceed max selections
                          }
                          if (field.onValueChange) {
                            field.onValueChange(newValues);
                          } else {
                            onChange(newValues);
                          }
                          // For multiselect, don't close the popover to allow multiple selections
                        } else {
                          if (field.onValueChange) {
                            field.onValueChange([option.value] as T[]);
                          } else {
                            onChange([option.value] as T[]);
                          }
                          onClose?.();
                        }
                      }}
                      value={option.label}
                    >
                      {option.icon && option.icon}
                      <span className="truncate">{option.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </div>
    );
  }

  return (
    <Popover
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) {
          setTimeout(() => setSearchInput(""), 200);
        }
      }}
      open={open}
    >
      <PopoverTrigger
        className={filterFieldValueVariants({
          variant: context.variant,
          size: context.size,
          cursorPointer: context.cursorPointer,
        })}
      >
        <div className="flex items-center gap-1.5">
          {field.customValueRenderer ? (
            field.customValueRenderer(values, field.options || [])
          ) : (
            <>
              {selectedOptions.length > 0 && (
                <div
                  className={cn(
                    "flex items-center -space-x-1.5",
                    field.selectedOptionsClassName
                  )}
                >
                  {selectedOptions.slice(0, 3).map((option) => (
                    <div key={String(option.value)}>{option.icon}</div>
                  ))}
                </div>
              )}
              {selectedOptions.length === 1
                ? selectedOptions[0].label
                : selectedOptions.length > 1
                  ? `${selectedOptions.length} ${context.i18n.selectedCount}`
                  : context.i18n.select}
            </>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-[200px] p-0", field.className)}
      >
        <Command className="p-0">
          {field.searchable !== false && (
            <CommandInput
              onValueChange={setSearchInput}
              placeholder={context.i18n.placeholders.searchField(
                field.label || ""
              )}
              value={searchInput}
            />
          )}
          <CommandList>
            <CommandEmpty>{context.i18n.noResultsFound}</CommandEmpty>

            {/* Selected items */}
            {selectedOptions.length > 0 && (
              <CommandGroup>
                {selectedOptions.map((option) => (
                  <CommandItem
                    data-checked="true"
                    key={String(option.value)}
                    onSelect={() => {
                      if (isMultiSelect) {
                        onChange(
                          values.filter((v) => v !== option.value) as T[]
                        );
                      } else {
                        onChange([] as T[]);
                      }
                      if (!isMultiSelect) {
                        setOpen(false);
                        handleClose();
                      }
                    }}
                  >
                    {option.icon && option.icon}
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Available items */}
            {unselectedOptions.length > 0 && (
              <>
                {selectedOptions.length > 0 && <CommandSeparator />}
                <CommandGroup>
                  {unselectedOptions.map((option) => (
                    <CommandItem
                      key={String(option.value)}
                      onSelect={() => {
                        if (isMultiSelect) {
                          const newValues = [...values, option.value] as T[];
                          if (
                            field.maxSelections &&
                            newValues.length > field.maxSelections
                          ) {
                            return; // Don't exceed max selections
                          }
                          onChange(newValues);
                        } else {
                          onChange([option.value] as T[]);
                          setOpen(false);
                          handleClose();
                        }
                      }}
                      value={option.label}
                    >
                      {option.icon && option.icon}
                      <span className="truncate">{option.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Calendar-based date pickers ─────────────────────────────────────

function formatDateLabel(date: Date) {
  return format(date, "LLL dd, y");
}

function DateRangeLabel({ range }: { range?: DateRange }) {
  if (!range?.from) {
    return null;
  }
  if (range.to) {
    return (
      <span>
        {formatDateLabel(range.from)} – {formatDateLabel(range.to)}
      </span>
    );
  }
  return <span>{formatDateLabel(range.from)}</span>;
}

function DateRangePicker<T>({
  range,
  onChange,
  context,
  select,
}: {
  range?: DateRange;
  onChange: (values: T[]) => void;
  context: { variant: string; size: string; cursorPointer: boolean };
  select: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={filterFieldValueVariants({
          variant: context.variant as "solid" | "outline",
          size: context.size as "sm" | "md" | "lg",
          cursorPointer: context.cursorPointer,
        })}
      >
        <CalendarIcon className="size-3.5 text-muted-foreground" />
        {range?.from ? (
          <DateRangeLabel range={range} />
        ) : (
          <span className="text-muted-foreground">{select}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={range?.from}
          mode="range"
          numberOfMonths={2}
          onSelect={(selected) => {
            const from = selected?.from ? selected.from.toISOString() : "";
            const to = selected?.to ? selected.to.toISOString() : "";
            onChange([from, to] as T[]);
          }}
          selected={range}
        />
      </PopoverContent>
    </Popover>
  );
}

function SingleDatePicker<T>({
  date,
  onChange,
  context,
  select,
}: {
  date?: Date;
  onChange: (values: T[]) => void;
  context: { variant: string; size: string; cursorPointer: boolean };
  select: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={filterFieldValueVariants({
          variant: context.variant as "solid" | "outline",
          size: context.size as "sm" | "md" | "lg",
          cursorPointer: context.cursorPointer,
        })}
      >
        <CalendarIcon className="size-3.5 text-muted-foreground" />
        {date ? (
          <span>{formatDateLabel(date)}</span>
        ) : (
          <span className="text-muted-foreground">{select}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={date}
          mode="single"
          onSelect={(selected) => {
            onChange([selected ? selected.toISOString() : ""] as T[]);
          }}
          selected={date}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── Field-type value renderers ─────────────────────────────────────

function BooleanValue<T>({
  field,
  values,
  onChange,
  context,
}: {
  field: FilterFieldConfig<T>;
  values: T[];
  onChange: (v: T[]) => void;
  context: ReturnType<typeof useFilterContext>;
}) {
  const isChecked = values[0] === true;
  const onLabel = field.onLabel || context.i18n.true;
  const offLabel = field.offLabel || context.i18n.false;

  return (
    <div
      className={filterFieldValueVariants({
        variant: context.variant,
        size: context.size,
        cursorPointer: context.cursorPointer,
      })}
    >
      <div className="flex items-center gap-2">
        <Switch
          checked={isChecked}
          onCheckedChange={(checked) => onChange([checked as T])}
        />
        {field.onLabel && field.offLabel && (
          <span className="text-muted-foreground text-xs">
            {isChecked ? onLabel : offLabel}
          </span>
        )}
      </div>
    </div>
  );
}

function TimeValue<T>({
  field,
  values,
  onChange,
  operator,
  context,
}: {
  field: FilterFieldConfig<T>;
  values: T[];
  onChange: (v: T[]) => void;
  operator: string;
  context: ReturnType<typeof useFilterContext>;
}) {
  if (operator === "between") {
    const startTime = (values[0] as string) || "";
    const endTime = (values[1] as string) || "";

    return (
      <div className="flex items-center" data-slot="filters-item">
        <FilterInput
          className={field.className}
          field={field}
          onChange={(e) => onChange([e.target.value, endTime] as T[])}
          onInputChange={field.onInputChange}
          type="time"
          value={startTime}
        />
        <div
          className={filterFieldBetweenVariants({
            variant: context.variant,
            size: context.size,
          })}
          data-slot="filters-between"
        >
          {context.i18n.to}
        </div>
        <FilterInput
          className={field.className}
          field={field}
          onChange={(e) => onChange([startTime, e.target.value] as T[])}
          onInputChange={field.onInputChange}
          type="time"
          value={endTime}
        />
      </div>
    );
  }

  return (
    <FilterInput
      className={field.className}
      field={field}
      onChange={(e) => onChange([e.target.value] as T[])}
      onInputChange={field.onInputChange}
      type="time"
      value={(values[0] as string) || ""}
    />
  );
}

function DateTimeValue<T>({
  field,
  values,
  onChange,
  operator,
  context,
}: {
  field: FilterFieldConfig<T>;
  values: T[];
  onChange: (v: T[]) => void;
  operator: string;
  context: ReturnType<typeof useFilterContext>;
}) {
  if (operator === "between") {
    const startDateTime = (values[0] as string) || "";
    const endDateTime = (values[1] as string) || "";

    return (
      <div className="flex items-center" data-slot="filters-item">
        <FilterInput
          className={cn("w-36", field.className)}
          field={field}
          onChange={(e) => onChange([e.target.value, endDateTime] as T[])}
          onInputChange={field.onInputChange}
          type="datetime-local"
          value={startDateTime}
        />
        <div
          className={filterFieldBetweenVariants({
            variant: context.variant,
            size: context.size,
          })}
          data-slot="filters-between"
        >
          {context.i18n.to}
        </div>
        <FilterInput
          className={cn("w-36", field.className)}
          field={field}
          onChange={(e) => onChange([startDateTime, e.target.value] as T[])}
          onInputChange={field.onInputChange}
          type="datetime-local"
          value={endDateTime}
        />
      </div>
    );
  }

  return (
    <FilterInput
      className={cn("w-36", field.className)}
      field={field}
      onChange={(e) => onChange([e.target.value] as T[])}
      onInputChange={field.onInputChange}
      type="datetime-local"
      value={(values[0] as string) || ""}
    />
  );
}

const CONTACT_INPUT_TYPES: Record<string, { type: string; pattern: string }> = {
  email: { type: "email", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
  url: {
    type: "url",
    pattern:
      "^https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_\\+.~#?&//=]*)$",
  },
  tel: { type: "tel", pattern: "^[\\+]?[1-9][\\d]{0,15}$" },
};

function ContactValue<T>({
  field,
  values,
  onChange,
  context,
}: {
  field: FilterFieldConfig<T>;
  values: T[];
  onChange: (v: T[]) => void;
  context: ReturnType<typeof useFilterContext>;
}) {
  const config = CONTACT_INPUT_TYPES[field.type || ""] ?? {
    type: "text",
    pattern: undefined,
  };

  return (
    <FilterInput
      className={field.className}
      field={field}
      onChange={(e) => onChange([e.target.value] as T[])}
      onInputChange={field.onInputChange}
      pattern={field.pattern || config.pattern}
      placeholder={
        field.placeholder ||
        context.i18n.placeholders.enterField(field.type || "text")
      }
      type={config.type}
      value={(values[0] as string) || ""}
    />
  );
}

function TextNumberValue<T>({
  field,
  values,
  onChange,
  operator,
  context,
}: {
  field: FilterFieldConfig<T>;
  values: T[];
  onChange: (v: T[]) => void;
  operator: string;
  context: ReturnType<typeof useFilterContext>;
}) {
  if (field.type === "number" && operator === "between") {
    const minVal = (values[0] as string) || "";
    const maxVal = (values[1] as string) || "";

    return (
      <div className="flex items-center" data-slot="filters-item">
        <FilterInput
          className={cn("w-16", field.className)}
          field={field}
          max={field.max}
          min={field.min}
          onChange={(e) => onChange([e.target.value, maxVal] as T[])}
          onInputChange={field.onInputChange}
          pattern={field.pattern}
          placeholder={context.i18n.min}
          step={field.step}
          type="number"
          value={minVal}
        />
        <div
          className={filterFieldBetweenVariants({
            variant: context.variant,
            size: context.size,
          })}
          data-slot="filters-between"
        >
          {context.i18n.to}
        </div>
        <FilterInput
          className={cn("w-16", field.className)}
          field={field}
          max={field.max}
          min={field.min}
          onChange={(e) => onChange([minVal, e.target.value] as T[])}
          onInputChange={field.onInputChange}
          pattern={field.pattern}
          placeholder={context.i18n.max}
          step={field.step}
          type="number"
          value={maxVal}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center" data-slot="filters-item">
      <FilterInput
        className={cn("w-36", field.className)}
        field={field}
        max={field.type === "number" ? field.max : undefined}
        min={field.type === "number" ? field.min : undefined}
        onChange={(e) => onChange([e.target.value] as T[])}
        onInputChange={field.onInputChange}
        pattern={field.pattern}
        placeholder={field.placeholder}
        step={field.type === "number" ? field.step : undefined}
        type={field.type === "number" ? "number" : "text"}
        value={(values[0] as string) || ""}
      />
    </div>
  );
}

// ─── Filter value selector ──────────────────────────────────────────

function parseDateRange(values: unknown[]): DateRange | undefined {
  const startStr = (values[0] as string) || "";
  const endStr = (values[1] as string) || "";
  const from = startStr ? new Date(startStr) : undefined;
  const to = endStr ? new Date(endStr) : undefined;
  return from || to ? { from, to } : undefined;
}

function FilterValueSelector<T = unknown>({
  field,
  values,
  onChange,
  operator,
}: FilterValueSelectorProps<T>) {
  const context = useFilterContext();

  if (operator === "empty" || operator === "not_empty") {
    return null;
  }

  if (field.customRenderer) {
    return (
      <div
        className={filterFieldValueVariants({
          variant: context.variant,
          size: context.size,
          cursorPointer: context.cursorPointer,
        })}
      >
        {field.customRenderer({ field, values, onChange, operator })}
      </div>
    );
  }

  switch (field.type) {
    case "boolean": {
      return (
        <BooleanValue
          context={context}
          field={field}
          onChange={onChange}
          values={values}
        />
      );
    }
    case "time": {
      return (
        <TimeValue
          context={context}
          field={field}
          onChange={onChange}
          operator={operator}
          values={values}
        />
      );
    }
    case "datetime": {
      return (
        <DateTimeValue
          context={context}
          field={field}
          onChange={onChange}
          operator={operator}
          values={values}
        />
      );
    }
    case "email":
    case "url":
    case "tel": {
      return (
        <ContactValue
          context={context}
          field={field}
          onChange={onChange}
          values={values}
        />
      );
    }
    case "daterange": {
      if (operator === "before" || operator === "after") {
        const dateStr = (values[0] as string) || "";
        const dateVal = dateStr ? new Date(dateStr) : undefined;
        return (
          <SingleDatePicker
            context={context}
            date={dateVal}
            onChange={onChange}
            select={context.i18n.select}
          />
        );
      }
      return (
        <DateRangePicker
          context={context}
          onChange={onChange}
          range={parseDateRange(values)}
          select={context.i18n.select}
        />
      );
    }
    case "text":
    case "number": {
      return (
        <TextNumberValue
          context={context}
          field={field}
          onChange={onChange}
          operator={operator}
          values={values}
        />
      );
    }
    case "date": {
      const dateStr = (values[0] as string) || "";
      const dateVal = dateStr ? new Date(dateStr) : undefined;
      return (
        <SingleDatePicker
          context={context}
          date={dateVal}
          onChange={onChange}
          select={context.i18n.select}
        />
      );
    }
    case "select":
    case "multiselect": {
      return (
        <SelectOptionsPopover
          field={field}
          onChange={onChange}
          values={values}
        />
      );
    }
    default: {
      return (
        <SelectOptionsPopover
          field={field}
          onChange={onChange}
          values={values}
        />
      );
    }
  }
}

export const FiltersContent = <T = unknown>({
  filters,
  fields,
  onChange,
}: FiltersContentProps<T>) => {
  const context = useFilterContext();
  const fieldsMap = useMemo(() => getFieldsMap(fields), [fields]);

  const updateFilter = useCallback(
    (filterId: string, updates: Partial<Filter<T>>) => {
      onChange(
        filters.map((filter) => {
          if (filter.id === filterId) {
            const updatedFilter = { ...filter, ...updates };
            // Reset values when operator changes to avoid stale data
            if (updates.operator) {
              const noValue =
                updates.operator === "empty" ||
                updates.operator === "not_empty";
              const wasRange =
                filter.operator === "between" ||
                filter.operator === "not_between";
              const isRange =
                updates.operator === "between" ||
                updates.operator === "not_between";

              if (noValue) {
                updatedFilter.values = [] as T[];
              } else if (wasRange !== isRange) {
                // Switching between range and single-value operators
                updatedFilter.values = [] as T[];
              }
            }
            return updatedFilter;
          }
          return filter;
        })
      );
    },
    [filters, onChange]
  );

  const removeFilter = useCallback(
    (filterId: string) => {
      onChange(filters.filter((filter) => filter.id !== filterId));
    },
    [filters, onChange]
  );

  return (
    <div
      className={cn(
        filtersContainerVariants({
          variant: context.variant,
          size: context.size,
        }),
        context.className
      )}
    >
      {filters.map((filter) => {
        const field = fieldsMap[filter.field];
        if (!field) {
          return null;
        }

        return (
          <div
            className={filterItemVariants({ variant: context.variant })}
            data-slot="filter-item"
            key={filter.id}
          >
            {/* Field Label */}
            <div
              className={filterFieldLabelVariants({
                variant: context.variant,
                size: context.size,
                radius: context.radius,
              })}
            >
              {field.icon}
              {field.label}
            </div>

            {/* Operator Dropdown */}
            <FilterOperatorDropdown<T>
              field={field}
              onChange={(operator) => updateFilter(filter.id, { operator })}
              operator={filter.operator}
              values={filter.values}
            />

            {/* Value Selector */}
            <FilterValueSelector<T>
              field={field}
              onChange={(values) => updateFilter(filter.id, { values })}
              operator={filter.operator}
              values={filter.values}
            />

            {/* Remove Button */}
            <FilterRemoveButton onClick={() => removeFilter(filter.id)} />
          </div>
        );
      })}
    </div>
  );
};

export function Filters<T = unknown>({
  filters,
  fields,
  onChange,
  className,
  showAddButton = true,
  addButtonText,
  addButtonIcon,
  addButtonClassName,
  addButton,
  variant = "outline",
  size = "md",
  radius = "md",
  i18n,
  showSearchInput = true,
  cursorPointer = true,
  trigger,
  allowMultiple = true,
  popoverContentClassName,
}: FiltersProps<T>) {
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [selectedFieldForOptions, setSelectedFieldForOptions] =
    useState<FilterFieldConfig<T> | null>(null);
  const [tempSelectedValues, setTempSelectedValues] = useState<unknown[]>([]);

  // Merge provided i18n with defaults
  const mergedI18n: FilterI18nConfig = {
    ...DEFAULT_I18N,
    ...i18n,
    operators: {
      ...DEFAULT_I18N.operators,
      ...i18n?.operators,
    },
    placeholders: {
      ...DEFAULT_I18N.placeholders,
      ...i18n?.placeholders,
    },
    validation: {
      ...DEFAULT_I18N.validation,
      ...i18n?.validation,
    },
  };

  const fieldsMap = useMemo(() => getFieldsMap(fields), [fields]);

  const updateFilter = useCallback(
    (filterId: string, updates: Partial<Filter<T>>) => {
      onChange(
        filters.map((filter) => {
          if (filter.id === filterId) {
            const updatedFilter = { ...filter, ...updates };
            // Reset values when operator changes to avoid stale data
            if (updates.operator) {
              const noValue =
                updates.operator === "empty" ||
                updates.operator === "not_empty";
              const wasRange =
                filter.operator === "between" ||
                filter.operator === "not_between";
              const isRange =
                updates.operator === "between" ||
                updates.operator === "not_between";

              if (noValue) {
                updatedFilter.values = [] as T[];
              } else if (wasRange !== isRange) {
                // Switching between range and single-value operators
                updatedFilter.values = [] as T[];
              }
            }
            return updatedFilter;
          }
          return filter;
        })
      );
    },
    [filters, onChange]
  );

  const removeFilter = useCallback(
    (filterId: string) => {
      onChange(filters.filter((filter) => filter.id !== filterId));
    },
    [filters, onChange]
  );

  const addFilter = useCallback(
    (fieldKey: string) => {
      const field = fieldsMap[fieldKey];
      if (field && field.key) {
        // For select and multiselect types, show options directly
        if (field.type === "select" || field.type === "multiselect") {
          setSelectedFieldForOptions(field);
          // For multiselect, check if there's already a filter and use its values
          const existingFilter = filters.find((f) => f.field === fieldKey);
          const initialValues =
            field.type === "multiselect" && existingFilter
              ? existingFilter.values
              : [];
          setTempSelectedValues(initialValues);
          return;
        }

        // For other types, add filter directly
        const defaultOperator =
          field.defaultOperator ||
          (field.type === "daterange"
            ? "between"
            : field.type === "numberrange"
              ? "between"
              : field.type === "boolean"
                ? "is"
                : "is");
        let defaultValues: unknown[] = [];

        if (
          [
            "text",
            "number",
            "date",
            "email",
            "url",
            "tel",
            "time",
            "datetime",
          ].includes(field.type || "")
        ) {
          defaultValues = [""] as unknown[];
        } else if (field.type === "daterange") {
          defaultValues = ["", ""] as unknown[];
        } else if (field.type === "numberrange") {
          defaultValues = [field.min || 0, field.max || 100] as unknown[];
        } else if (field.type === "boolean") {
          defaultValues = [false] as unknown[];
        } else if (field.type === "time") {
          defaultValues = [""] as unknown[];
        } else if (field.type === "datetime") {
          defaultValues = [""] as unknown[];
        }

        const newFilter = createFilter<T>(
          fieldKey,
          defaultOperator,
          defaultValues as T[]
        );
        const newFilters = [...filters, newFilter];
        onChange(newFilters);
        setAddFilterOpen(false);
      }
    },
    [fieldsMap, filters, onChange]
  );

  const addFilterWithOption = useCallback(
    (field: FilterFieldConfig<T>, values: unknown[], closePopover = true) => {
      if (!field.key) {
        return;
      }

      const defaultOperator =
        field.defaultOperator ||
        (field.type === "multiselect" ? "is_any_of" : "is");

      // Check if there's already a filter for this field
      const existingFilterIndex = filters.findIndex(
        (f) => f.field === field.key
      );

      if (existingFilterIndex >= 0) {
        // Update existing filter
        const updatedFilters = [...filters];
        updatedFilters[existingFilterIndex] = {
          ...updatedFilters[existingFilterIndex],
          values: values as T[],
        };
        onChange(updatedFilters);
      } else {
        // Create new filter
        const newFilter = createFilter<T>(
          field.key,
          defaultOperator,
          values as T[]
        );
        const newFilters = [...filters, newFilter];
        onChange(newFilters);
      }

      if (closePopover) {
        setAddFilterOpen(false);
        setSelectedFieldForOptions(null);
        setTempSelectedValues([]);
      } else {
        // For multiselect, keep popover open but update temp values
        setTempSelectedValues(values as unknown[]);
      }
    },
    [filters, onChange]
  );

  const selectableFields = useMemo(() => {
    const flatFields = flattenFields(fields);
    return flatFields.filter((field) => {
      // Only include actual filterable fields (must have key and type)
      if (!field.key || field.type === "separator") {
        return false;
      }
      // If allowMultiple is true, don't filter out fields that already have filters
      if (allowMultiple) {
        return true;
      }
      // Filter out fields that already have filters (default behavior)
      return !filters.some((filter) => filter.field === field.key);
    });
  }, [fields, filters, allowMultiple]);

  return (
    <FilterContext.Provider
      value={{
        variant,
        size,
        radius,
        i18n: mergedI18n,
        cursorPointer,
        className,
        showAddButton,
        addButtonText,
        addButtonIcon,
        addButtonClassName,
        addButton,
        showSearchInput,
        trigger,
        allowMultiple,
      }}
    >
      <div
        className={cn(filtersContainerVariants({ variant, size }), className)}
      >
        {filters.map((filter) => {
          const field = fieldsMap[filter.field];
          if (!field) {
            return null;
          }

          return (
            <div
              className={filterItemVariants({ variant })}
              data-slot="filter-item"
              key={filter.id}
            >
              {/* Field Label */}
              <div
                className={filterFieldLabelVariants({ variant, size, radius })}
              >
                {field.icon}
                {field.label}
              </div>

              {/* Operator Dropdown */}
              <FilterOperatorDropdown<T>
                field={field}
                onChange={(operator) => updateFilter(filter.id, { operator })}
                operator={filter.operator}
                values={filter.values}
              />

              {/* Value Selector */}
              <FilterValueSelector<T>
                field={field}
                onChange={(values) => updateFilter(filter.id, { values })}
                operator={filter.operator}
                values={filter.values}
              />

              {/* Remove Button */}
              <FilterRemoveButton onClick={() => removeFilter(filter.id)} />
            </div>
          );
        })}
        {showAddButton && selectableFields.length > 0 && (
          <Popover
            modal
            onOpenChange={(open) => {
              setAddFilterOpen(open);
              if (!open) {
                setSelectedFieldForOptions(null);
                setTempSelectedValues([]);
              }
            }}
            open={addFilterOpen}
          >
            <PopoverTrigger asChild>
              {addButton ? (
                addButton
              ) : (
                <button
                  className={cn(
                    filterAddButtonVariants({
                      variant,
                      size,
                      cursorPointer,
                      radius,
                    }),
                    addButtonClassName
                  )}
                  title={mergedI18n.addFilterTitle}
                >
                  {addButtonIcon || <Plus />}
                  {addButtonText || mergedI18n.addFilter}
                </button>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className={cn("w-fit p-0", popoverContentClassName)}
            >
              <Command className="min-w-[200px] max-w-[450px]">
                {selectedFieldForOptions ? (
                  // Show original select/multiselect rendering without back button
                  <SelectOptionsPopover<T>
                    field={selectedFieldForOptions}
                    inline={true}
                    onChange={(values) => {
                      // For multiselect, create filter immediately but keep popover open
                      // For single select, create filter and close popover
                      const shouldClosePopover =
                        selectedFieldForOptions.type === "select";
                      addFilterWithOption(
                        selectedFieldForOptions,
                        values as unknown[],
                        shouldClosePopover
                      );
                    }}
                    onClose={() => setAddFilterOpen(false)}
                    values={tempSelectedValues as T[]}
                  />
                ) : (
                  // Show field selection
                  <>
                    {showSearchInput && (
                      <CommandInput placeholder={mergedI18n.searchFields} />
                    )}
                    <CommandList>
                      <CommandEmpty>{mergedI18n.noFieldsFound}</CommandEmpty>
                      {fields.map((item, index) => {
                        // Handle grouped fields (FilterFieldGroup structure)
                        if (isFieldGroup(item)) {
                          const groupFields = item.fields.filter((field) => {
                            if (field.type === "separator") {
                              return true;
                            }
                            if (allowMultiple) {
                              return true;
                            }
                            return !filters.some(
                              (filter) => filter.field === field.key
                            );
                          });

                          if (groupFields.length === 0) {
                            return null;
                          }

                          return (
                            <CommandGroup
                              heading={item.group || "Fields"}
                              key={`group-${index}`}
                            >
                              {groupFields.map((field, fieldIndex) => {
                                if (field.type === "separator") {
                                  return (
                                    <CommandSeparator
                                      key={`separator-${fieldIndex}`}
                                    />
                                  );
                                }

                                return (
                                  <CommandItem
                                    key={field.key}
                                    onSelect={() =>
                                      field.key && addFilter(field.key)
                                    }
                                  >
                                    {field.icon}
                                    <span>{field.label}</span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          );
                        }

                        // Handle group-level fields (FilterFieldConfig with group property)
                        if (isGroupLevelField(item)) {
                          const groupFields = item.fields!.filter((field) => {
                            if (field.type === "separator") {
                              return true;
                            }
                            if (allowMultiple) {
                              return true;
                            }
                            return !filters.some(
                              (filter) => filter.field === field.key
                            );
                          });

                          if (groupFields.length === 0) {
                            return null;
                          }

                          return (
                            <CommandGroup
                              heading={item.group || "Fields"}
                              key={`group-${index}`}
                            >
                              {groupFields.map((field, fieldIndex) => {
                                if (field.type === "separator") {
                                  return (
                                    <CommandSeparator
                                      key={`separator-${fieldIndex}`}
                                    />
                                  );
                                }

                                return (
                                  <CommandItem
                                    key={field.key}
                                    onSelect={() =>
                                      field.key && addFilter(field.key)
                                    }
                                  >
                                    {field.icon}
                                    <span>{field.label}</span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          );
                        }

                        // Flat fields — not wrapped yet, will be
                        // collected into a default CommandGroup below
                        return null;
                      })}

                      {/* Flat (ungrouped) fields go in a default CommandGroup */}
                      {(() => {
                        const flatItems = fields.filter((item) => {
                          if (isFieldGroup(item)) {
                            return false;
                          }
                          if (isGroupLevelField(item)) {
                            return false;
                          }
                          return true;
                        }) as FilterFieldConfig<T>[];

                        if (flatItems.length === 0) {
                          return null;
                        }

                        return (
                          <CommandGroup>
                            {flatItems.map((field) => {
                              if (field.type === "separator") {
                                return (
                                  <CommandSeparator
                                    key={`separator-${field.key}`}
                                  />
                                );
                              }

                              return (
                                <CommandItem
                                  key={field.key}
                                  onSelect={() =>
                                    field.key && addFilter(field.key)
                                  }
                                >
                                  {field.icon}
                                  <span>{field.label}</span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        );
                      })()}
                    </CommandList>
                  </>
                )}
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </FilterContext.Provider>
  );
}
