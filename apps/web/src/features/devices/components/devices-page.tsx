import { Spinner } from "@repo/design-system/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { membersPageQuery } from "@/features/members";
import { DEFAULT_MEMBER_QUERY } from "@/features/members/types";
import { workersPageQuery } from "@/features/workers";
import { DEFAULT_WORKER_QUERY, rangeForPreset } from "@/features/workers/types";
import { useLocale } from "@/lib/i18n/provider";
import { useDevices, useInsideCount, useRecentEvents } from "../api";
import { DevicesView } from "./devices-view";

/**
 * What `app/(authenticated)/devices/page.tsx` was.
 *
 * Workers and members are here because enrolling somebody is a pick from a
 * list, not a typed id. Both come from their own feature's paged query rather
 * than the unpaged endpoints the server component used — those return the whole
 * roster and staff list to populate two comboboxes.
 */
export const DevicesPage = () => {
  const { messages } = useLocale();
  const devices = useDevices();
  const events = useRecentEvents();
  const inside = useInsideCount();

  const members = useQuery(membersPageQuery(DEFAULT_MEMBER_QUERY));
  const workers = useQuery(
    workersPageQuery(DEFAULT_WORKER_QUERY, rangeForPreset("this-month"))
  );

  const failure = devices.error ?? events.error ?? inside.error;

  if (failure) {
    return (
      <p
        className="m-6 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-4 py-3 font-medium text-destructive"
        role="alert"
      >
        {failure.message}
      </p>
    );
  }

  /*
   * Only the three that draw the screen gate rendering. The member and worker
   * lists fill pickers inside the enrol sheet, so holding the terminals back
   * for them would trade a visible page for a spinner nobody asked for.
   */
  if (!(devices.data && events.data && inside.data)) {
    return (
      <output
        aria-label={messages["devices.title"]}
        className="flex flex-1 items-center justify-center py-20"
      >
        <Spinner className="size-8" />
      </output>
    );
  }

  return (
    <DevicesView
      devices={devices.data}
      events={events.data}
      insideCount={inside.data.count}
      members={members.data?.rows ?? []}
      messages={messages}
      workers={workers.data?.rows ?? []}
    />
  );
};
