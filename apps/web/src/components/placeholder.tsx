import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { ConstructionIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n/dictionary";
import { useLocale } from "@/lib/i18n/provider";

interface PlaceholderProperties {
  titleKey: MessageKey;
}

/**
 * Stands in for a feature route until Phase 4 ports it.
 *
 * Every nav item resolves to something, so the shell can be walked end to end
 * and the active-row logic exercised — while being unmistakably unfinished, so
 * nobody mistakes the scaffold for a working page.
 */
export const Placeholder = ({ titleKey }: PlaceholderProperties) => {
  const { messages } = useLocale();

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ConstructionIcon />
          </EmptyMedia>
          <EmptyTitle>{messages[titleKey]}</EmptyTitle>
          <EmptyDescription>
            Not ported yet — this route lands in Phase 4 of MIGRATION-VITE.md.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
};
