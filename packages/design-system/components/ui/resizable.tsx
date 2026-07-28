"use client";

import { cn } from "@repo/design-system/lib/utils";
import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  type PanelImperativeHandle,
  Separator,
} from "react-resizable-panels";

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return <Group className={cn("flex h-full w-full", className)} {...props} />;
}

function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof Panel>) {
  return <Panel className={cn("overflow-hidden", className)} {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) {
  return (
    <Separator
      className={cn(
        "relative flex w-px items-center justify-center bg-border transition-colors after:absolute after:inset-y-0 after:-right-2 after:-left-2 after:cursor-col-resize after:content-[''] hover:bg-primary data-[resize-handle-active]:bg-primary",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center border bg-border">
          <GripVertical className="h-2.5 w-2.5" />
        </div>
      )}
    </Separator>
  );
}

export {
  type PanelImperativeHandle,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
};
