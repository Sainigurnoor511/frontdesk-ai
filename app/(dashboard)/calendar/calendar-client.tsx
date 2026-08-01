"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CaretLeftIcon,
  CaretRightIcon,
  CaretDownIcon,
  FunnelIcon,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createAppointment, createTimeOff } from "./actions";
import type { AppointmentRow, TimeOffRow } from "@/lib/data/calendar";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VIEWS = ["Week", "Day", "Month"] as const;
type ViewMode = (typeof VIEWS)[number];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const BUSINESS_START = 9;
const BUSINESS_END = 17;

function formatHourLabel(hour: number) {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(displayHour).padStart(2, "0")}:00 ${period}`;
}

function getWeekDates(anchor: Date) {
  const start = new Date(anchor);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatMonthYear(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function hourOfDay(date: Date) {
  return date.getHours() + date.getMinutes() / 60;
}

type CalendarClientProps = {
  initialAppointments: AppointmentRow[];
  initialTimeOff: TimeOffRow[];
  initialAnchorDate: string;
};

export function CalendarClient({
  initialAppointments,
  initialTimeOff,
  initialAnchorDate,
}: CalendarClientProps) {
  const [anchorDate, setAnchorDate] = React.useState(
    () => new Date(initialAnchorDate)
  );
  const [view, setView] = React.useState<ViewMode>("Week");
  const [newAppointmentOpen, setNewAppointmentOpen] = React.useState(false);
  const [newTimeOffOpen, setNewTimeOffOpen] = React.useState(false);

  const today = React.useMemo(() => new Date(), []);
  const weekDates = React.useMemo(() => getWeekDates(anchorDate), [anchorDate]);
  const currentHour = hourOfDay(today);

  const goToPrevious = () => {
    const next = new Date(anchorDate);
    next.setDate(next.getDate() - 7);
    setAnchorDate(next);
  };

  const goToNext = () => {
    const next = new Date(anchorDate);
    next.setDate(next.getDate() + 7);
    setAnchorDate(next);
  };

  const goToToday = () => setAnchorDate(new Date(today));

  const appointmentsByDay = React.useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const date of weekDates) {
      map.set(date.toDateString(), []);
    }
    for (const appointment of initialAppointments) {
      const start = new Date(appointment.starts_at);
      const key = start.toDateString();
      if (map.has(key)) {
        map.get(key)!.push(appointment);
      }
    }
    return map;
  }, [initialAppointments, weekDates]);

  const timeOffByDay = React.useMemo(() => {
    const map = new Map<string, TimeOffRow[]>();
    for (const date of weekDates) {
      map.set(date.toDateString(), []);
    }
    for (const timeOff of initialTimeOff) {
      const start = new Date(timeOff.starts_at);
      const end = new Date(timeOff.ends_at);
      for (const date of weekDates) {
        if (date >= startOfDay(start) && date <= endOfDay(end)) {
          map.get(date.toDateString())?.push(timeOff);
        }
      }
    }
    return map;
  }, [initialTimeOff, weekDates]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-muted-foreground">
          View and manage appointments and time off.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="gap-1.5">
                {formatMonthYear(anchorDate)}
                <CaretDownIcon className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={goToToday}>
              {formatMonthYear(today)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous period"
            onClick={goToPrevious}
          >
            <CaretLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next period"
            onClick={goToNext}
          >
            <CaretRightIcon className="size-4" />
          </Button>
        </div>

        <Button variant="outline" onClick={goToToday}>
          Today
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="gap-1.5">
                {view}
                <CaretDownIcon className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {VIEWS.map((v) => (
              <DropdownMenuItem key={v} onClick={() => setView(v)}>
                {v}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          <Dialog open={newAppointmentOpen} onOpenChange={setNewAppointmentOpen}>
            <DialogTrigger render={<Button variant="default">New appointment</Button>} />
            <NewAppointmentDialog
              defaultDate={anchorDate}
              onClose={() => setNewAppointmentOpen(false)}
            />
          </Dialog>

          <Dialog open={newTimeOffOpen} onOpenChange={setNewTimeOffOpen}>
            <DialogTrigger render={<Button variant="outline">New time off</Button>} />
            <NewTimeOffDialog
              defaultDate={anchorDate}
              onClose={() => setNewTimeOffOpen(false)}
            />
          </Dialog>

          <Button variant="outline" size="icon" aria-label="Filters">
            <FunnelIcon className="size-4" />
          </Button>
        </div>
      </div>

      {/* Week grid */}
      <div className="overflow-hidden rounded-lg border">
        <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
          <div className="grid grid-cols-[64px_repeat(7,1fr)]">
            {/* Header row */}
            <div className="sticky top-0 z-20 flex items-end justify-start border-b border-r bg-background p-2 text-[11px] text-muted-foreground">
              GMT+5:30
            </div>
            {weekDates.map((date) => {
              const isToday = isSameDay(date, today);
              const dayTimeOff = timeOffByDay.get(date.toDateString()) ?? [];
              return (
                <div
                  key={date.toISOString()}
                  className={cn(
                    "sticky top-0 z-20 flex flex-col items-center gap-0.5 border-b border-r bg-background py-2 last:border-r-0",
                  )}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {DAYS[date.getDay()]}
                  </span>
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-sm font-semibold",
                      isToday && "bg-foreground text-background",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {dayTimeOff.length > 0 && (
                    <span className="max-w-full truncate rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                      {dayTimeOff[0].name}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Time rows */}
            {HOURS.map((hour) => (
              <React.Fragment key={hour}>
                <div className="relative -top-2.5 border-r px-2 text-right text-[11px] text-muted-foreground">
                  {formatHourLabel(hour)}
                </div>
                {weekDates.map((date) => {
                  const isToday = isSameDay(date, today);
                  const isBusinessHour =
                    hour >= BUSINESS_START && hour < BUSINESS_END;
                  const showCurrentTime =
                    isToday &&
                    currentHour >= hour &&
                    currentHour < hour + 1;
                  const dayTimeOff = timeOffByDay.get(date.toDateString()) ?? [];
                  const isTimeOff = dayTimeOff.length > 0;

                  const dayAppointments = (
                    appointmentsByDay.get(date.toDateString()) ?? []
                  ).filter((appointment) => {
                    const start = hourOfDay(new Date(appointment.starts_at));
                    return start >= hour && start < hour + 1;
                  });

                  return (
                    <div
                      key={`${date.toISOString()}-${hour}`}
                      className={cn(
                        "relative h-16 border-b border-r last:border-r-0",
                        isTimeOff
                          ? "bg-amber-500/10 [background-image:repeating-linear-gradient(135deg,var(--border)_0,var(--border)_1px,transparent_1px,transparent_10px)]"
                          : isBusinessHour
                            ? "bg-background"
                            : "bg-muted/40 [background-image:repeating-linear-gradient(135deg,var(--border)_0,var(--border)_1px,transparent_1px,transparent_10px)]",
                      )}
                    >
                      {showCurrentTime && (
                        <div
                          className="absolute inset-x-0 z-10 flex items-center"
                          style={{
                            top: `${(currentHour - hour) * 100}%`,
                          }}
                        >
                          <div className="-ml-1 size-2 rounded-full bg-red-500" />
                          <div className="h-px w-full bg-red-500" />
                        </div>
                      )}

                      {dayAppointments.map((appointment) => {
                        const start = new Date(appointment.starts_at);
                        const end = new Date(appointment.ends_at);
                        const startHourFraction = hourOfDay(start) - hour;
                        const durationHours = Math.max(
                          (end.getTime() - start.getTime()) / (1000 * 60 * 60),
                          0.25
                        );

                        return (
                          <div
                            key={appointment.id}
                            className="absolute inset-x-0.5 z-10 overflow-hidden rounded-md border border-primary/30 bg-primary/15 px-1.5 py-0.5 text-[11px] leading-tight"
                            style={{
                              top: `${startHourFraction * 100}%`,
                              height: `${durationHours * 100}%`,
                            }}
                            title={`${appointment.title} — ${appointment.client_name}`}
                          >
                            <p className="truncate font-medium text-foreground">
                              {appointment.title}
                            </p>
                            <p className="truncate text-muted-foreground">
                              {appointment.client_name}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function NewAppointmentDialog({
  onClose,
  defaultDate,
}: {
  onClose: () => void;
  defaultDate: Date;
}) {
  const [title, setTitle] = React.useState("");
  const [clientName, setClientName] = React.useState("");
  const [clientPhone, setClientPhone] = React.useState("");
  const [duration, setDuration] = React.useState(60);
  const [time, setTime] = React.useState("09:00");
  const [notes, setNotes] = React.useState("");
  const [internalNotes, setInternalNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleCreate = async () => {
    const [hours, minutes] = time.split(":").map(Number);
    const startsAt = new Date(defaultDate);
    startsAt.setHours(hours, minutes, 0, 0);
    const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);

    setSubmitting(true);
    const result = await createAppointment({
      title,
      clientName,
      clientPhone: clientPhone || undefined,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      notes: notes || undefined,
      internalNotes: internalNotes || undefined,
    });
    setSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New appointment</DialogTitle>
        <DialogDescription>
          Schedule a new appointment for a client.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Plain text inputs for now — becomes a real Select once Services/Clients pages share data with this page */}
        <div className="space-y-1.5">
          <Label>Service / title</Label>
          <Input
            placeholder="e.g., Consultation"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Client name</Label>
          <Input
            placeholder="e.g., Jane Doe"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Client phone</Label>
          <Input
            placeholder="e.g., +14155551234"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Date</Label>
          <Button variant="outline" className="w-full justify-start font-normal">
            {formatFullDate(defaultDate)}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Duration in minutes</Label>
          <Input
            type="number"
            value={duration}
            min={0}
            step={5}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Time</Label>
          <Select value={time} onValueChange={(value) => setTime(value as string)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select time..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="09:00">09:00 AM</SelectItem>
              <SelectItem value="09:30">09:30 AM</SelectItem>
              <SelectItem value="10:00">10:00 AM</SelectItem>
              <SelectItem value="10:30">10:30 AM</SelectItem>
              <SelectItem value="11:00">11:00 AM</SelectItem>
              <SelectItem value="13:00">01:00 PM</SelectItem>
              <SelectItem value="14:00">02:00 PM</SelectItem>
              <SelectItem value="15:00">03:00 PM</SelectItem>
              <SelectItem value="16:00">04:00 PM</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label>Notes</Label>
            <span className="text-xs text-muted-foreground">
              Visible to the receptionist
            </span>
          </div>
          <Textarea
            placeholder="Add any notes for this appointment..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label>Internal notes</Label>
            <span className="text-xs text-muted-foreground">Staff only</span>
          </div>
          <Textarea
            placeholder="Add internal notes..."
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={submitting}>
          Create appointment
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewTimeOffDialog({
  onClose,
  defaultDate,
}: {
  onClose: () => void;
  defaultDate: Date;
}) {
  const [scope, setScope] = React.useState<"company" | "staff" | "asset">(
    "company"
  );
  const [name, setName] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleAdd = async () => {
    const startsAt = startOfDay(defaultDate);
    const endsAt = endOfDay(defaultDate);

    setSubmitting(true);
    const result = await createTimeOff({
      scope,
      name,
      allDay: true,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      reason: reason || undefined,
    });
    setSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add time off</DialogTitle>
        <DialogDescription>
          Schedule a business closure, staff leave, or asset maintenance
          period.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Scope</Label>
          <Select
            value={scope}
            onValueChange={(value) =>
              setScope(value as "company" | "staff" | "asset")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select scope..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="company">Company-wide</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="asset">Asset</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            placeholder="e.g., Christmas Day, Half Day Friday"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Button variant="outline" className="w-full justify-start font-normal">
              {formatFullDate(defaultDate)}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>End date</Label>
            <Button variant="outline" className="w-full justify-start font-normal">
              {formatFullDate(defaultDate)}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Input
            placeholder="e.g., Vacation, Renovation, Sick leave"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleAdd} disabled={submitting}>
          Add
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
