"use client";

import { formatPhone } from "@repo/auth/lib/countries";
import { Badge } from "@repo/design-system/components/ui/badge";
import { FieldError } from "@repo/design-system/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { CalendarIcon, ClockIcon, PhoneIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/catalog";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/dictionary";
import {
  formatDay,
  formatHours,
  formatStamp,
  initialOf,
  positionLabelKey,
  type WorkerDetail,
  type WorkerListItem,
} from "@/lib/workers";
import { loadWorkerDetailAction } from "../actions";

const StatCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClockIcon;
  label: string;
  value: string;
}) => (
  <div className="flex flex-col gap-1 rounded-xl border p-3">
    <span className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
      <Icon className="size-3.5" />
      {label}
    </span>
    <span className="truncate font-semibold">{value}</span>
  </div>
);

const AttendanceTable = ({
  detail,
  locale,
  messages,
}: {
  detail: WorkerDetail;
  locale: Locale;
  messages: Messages;
}) => {
  if (detail.sessions.length === 0) {
    return (
      <p className="rounded-xl border py-8 text-center text-muted-foreground text-sm">
        {messages["workers.noAttendance"]}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
            <th className="px-3 py-2 text-left font-medium">
              {messages["workers.colCheckIn"]}
            </th>
            <th className="px-3 py-2 text-left font-medium">
              {messages["workers.colCheckOut"]}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {messages["workers.colWorked"]}
            </th>
          </tr>
        </thead>
        <tbody>
          {detail.sessions.map((session) => (
            <tr className="border-b last:border-0" key={session.id}>
              <td className="px-3 py-2 font-medium">
                {formatStamp(session.checkIn, locale)}
              </td>
              <td className="px-3 py-2">
                {session.open ? (
                  <Badge className="border-transparent bg-primary/15 text-primary-accent">
                    {messages["workers.onShift"]}
                  </Badge>
                ) : (
                  formatStamp(session.checkOut, locale)
                )}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                {formatHours(session.minutesWorked)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const DetailBody = ({
  detail,
  locale,
  messages,
}: {
  detail: WorkerDetail;
  locale: Locale;
  messages: Messages;
}) => {
  const { worker } = detail;
  const isHourly = worker.salaryType === "hourly";

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          icon={ClockIcon}
          label={
            isHourly
              ? messages["workers.hourlyRateLabel"]
              : messages["workers.monthlySalary"]
          }
          value={formatMoney(worker.salaryAmount)}
        />
        <StatCard
          icon={PhoneIcon}
          label={messages["workers.phoneLabel"]}
          value={worker.phone ? formatPhone(worker.phone) : "—"}
        />
        <StatCard
          icon={CalendarIcon}
          label={messages["workers.hireDateLabel"]}
          value={formatDay(worker.hiredAt, locale)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 rounded-xl border p-3">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            {messages["workers.detailSessions"]}
          </span>
          <span className="font-semibold text-xl">{detail.sessionCount}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border p-3">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            {messages["workers.detailWorked"]}
          </span>
          <span className="font-semibold text-xl">
            {formatHours(detail.totalMinutes)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            {messages["workers.recentAttendance"]}
          </h3>
          <span className="text-muted-foreground text-xs">
            {detail.sessionCount} {messages["workers.entries"]}
          </span>
        </div>
        <AttendanceTable detail={detail} locale={locale} messages={messages} />
      </div>
    </div>
  );
};

export const WorkerDetailSheet = ({
  from,
  locale,
  messages,
  onOpenChange,
  summary,
  to,
}: {
  from: string;
  locale: Locale;
  messages: Messages;
  onOpenChange: (open: boolean) => void;
  summary: WorkerListItem | null;
  to: string;
}) => {
  const [detail, setDetail] = useState<WorkerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const workerId = summary?.id ?? null;

  // Keyed remount per worker (see WorkersView), so this runs once when the
  // drawer opens and never races an id change.
  useEffect(() => {
    if (!workerId) {
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setLoadError(null);

    loadWorkerDetailAction(workerId, from, to).then((result) => {
      if (cancelled) {
        return;
      }

      if (result.ok && result.detail) {
        setDetail(result.detail);
      } else {
        setLoadError(result.error ?? "Something went wrong.");
      }

      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [workerId, from, to]);

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <Spinner aria-label={messages["workers.title"]} />
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <FieldError role="alert">{loadError}</FieldError>
        </div>
      );
    }

    if (!detail) {
      return null;
    }

    return <DetailBody detail={detail} locale={locale} messages={messages} />;
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={summary !== null}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        side="right"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-semibold text-primary-accent">
              {initialOf(summary?.name ?? "")}
            </span>
            <span className="flex flex-col">
              {summary?.name}
              {summary?.role ? (
                <span className="font-normal text-muted-foreground text-sm">
                  {messages[positionLabelKey(summary.role)]}
                </span>
              ) : null}
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            {summary?.name}
          </SheetDescription>
        </SheetHeader>

        {renderBody()}
      </SheetContent>
    </Sheet>
  );
};
