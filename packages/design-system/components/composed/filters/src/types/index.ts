// i18n Configuration Interface
interface FilterI18nConfig {
  // UI Labels
  addFilter: string;
  addFilterTitle: string;
  defaultColor: string;
  defaultCurrency: string;
  false: string;

  // Helper functions
  helpers: {
    formatOperator: (operator: string) => string;
  };
  max: string;
  min: string;
  noFieldsFound: string;
  noResultsFound: string;

  // Operators
  operators: {
    is: string;
    isNot: string;
    isAnyOf: string;
    isNotAnyOf: string;
    includesAll: string;
    excludesAll: string;
    before: string;
    after: string;
    between: string;
    notBetween: string;
    contains: string;
    notContains: string;
    startsWith: string;
    endsWith: string;
    isExactly: string;
    equals: string;
    notEquals: string;
    greaterThan: string;
    lessThan: string;
    overlaps: string;
    includes: string;
    excludes: string;
    includesAllOf: string;
    includesAnyOf: string;
    empty: string;
    notEmpty: string;
  };
  percent: string;

  // Placeholders
  placeholders: {
    enterField: (fieldType: string) => string;
    selectField: string;
    searchField: (fieldName: string) => string;
    enterKey: string;
    enterValue: string;
  };
  searchFields: string;
  select: string;
  selected: string;
  selectedCount: string;
  to: string;
  true: string;
  typeAndPressEnter: string;

  // Validation
  validation: {
    invalidEmail: string;
    invalidUrl: string;
    invalidTel: string;
    invalid: string;
  };
}

// Context for all Filter component props
interface FilterContextValue {
  addButton?: React.ReactNode;
  addButtonClassName?: string;
  addButtonIcon?: React.ReactNode;
  addButtonText?: string;
  allowMultiple?: boolean;
  className?: string;
  cursorPointer: boolean;
  i18n: FilterI18nConfig;
  radius: "md" | "full";
  showAddButton?: boolean;
  showSearchInput?: boolean;
  size: "sm" | "md" | "lg";
  trigger?: React.ReactNode;
  variant: "solid" | "outline";
}

// Generic types for flexible filter system
interface FilterOption<T = unknown> {
  icon?: React.ReactNode;
  label: string;
  metadata?: Record<string, unknown>;
  value: T;
}

interface FilterOperator {
  label: string;
  supportsMultiple?: boolean;
  value: string;
}

// Custom renderer props interface
interface CustomRendererProps<T = unknown> {
  field: FilterFieldConfig<T>;
  onChange: (values: T[]) => void;
  operator: string;
  values: T[];
}

// Grouped field configuration interface
interface FilterFieldGroup<T = unknown> {
  fields: FilterFieldConfig<T>[];
  group?: string;
}

// Union type for both flat and grouped field configurations
type FilterFieldsConfig<T = unknown> =
  | FilterFieldConfig<T>[]
  | FilterFieldGroup<T>[];

interface FilterFieldConfig<T = unknown> {
  allowCustomValues?: boolean;
  className?: string;
  customRenderer?: (props: CustomRendererProps<T>) => React.ReactNode;
  customValueRenderer?: (
    values: T[],
    options: FilterOption<T>[]
  ) => React.ReactNode;
  // Default operator to use when creating a filter for this field
  defaultOperator?: string;
  fields?: FilterFieldConfig<T>[];
  // Group-level configuration
  group?: string;
  // Grouping options (legacy support)
  groupLabel?: string;
  icon?: React.ReactNode;
  key?: string;
  label?: string;
  max?: number;
  maxSelections?: number;
  min?: number;
  offLabel?: string;
  // Input event handlers
  onInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // Boolean field options
  onLabel?: string;
  onValueChange?: (values: T[]) => void;
  operators?: FilterOperator[];
  // Field-specific options
  options?: FilterOption<T>[];
  pattern?: string;
  placeholder?: string;
  popoverContentClassName?: string;
  prefix?: string | React.ReactNode;
  searchable?: boolean;
  selectedOptionsClassName?: string;
  step?: number;
  suffix?: string | React.ReactNode;
  type?:
    | "select"
    | "multiselect"
    | "date"
    | "daterange"
    | "text"
    | "number"
    | "numberrange"
    | "boolean"
    | "email"
    | "url"
    | "tel"
    | "time"
    | "datetime"
    | "custom"
    | "separator";
  validation?: (value: unknown) => boolean;
  // Controlled values support for this field
  value?: T[];
}

interface FilterOperatorDropdownProps<T = unknown> {
  field: FilterFieldConfig<T>;
  onChange: (operator: string) => void;
  operator: string;
  values: T[];
}

interface FilterValueSelectorProps<T = unknown> {
  field: FilterFieldConfig<T>;
  onChange: (values: T[]) => void;
  operator: string;
  values: T[];
}

interface SelectOptionsPopoverProps<T = unknown> {
  field: FilterFieldConfig<T>;
  inline?: boolean;
  onBack?: () => void;
  onChange: (values: T[]) => void;
  onClose?: () => void;
  showBackButton?: boolean;
  values: T[];
}

interface Filter<T = unknown> {
  field: string;
  id: string;
  operator: string;
  values: T[];
}

interface FilterGroup<T = unknown> {
  fields: FilterFieldConfig<T>[];
  filters: Filter<T>[];
  id: string;
  label?: string;
}

// FiltersContent component for the filter panel content
interface FiltersContentProps<T = unknown> {
  fields: FilterFieldsConfig<T>;
  filters: Filter<T>[];
  onChange: (filters: Filter<T>[]) => void;
}
interface FiltersProps<T = unknown> {
  addButton?: React.ReactNode;
  addButtonClassName?: string;
  addButtonIcon?: React.ReactNode;
  addButtonText?: string;
  allowMultiple?: boolean;
  className?: string;
  cursorPointer?: boolean;
  fields: FilterFieldsConfig<T>;
  filters: Filter<T>[];
  i18n?: Partial<FilterI18nConfig>;
  onChange: (filters: Filter<T>[]) => void;
  popoverContentClassName?: string;
  radius?: "md" | "full";
  showAddButton?: boolean;
  showSearchInput?: boolean;
  size?: "sm" | "md" | "lg";
  trigger?: React.ReactNode;
  variant?: "solid" | "outline";
}

export type {
  CustomRendererProps,
  Filter,
  FilterContextValue,
  FilterFieldConfig,
  FilterFieldGroup,
  FilterFieldsConfig,
  FilterGroup,
  FilterI18nConfig,
  FilterOperator,
  FilterOperatorDropdownProps,
  FilterOption,
  FiltersContentProps,
  FiltersProps,
  FilterValueSelectorProps,
  SelectOptionsPopoverProps,
};
