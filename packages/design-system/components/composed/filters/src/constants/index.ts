import { createOperatorsFromI18n } from "../lib";
import type { FilterI18nConfig, FilterOperator } from "../types";

// Default English i18n configuration
const DEFAULT_I18N: FilterI18nConfig = {
  // UI Labels
  addFilter: "Add filter",
  searchFields: "Search fields...",
  noFieldsFound: "No fields found.",
  noResultsFound: "No results found.",
  select: "Select...",
  true: "True",
  false: "False",
  min: "Min",
  max: "Max",
  to: "to",
  typeAndPressEnter: "Type and press Enter to add tag",
  selected: "selected",
  selectedCount: "selected",
  percent: "%",
  defaultCurrency: "$",
  defaultColor: "#000000",
  addFilterTitle: "Add filter",

  // Operators
  operators: {
    is: "is",
    isNot: "is not",
    isAnyOf: "is any of",
    isNotAnyOf: "is not any of",
    includesAll: "includes all",
    excludesAll: "excludes all",
    before: "before",
    after: "after",
    between: "between",
    notBetween: "not between",
    contains: "contains",
    notContains: "does not contain",
    startsWith: "starts with",
    endsWith: "ends with",
    isExactly: "is exactly",
    equals: "equals",
    notEquals: "not equals",
    greaterThan: "greater than",
    lessThan: "less than",
    overlaps: "overlaps",
    includes: "includes",
    excludes: "excludes",
    includesAllOf: "includes all of",
    includesAnyOf: "includes any of",
    empty: "is empty",
    notEmpty: "is not empty",
  },

  // Placeholders
  placeholders: {
    enterField: (fieldType: string) => `Enter ${fieldType}...`,
    selectField: "Select...",
    searchField: (fieldName: string) => `Search ${fieldName.toLowerCase()}...`,
    enterKey: "Enter key...",
    enterValue: "Enter value...",
  },

  // Helper functions
  helpers: {
    formatOperator: (operator: string) => operator.replace(/_/g, " "),
  },

  // Validation
  validation: {
    invalidEmail: "Invalid email format",
    invalidUrl: "Invalid URL format",
    invalidTel: "Invalid phone format",
    invalid: "Invalid input format",
  },
} as const;

// Default operators for different field types (using default i18n)
const DEFAULT_OPERATORS: Record<string, FilterOperator[]> =
  createOperatorsFromI18n(DEFAULT_I18N);

export { DEFAULT_I18N, DEFAULT_OPERATORS };
