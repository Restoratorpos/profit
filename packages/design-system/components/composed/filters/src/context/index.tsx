"use client";

import { createContext, useContext } from "react";
import { DEFAULT_I18N } from "../constants";
import type { FilterContextValue } from "../types";

const FilterContext = createContext<FilterContextValue>({
  variant: "outline",
  size: "md",
  radius: "md",
  i18n: DEFAULT_I18N,
  cursorPointer: true,
  className: undefined,
  showAddButton: true,
  addButtonText: undefined,
  addButtonIcon: undefined,
  addButtonClassName: undefined,
  addButton: undefined,
  showSearchInput: true,
  trigger: undefined,
  allowMultiple: true,
});

const useFilterContext = () => useContext(FilterContext);

export { FilterContext, useFilterContext };
