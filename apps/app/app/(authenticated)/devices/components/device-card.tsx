"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import {
  DoorOpenIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlugZapIcon,
  UsersIcon,
  WifiIcon,
} from "lucide-react";
import {
  type DeviceView,
  directionLabel,
  formatWhen,
  isOnline,
} from "@/lib/devices";
import type { Messages } from "@/lib/i18n/dictionary";
import { DeleteConfirmButton } from "../../products/components/delete-confirm-button";

/** What the last action on this terminal said. */
export interface DeviceNote {
  isError: boolean;
  text: string;
}

interface DeviceCardProperties {
  device: DeviceView;
  isBusy: boolean;
  isDeleting: boolean;
  messages: Messages;
  /** Null when the last action was on some other terminal. */
  note: DeviceNote | null;
  onDelete: () => void;
  onDoor: () => void;
  onEdit: () => void;
  onPeople: () => void;
  onPush: () => void;
  onSync: () => void;
  onTest: () => void;
}

/**
 * One terminal. Everything that talks to the hardware is one tap from here —
 * testing it, pointing it at us, pulling what it buffered, and letting somebody
 * in — because when a door is not working nobody wants to go looking through
 * a settings tree for the button that proves it.
 */
export const DeviceCard = ({
  device,
  isBusy,
  isDeleting,
  messages,
  note,
  onDelete,
  onDoor,
  onEdit,
  onPeople,
  onPush,
  onSync,
  onTest,
}: DeviceCardProperties) => {
  const online = isOnline(device);

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{device.name}</p>
            {/* Icon as well as colour: "no contact" has to survive a washed-out
                desk monitor. */}
            <Badge
              className={cn(
                online
                  ? "border-primary/40 text-primary-accent"
                  : "text-muted-foreground"
              )}
              variant="outline"
            >
              <WifiIcon className="size-3.5" />
              {online
                ? messages["devices.online"]
                : messages["devices.offline"]}
            </Badge>
            {device.isActive ? null : (
              <Badge variant="secondary">
                {messages["devices.fieldActive"]}: —
              </Badge>
            )}
          </div>
          <p className="truncate text-muted-foreground text-sm tabular-nums">
            {device.ipAddress}:{device.port ?? 80}
            {device.location ? ` · ${device.location}` : ""}
          </p>
          <p className="text-muted-foreground text-sm">
            {directionLabel(device.direction, messages)}
            {" · "}
            {messages["devices.enrolled"]}: {device.enrolledCount}
            {" · "}
            {messages["devices.lastSeen"]}: {formatWhen(device.lastSeen)}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`${messages["common.edit"]}: ${device.name}`}
              className="text-muted-foreground"
              size="icon-sm"
              variant="ghost"
            >
              <EllipsisVerticalIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon className="size-5" />
                {messages["common.edit"]}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onPush}>
                <PlugZapIcon className="size-5" />
                {messages["devices.enablePush"]}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onSync}>
                <DownloadIcon className="size-5" />
                {messages["devices.sync"]}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDoor}>
                <DoorOpenIcon className="size-5" />
                {messages["devices.openDoor"]}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {note ? (
        // `output` rather than a div with role="status": this genuinely is the
        // result of the action the operator just triggered, and it is announced.
        <output
          className={cn(
            "mt-3 block rounded-lg px-3 py-2 text-sm",
            note.isError
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          )}
        >
          {note.text}
        </output>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={isBusy} onClick={onTest} size="sm" variant="outline">
          {isBusy ? <Spinner /> : <WifiIcon className="size-4" />}
          {messages["devices.test"]}
        </Button>
        <Button onClick={onPeople} size="sm" variant="outline">
          <UsersIcon className="size-4" />
          {messages["devices.people"]}
        </Button>
        <div className="ml-auto">
          <DeleteConfirmButton
            isPending={isDeleting}
            itemName={device.name}
            messages={messages}
            onConfirm={onDelete}
            warning={
              device.enrolledCount > 0
                ? `${messages["devices.enrolled"]}: ${device.enrolledCount}`
                : null
            }
          />
        </div>
      </div>
    </div>
  );
};
