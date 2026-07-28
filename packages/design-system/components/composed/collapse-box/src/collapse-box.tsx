"use client";
import { cn } from "@repo/design-system/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@radix-ui/react-collapsible";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { createContext, useContext, useState } from "react";

// Context to share "open" state
type CollapseContextType = {
  open: boolean;
  setOpen: (value: boolean) => void;
};
const CollapseContext = createContext<CollapseContextType | null>(null);

const useCollapse = () => {
  const ctx = useContext(CollapseContext);
  if (!ctx) {
    throw new Error(
      "CollapseBox components must be used inside <CollapseBox.Container>"
    );
  }
  return ctx;
};

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

/**
 * `CollapseBox.Container`
 *
 * Root wrapper for the collapse box.
 * Handles both **controlled** (`open`, `onOpenChange`) and **uncontrolled** (`defaultOpen`) usage.
 *
 * @example
 * ```tsx
 * <CollapseBox.Container defaultOpen>
 *   <CollapseBox.Trigger>Section Title</CollapseBox.Trigger>
 *   <CollapseBox.Content>Content here</CollapseBox.Content>
 * </CollapseBox.Container>
 * ```
 */
const Container = ({
  children,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  className,
}: ContainerProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = (val: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(val);
    }
    onOpenChange?.(val);
  };

  return (
    <CollapseContext.Provider value={{ open, setOpen }}>
      <Collapsible
        className={cn(
          "h-fit overflow-hidden rounded-md border shadow-xs",
          className
        )}
        onOpenChange={setOpen}
        open={open}
      >
        {children}
      </Collapsible>
    </CollapseContext.Provider>
  );
};

Container.displayName = "StriveUI.CollapseBox.Container";

interface TriggerProps {
  children: React.ReactNode;
  className?: string;
  classNames?: {
    trigger?: string;
    triggerContent?: string;
    triggerIcon?: string;
    triggerIndicator?: string;
  };
  hasAnimationIndicator?: boolean;
  hasIndicator?: boolean;
  indicatorRenderer?: React.ReactNode;
}

/**
 * `CollapseBox.Trigger`
 *
 * The clickable header of the collapse box.
 * Supports an optional indicator (default: `ChevronDown`) which rotates on toggle.
 */
const Trigger = ({
  children,
  className,
  classNames,
  hasIndicator = true,
  indicatorRenderer = <ChevronDown className="h-4 w-4 text-muted-foreground" />,
  hasAnimationIndicator = true,
}: TriggerProps) => {
  const { open } = useCollapse();
  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 font-medium shadow-xs transition-colors hover:bg-[var(--layer-hover-01)]",
        classNames?.trigger,
        className
      )}
    >
      <div className={cn("flex-1", classNames?.triggerContent)}>{children}</div>
      {hasIndicator && (
        <motion.div
          animate={hasAnimationIndicator ? { rotate: open ? 180 : 0 } : {}}
          className={cn(classNames?.triggerIndicator)}
          transition={{ duration: 0.25, ease: "easeInOut" }}
        >
          {indicatorRenderer}
        </motion.div>
      )}
    </CollapsibleTrigger>
  );
};

Trigger.displayName = "StriveUI.CollapseBox.Trigger";

interface ContentProps {
  children: React.ReactNode;
  classNames?: {
    content?: string;
    contentWrapper?: string;
  };
}

/**
 * `CollapseBox.Content`
 *
 * The collapsible body area.
 * Uses `framer-motion` animations for expand/collapse transitions.
 */
const Content = ({ children, classNames }: ContentProps) => {
  const { open } = useCollapse();

  return (
    <AnimatePresence>
      {open && (
        <CollapsibleContent
          asChild
          className={cn("border-t bg-muted", classNames?.content)}
          forceMount
        >
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div
              className={cn(
                "flex flex-col items-start gap-2 px-3 py-2",
                classNames?.contentWrapper
              )}
            >
              {children}
            </div>
          </motion.div>
        </CollapsibleContent>
      )}
    </AnimatePresence>
  );
};

Content.displayName = "StriveUI.CollapseBox.Content";

// Attach compound components
const CollapseBox = {
  Container,
  Trigger,
  Content,
};

export {
  CollapseBox,
  type ContainerProps,
  type ContentProps,
  type TriggerProps,
};
