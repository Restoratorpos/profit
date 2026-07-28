import { cn } from "@repo/design-system/lib/utils";
import { Loader2Icon } from "lucide-react";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      aria-label="Loading"
      className={cn("size-5 animate-spin", className)}
      role="status"
      {...props}
    />
  );
}

export { Spinner };
