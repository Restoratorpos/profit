"use client";

import { cn } from "@repo/design-system/lib/utils";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronRight } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

// ─── Tree Context ────────────────────────────────────────────────────

interface TreeContextValue {
  expandedIds: Set<string>;
  focused: boolean;
  indent: number;
  multiSelect: boolean;
  selectedIds: Set<string>;
  selectItem: (id: string, meta: { ctrlKey: boolean }) => void;
  toggleExpanded: (id: string) => void;
}

const TreeContext = createContext<TreeContextValue | null>(null);

const useTreeContext = () => {
  const ctx = useContext(TreeContext);
  if (!ctx) {
    throw new Error("Tree components must be used within <Tree>");
  }
  return ctx;
};

// ─── TreeItem Context ────────────────────────────────────────────────

interface TreeItemContextValue {
  hasChildren: boolean;
  id: string;
  level: number;
}

const TreeItemContext = createContext<TreeItemContextValue | null>(null);

const useTreeItemContext = () => {
  const ctx = useContext(TreeItemContext);
  if (!ctx) {
    throw new Error("TreeItem sub-components must be used within <TreeItem>");
  }
  return ctx;
};

// ─── Tree (root) ─────────────────────────────────────────────────────

interface TreeProps {
  children: React.ReactNode;
  className?: string;
  defaultExpanded?: string[];
  defaultSelected?: string[];
  expanded?: string[];
  indent?: number;
  multiSelect?: boolean;
  onExpandedChange?: (ids: string[]) => void;
  onSelectedChange?: (ids: string[]) => void;
  selected?: string[];
}

function Tree({
  children,
  className,
  defaultExpanded = [],
  expanded,
  onExpandedChange,
  defaultSelected = [],
  selected,
  onSelectedChange,
  multiSelect = false,
  indent = 16,
}: TreeProps) {
  const [internalExpanded, setInternalExpanded] = useState(
    () => new Set(defaultExpanded)
  );
  const [internalSelected, setInternalSelected] = useState(
    () => new Set(defaultSelected)
  );

  const isExpandControlled = expanded !== undefined;
  const isSelectControlled = selected !== undefined;

  const expandedIds = isExpandControlled ? new Set(expanded) : internalExpanded;
  const selectedIds = isSelectControlled ? new Set(selected) : internalSelected;

  const toggleExpanded = useCallback(
    (id: string) => {
      const next = new Set(isExpandControlled ? expanded : internalExpanded);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (isExpandControlled) {
        onExpandedChange?.([...next]);
      } else {
        setInternalExpanded(next);
      }
    },
    [isExpandControlled, expanded, internalExpanded, onExpandedChange]
  );

  const selectItem = useCallback(
    (id: string, meta: { ctrlKey: boolean }) => {
      let next: Set<string>;

      if (multiSelect && meta.ctrlKey) {
        next = new Set(isSelectControlled ? selected : internalSelected);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      } else {
        next = new Set([id]);
      }

      if (isSelectControlled) {
        onSelectedChange?.([...next]);
      } else {
        setInternalSelected(next);
      }
    },
    [
      multiSelect,
      isSelectControlled,
      selected,
      internalSelected,
      onSelectedChange,
    ]
  );

  const treeRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  const getTreeTriggers = useCallback(() => {
    const tree = treeRef.current;
    if (!tree) {
      return null;
    }
    const triggers = Array.from(
      tree.querySelectorAll<HTMLElement>('[data-slot="tree-item-trigger"]')
    );
    const focused = document.activeElement as HTMLElement;
    const idx = triggers.indexOf(focused);
    if (idx === -1) {
      return null;
    }
    return { triggers, focused, idx };
  }, []);

  const focusSibling = useCallback(
    (triggers: HTMLElement[], idx: number, delta: number) => {
      const next = idx + delta;
      if (next >= 0 && next < triggers.length) {
        triggers[next]?.focus();
      }
    },
    []
  );

  const handleExpandKey = useCallback(
    (
      triggers: HTMLElement[],
      idx: number,
      focused: HTMLElement,
      collapse: boolean
    ) => {
      const itemId = focused.dataset.itemId;
      const isOpen = itemId ? expandedIds.has(itemId) : false;

      if (itemId && collapse === isOpen) {
        toggleExpanded(itemId);
      } else {
        focusSibling(triggers, idx, collapse ? -1 : 1);
      }
    },
    [expandedIds, toggleExpanded, focusSibling]
  );

  const handleArrowKey = useCallback(
    (
      key: string,
      triggers: HTMLElement[],
      idx: number,
      focused: HTMLElement,
      e: React.KeyboardEvent
    ) => {
      if (key === "ArrowDown") {
        focusSibling(triggers, idx, 1);
      } else if (key === "ArrowUp") {
        focusSibling(triggers, idx, -1);
      } else if (key === "ArrowRight") {
        handleExpandKey(triggers, idx, focused, false);
      } else if (key === "ArrowLeft") {
        handleExpandKey(triggers, idx, focused, true);
      }
      e.preventDefault();
    },
    [focusSibling, handleExpandKey]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const ctx = getTreeTriggers();
      if (!ctx) {
        return;
      }
      const { triggers, focused, idx } = ctx;

      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "ArrowRight":
        case "ArrowLeft": {
          handleArrowKey(e.key, triggers, idx, focused, e);
          break;
        }
        case "Home": {
          triggers[0]?.focus();
          e.preventDefault();
          break;
        }
        case "End": {
          triggers.at(-1)?.focus();
          e.preventDefault();
          break;
        }
        case "Enter":
        case " ": {
          focused.click();
          e.preventDefault();
          break;
        }
        default:
          break;
      }
    },
    [getTreeTriggers, handleArrowKey]
  );

  const value = useMemo(
    () => ({
      expandedIds,
      selectedIds,
      toggleExpanded,
      selectItem,
      indent,
      multiSelect,
      focused,
    }),
    [
      expandedIds,
      selectedIds,
      toggleExpanded,
      selectItem,
      indent,
      multiSelect,
      focused,
    ]
  );

  return (
    <TreeContext.Provider value={value}>
      <div
        className={cn("text-body", className)}
        data-slot="tree"
        onBlur={(e) => {
          if (!treeRef.current?.contains(e.relatedTarget)) {
            setFocused(false);
          }
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        ref={treeRef}
        role="tree"
      >
        {children}
      </div>
    </TreeContext.Provider>
  );
}

// ─── TreeItem ────────────────────────────────────────────────────────

interface TreeItemProps {
  children: React.ReactNode;
  className?: string;
  id: string;
  level?: number;
}

function TreeItem({ children, className, id, level = 0 }: TreeItemProps) {
  const { expandedIds } = useTreeContext();
  const isExpanded = expandedIds.has(id);

  const hasChildren = (() => {
    const arr = Array.isArray(children) ? children : [children];
    return arr.some(
      (child) =>
        child &&
        typeof child === "object" &&
        "type" in child &&
        child.type === TreeItemContent
    );
  })();

  const itemValue = useMemo(
    () => ({ id, level, hasChildren }),
    [id, level, hasChildren]
  );

  return (
    <TreeItemContext.Provider value={itemValue}>
      <Collapsible.Root
        className={className}
        data-slot="tree-item"
        open={isExpanded}
      >
        {children}
      </Collapsible.Root>
    </TreeItemContext.Provider>
  );
}

// ─── TreeItemTrigger ─────────────────────────────────────────────────

interface TreeItemTriggerProps {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

function TreeItemTrigger({
  children,
  className,
  onClick,
}: TreeItemTriggerProps) {
  const {
    expandedIds,
    selectedIds,
    toggleExpanded,
    selectItem,
    indent,
    focused: treeFocused,
  } = useTreeContext();
  const { id, level, hasChildren } = useTreeItemContext();

  const isExpanded = expandedIds.has(id);
  const isSelected = selectedIds.has(id);

  const chevronClass = hasChildren
    ? cn(
        "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
        isExpanded && "rotate-90"
      )
    : "h-3 w-3 shrink-0 invisible";

  const selectedClass = treeFocused
    ? "bg-accent text-foreground"
    : "bg-accent/50 text-foreground";

  return (
    <Collapsible.Trigger asChild>
      <button
        className={cn(
          "group/trigger flex h-5.5 w-full cursor-pointer items-center gap-1 pr-2 text-left text-body outline-none",
          isSelected ? selectedClass : "text-foreground/80 hover:bg-accent/50",
          className
        )}
        data-item-id={id}
        data-selected={isSelected || undefined}
        data-slot="tree-item-trigger"
        onClick={(e) => {
          if (hasChildren) {
            toggleExpanded(id);
          }
          selectItem(id, { ctrlKey: e.ctrlKey || e.metaKey });
          onClick?.(e);
        }}
        style={{ paddingLeft: level * indent + 4 }}
        type="button"
      >
        <ChevronRight className={chevronClass} />
        {children}
      </button>
    </Collapsible.Trigger>
  );
}

// ─── TreeItemContent ─────────────────────────────────────────────────

interface TreeItemContentProps {
  children: React.ReactNode;
  className?: string;
}

function TreeItemContent({ children, className }: TreeItemContentProps) {
  const { level } = useTreeItemContext();

  const enriched = enrichChildren(children, level + 1);

  return (
    <Collapsible.Content
      className={className}
      data-slot="tree-item-content"
      role="group"
    >
      {enriched}
    </Collapsible.Content>
  );
}

// ─── TreeItemIcon ────────────────────────────────────────────────────

interface TreeItemIconProps {
  children: React.ReactNode;
  className?: string;
}

function TreeItemIcon({ children, className }: TreeItemIconProps) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground",
        className
      )}
      data-slot="tree-item-icon"
    >
      {children}
    </span>
  );
}

// ─── TreeItemLabel ───────────────────────────────────────────────────

type TreeItemLabelProps = React.ComponentProps<"span">;

function TreeItemLabel({ className, ...props }: TreeItemLabelProps) {
  return (
    <span
      className={cn("flex-1 truncate", className)}
      data-slot="tree-item-label"
      {...props}
    />
  );
}

// ─── TreeItemAction ──────────────────────────────────────────────────

interface TreeItemActionProps {
  children: React.ReactNode;
  className?: string;
}

function TreeItemAction({ children, className }: TreeItemActionProps) {
  return (
    <span
      className={cn(
        "ml-auto flex items-center gap-0.5 opacity-0 group-hover/trigger:opacity-100",
        className
      )}
      data-slot="tree-item-action"
    >
      {children}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function enrichChildren(
  children: React.ReactNode,
  level: number
): React.ReactNode {
  const arr = Array.isArray(children) ? children : [children];
  return arr.map((child) => {
    if (
      child &&
      typeof child === "object" &&
      "type" in child &&
      child.type === TreeItem
    ) {
      return { ...child, props: { ...child.props, level } };
    }
    return child;
  });
}

// ─── Exports ─────────────────────────────────────────────────────────

export {
  Tree,
  TreeItem,
  TreeItemAction,
  TreeItemContent,
  TreeItemIcon,
  TreeItemLabel,
  TreeItemTrigger,
};
