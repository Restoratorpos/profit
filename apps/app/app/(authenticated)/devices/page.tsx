import type { Metadata } from "next";
import { backendFetch } from "@/lib/backend";
import type { AttendanceEventView, DeviceView } from "@/lib/devices";
import { getMessages } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import type { MemberListItem } from "@/lib/members";
import type { WorkerListItem } from "@/lib/workers";
import { DevicesView } from "./components/devices-view";

export const metadata: Metadata = {
  title: "Terminallar",
};

const DevicesPage = async () => {
  // Independent of each other, so all are in flight at once. Workers and members
  // are here because enrolling somebody is a pick from a list, not a typed id.
  const devicesPromise = backendFetch<DeviceView[]>("/devices");
  const eventsPromise =
    backendFetch<AttendanceEventView[]>("/attendance/events");
  const insidePromise = backendFetch<{ count: number }>("/attendance/inside");
  const workersPromise = backendFetch<WorkerListItem[]>("/workers");
  const membersPromise = backendFetch<MemberListItem[]>("/members");
  const localePromise = getLocale();

  const [devices, events, inside, workers, members, locale] = await Promise.all(
    [
      devicesPromise,
      eventsPromise,
      insidePromise,
      workersPromise,
      membersPromise,
      localePromise,
    ]
  );

  return (
    <DevicesView
      devices={devices}
      events={events}
      insideCount={inside.count}
      members={members}
      messages={getMessages(locale)}
      workers={workers}
    />
  );
};

export default DevicesPage;
