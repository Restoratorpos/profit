import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { useFilterContext } from "../context";
import type { FilterFieldConfig } from "../types";
import { filterFieldAddonVariants, filterInputVariants } from "../variants";

function FilterInput<T = unknown>({
  field,
  onChange,
  onBlur,
  onKeyDown,
  onInputChange,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
  field?: FilterFieldConfig<T>;
  onInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const context = useFilterContext();
  const [isValid, setIsValid] = useState<boolean>(true);
  const [validationMessage, setValidationMessage] = useState<string>("");

  // Validation function to check if input matches pattern
  const validateInput = (value: string, pattern?: string): boolean => {
    if (!(pattern && value)) {
      return true;
    }
    const regex = new RegExp(pattern);
    return regex.test(value);
  };

  // Get validation message for field type
  const getValidationMessage = (
    fieldType: string,
    hasCustomPattern = false
  ): string => {
    // If it's a text or number field with a custom pattern, use the generic invalid message
    if ((fieldType === "text" || fieldType === "number") && hasCustomPattern) {
      return context.i18n.validation.invalid;
    }

    switch (fieldType) {
      case "email":
        return context.i18n.validation.invalidEmail;
      case "url":
        return context.i18n.validation.invalidUrl;
      case "tel":
        return context.i18n.validation.invalidTel;
      default:
        return context.i18n.validation.invalid;
    }
  };

  // Handle input change - allow typing without validation
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Always allow typing, just call the original onChange
    onChange?.(e);
  };

  // Handle blur event - validate when user leaves input
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const pattern = field?.pattern || props.pattern;

    // Only validate if there's a value and pattern
    if (value && pattern) {
      let valid = true;

      // If there's a custom validation function, use it
      if (field?.validation) {
        valid = field.validation(value);
      } else {
        // Use pattern validation
        valid = validateInput(value, pattern);
      }

      setIsValid(valid);
      const hasCustomPattern = !!(field?.pattern || props.pattern);
      setValidationMessage(
        valid ? "" : getValidationMessage(field?.type || "", hasCustomPattern)
      );
    } else {
      // Reset validation state for empty values or no pattern
      setIsValid(true);
      setValidationMessage("");
    }

    // Call onInputChange if provided (for blur-based filter updates)
    if (onInputChange) {
      onInputChange(e as React.ChangeEvent<HTMLInputElement>);
    }

    // Call the original onBlur if provided
    onBlur?.(e);
  };

  // Handle keydown event - hide validation error when user starts typing
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Hide validation error when user starts typing (any key except special keys)
    if (
      !(
        isValid ||
        [
          "Tab",
          "Escape",
          "Enter",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.key)
      )
    ) {
      setIsValid(true);
      setValidationMessage("");
    }

    // Handle Enter key for immediate filter updates
    if (e.key === "Enter" && onInputChange) {
      // Create a synthetic change event for Enter key
      const syntheticEvent = {
        ...e,
        target: e.target as HTMLInputElement,
        currentTarget: e.currentTarget as HTMLInputElement,
      } as React.ChangeEvent<HTMLInputElement>;
      onInputChange(syntheticEvent);
    }

    // Call the original onKeyDown if provided
    onKeyDown?.(e);
  };

  return (
    <div
      className={cn(
        "w-36",
        filterInputVariants({ variant: context.variant, size: context.size }),
        className
      )}
      data-slot="filters-input-wrapper"
    >
      {field?.prefix && (
        <div
          className={filterFieldAddonVariants({
            variant: context.variant,
            size: context.size,
          })}
          data-slot="filters-prefix"
        >
          {field.prefix}
        </div>
      )}

      <div className="flex w-full items-stretch">
        <input
          aria-describedby={
            !isValid && validationMessage
              ? `${field?.key || "input"}-error`
              : undefined
          }
          aria-invalid={!isValid}
          className="w-full outline-none"
          data-slot="filters-input"
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          {...props}
        />
        {!isValid && validationMessage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
                <AlertCircle className="size-3.5 text-destructive" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm">{validationMessage}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {field?.suffix && (
        <div
          className={cn(
            filterFieldAddonVariants({
              variant: context.variant,
              size: context.size,
            })
          )}
          data-slot="filters-suffix"
        >
          {field.suffix}
        </div>
      )}
    </div>
  );
}

export { FilterInput };
