import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { cn } from "@repo/design-system/lib/utils";
import { PlusIcon, ScanFaceIcon } from "lucide-react";
import { useState } from "react";
import type { MemberListItem } from "@/features/members/types";
import type { WorkerListItem } from "@/features/workers/types";
import type { Messages } from "@/lib/i18n/dictionary";
import { useLocale } from "@/lib/i18n/provider";
import {
  useDeleteDevice,
  useEnablePush,
  useEnrolledPeople,
  useOpenDoor,
  useSyncEvents,
  useTestDevice,
} from "../api";
import {
  type AttendanceEventView,
  type DeviceView,
  type EnrolledPerson,
  formatWhen,
} from "../types";
import { DeviceCard } from "./device-card";
import { DeviceSheet } from "./device-sheet";
import { EnrollSheet } from "./enroll-sheet";

interface DevicesViewProperties {
  devices: readonly DeviceView[];
  events: readonly AttendanceEventView[];
  insideCount: number;
  members: readonly MemberListItem[];
  messages: Messages;
  workers: readonly WorkerListItem[];
}

/** What the last action on a terminal said, shown under its row. */
interface Note {
  deviceId: string;
  isError: boolean;
  text: string;
}

export const DevicesView = ({
  devices,
  events,
  insideCount,
  members,
  messages,
  workers,
}: DevicesViewProperties) => {
  const { locale } = useLocale();
  const [editing, setEditing] = useState<DeviceView | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [managing, setManaging] = useState<DeviceView | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  /*
   * The panel's list is a query keyed by device, so opening a terminal twice is
   * a cache hit and a slow reply for a terminal the operator has since closed
   * cannot land on the one now on screen.
   */
  const people = useEnrolledPeople(managing?.id ?? null);
  const enrolled: EnrolledPerson[] = people.data ?? [];
  const isLoadingPeople = managing !== null && people.isPending;

  const testDevice = useTestDevice();
  const enablePush = useEnablePush();
  const syncEvents = useSyncEvents();
  const openDoor = useOpenDoor();
  const deleteDevice = useDeleteDevice();

  /*
   * One busy row at a time, whichever hardware call is in flight. `variables` is
   * the device id the call was made against, which is exactly the card to show
   * the wait on.
   */
  const busyId =
    (testDevice.isPending ? testDevice.variables : null) ??
    (enablePush.isPending ? enablePush.variables : null) ??
    (syncEvents.isPending ? syncEvents.variables.deviceId : null) ??
    (openDoor.isPending ? openDoor.variables : null);

  const deletingId = deleteDevice.isPending ? deleteDevice.variables : null;

  const openPeople = (device: DeviceView) => {
    setManaging(device);
  };

  /**
   * Runs one hardware call and turns whatever came back into the note under the
   * card.
   *
   * `mutateAsync` rather than `mutate` because the message is built from the
   * terminal's own answer — its model, the push destination, how many events
   * were read. A bare "it worked" would not tell the operator which part of the
   * connection is wrong when it does not.
   */
  const report = async (
    deviceId: string,
    work: () => Promise<string | null>
  ) => {
    setNote(null);

    try {
      const text = await work();

      if (text !== null) {
        setNote({ deviceId, isError: false, text });
      }
    } catch (cause) {
      setNote({ deviceId, isError: true, text: (cause as Error).message });
    }
  };

  const handleTest = (device: DeviceView) =>
    report(device.id, async () => {
      const info = await testDevice.mutateAsync(device.id);

      return `${messages["devices.testOk"]} — ${info.model ?? ""} ${
        info.firmwareVersion ?? ""
      }`.trim();
    });

  const handlePush = (device: DeviceView) =>
    report(device.id, async () => {
      const destination = await enablePush.mutateAsync(device.id);

      return `${messages["devices.pushOk"]} — ${destination.host}:${destination.port}`;
    });

  const handleSync = (device: DeviceView) =>
    report(device.id, async () => {
      const result = await syncEvents.mutateAsync({ deviceId: device.id });

      return `${messages["devices.syncOk"]}: ${result.read ?? 0} · ${
        result.recorded ?? 0
      }`;
    });

  // The door either opens or explains itself; there is nothing to say on success.
  const handleDoor = (device: DeviceView) =>
    report(device.id, async () => {
      await openDoor.mutateAsync(device.id);

      return null;
    });

  const handleDelete = (deviceId: string) => {
    deleteDevice.mutate(deviceId);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="sr-only">{messages["devices.title"]}</h1>
          <p className="text-muted-foreground text-sm">
            {messages["devices.subtitle"]}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-baseline gap-2 rounded-lg bg-muted/50 px-4 py-2.5">
            <span className="text-muted-foreground text-sm">
              {messages["devices.inside"]}
            </span>
            <span className="font-semibold tabular-nums">{insideCount}</span>
          </div>
          <Button onClick={() => setIsCreating(true)}>
            <PlusIcon className="size-5" />
            {messages["devices.add"]}
          </Button>
        </div>
      </div>

      {devices.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScanFaceIcon />
            </EmptyMedia>
            <EmptyTitle className="text-base">
              {messages["devices.empty"]}
            </EmptyTitle>
            <EmptyDescription>{messages["devices.emptyHint"]}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setIsCreating(true)}>
              <PlusIcon className="size-5" />
              {messages["devices.add"]}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {devices.map((device) => (
            <DeviceCard
              device={device}
              isBusy={busyId === device.id}
              isDeleting={deletingId === device.id}
              key={device.id}
              messages={messages}
              note={note?.deviceId === device.id ? note : null}
              onDelete={() => handleDelete(device.id)}
              onDoor={() => handleDoor(device)}
              onEdit={() => setEditing(device)}
              onPeople={() => openPeople(device)}
              onPush={() => handlePush(device)}
              onSync={() => handleSync(device)}
              onTest={() => handleTest(device)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="font-medium text-sm">{messages["devices.recent"]}</p>

        {events.length === 0 ? (
          <p className="rounded-xl border py-8 text-center text-muted-foreground text-sm">
            {messages["devices.noRecent"]}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.map((event) => (
              <div
                className="flex items-center gap-3 rounded-lg border px-3 py-2"
                key={event.id}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    event.direction === "out"
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary-accent"
                  )}
                >
                  <ScanFaceIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {event.personName ?? event.personId ?? "—"}
                  </p>
                  <p className="truncate text-muted-foreground text-sm">
                    {event.direction === "out"
                      ? messages["devices.directionOutShort"]
                      : messages["devices.directionInShort"]}
                    {" · "}
                    {event.source === "manual"
                      ? messages["devices.sourceManual"]
                      : messages["devices.sourceFace"]}
                    {event.deviceName ? ` · ${event.deviceName}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-muted-foreground text-sm tabular-nums">
                  {formatWhen(event.time, locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Keyed so a second terminal opens a fresh form rather than the first
          one's values — the fields are initialised from props exactly once. */}
      <DeviceSheet
        device={editing}
        key={editing?.id ?? "new"}
        messages={messages}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setIsCreating(false);
          }
        }}
        open={isCreating || Boolean(editing)}
      />

      <EnrollSheet
        device={managing}
        enrolled={enrolled}
        isLoading={isLoadingPeople}
        members={members}
        messages={messages}
        onOpenChange={(open) => setManaging(open ? managing : null)}
        workers={workers}
      />
    </div>
  );
};
