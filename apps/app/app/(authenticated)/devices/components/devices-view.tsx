"use client";

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
import {
  type AttendanceEventView,
  type DeviceView,
  type EnrolledPerson,
  formatWhen,
} from "@/lib/devices";
import type { Messages } from "@/lib/i18n/dictionary";
import type { MemberListItem } from "@/lib/members";
import type { WorkerListItem } from "@/lib/workers";
import {
  deleteDeviceAction,
  enablePushAction,
  loadEnrolledAction,
  openDoorAction,
  syncEventsAction,
  testDeviceAction,
} from "../actions";
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
  const [editing, setEditing] = useState<DeviceView | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [managing, setManaging] = useState<DeviceView | null>(null);
  const [enrolled, setEnrolled] = useState<EnrolledPerson[]>([]);
  const [isLoadingPeople, setIsLoadingPeople] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  const loadPeople = async (device: DeviceView) => {
    setIsLoadingPeople(true);

    const result = await loadEnrolledAction(device.id);

    setEnrolled(result.people);
    setIsLoadingPeople(false);
  };

  const openPeople = async (device: DeviceView) => {
    setManaging(device);
    setEnrolled([]);
    await loadPeople(device);
  };

  const handleTest = async (device: DeviceView) => {
    setBusyId(device.id);
    setNote(null);

    const result = await testDeviceAction(device.id);

    setBusyId(null);
    setNote({
      deviceId: device.id,
      isError: !result.ok,
      text: result.ok
        ? `${messages["devices.testOk"]} — ${result.info?.model ?? ""} ${
            result.info?.firmwareVersion ?? ""
          }`.trim()
        : (result.error ?? ""),
    });
  };

  const handlePush = async (device: DeviceView) => {
    setBusyId(device.id);
    setNote(null);

    const result = await enablePushAction(device.id);

    setBusyId(null);
    setNote({
      deviceId: device.id,
      isError: !result.ok,
      text: result.ok
        ? `${messages["devices.pushOk"]} — ${result.destination?.host}:${result.destination?.port}`
        : (result.error ?? ""),
    });
  };

  const handleSync = async (device: DeviceView) => {
    setBusyId(device.id);
    setNote(null);

    const result = await syncEventsAction(device.id);

    setBusyId(null);
    setNote({
      deviceId: device.id,
      isError: !result.ok,
      text: result.ok
        ? `${messages["devices.syncOk"]}: ${result.result?.read ?? 0} · ${
            result.result?.recorded ?? 0
          }`
        : (result.error ?? ""),
    });
  };

  const handleDoor = async (device: DeviceView) => {
    setBusyId(device.id);
    setNote(null);

    const result = await openDoorAction(device.id);

    setBusyId(null);

    if (!result.ok) {
      setNote({ deviceId: device.id, isError: true, text: result.error ?? "" });
    }
  };

  const handleDelete = async (deviceId: string) => {
    setDeletingId(deviceId);
    await deleteDeviceAction(deviceId);
    setDeletingId(null);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
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
                  {formatWhen(event.time)}
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
        onReload={() => managing && loadPeople(managing)}
        workers={workers}
      />
    </div>
  );
};
