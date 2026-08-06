"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Funnel,
  Plus,
  CalendarOff,
  X,
  Pencil,
  Check,
  CalendarPlus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogBody,
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
import { DatePickerField } from "@/components/calendar/date-picker-field";
import { Calendar } from "@/components/ui/calendar";
import {
  formatCalendarDateParam,
  getMonthGridDates,
  getWeekDates,
  type CalendarView,
} from "@/lib/calendar-range";
import { createAppointment, createTimeOff, cancelAppointment, updateAppointment } from "./actions";
import type { AppointmentRow, TimeOffRow } from "@/lib/data/calendar";
import type { StaffMember } from "@/lib/data/staff";
import type { CreateAppointmentInput } from "@/lib/validations/calendar";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VIEWS: CalendarView[] = ["Week", "Day", "Month"];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const BUSINESS_START = 9;
const BUSINESS_END = 17;

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = (i % 2) * 30;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const period = hours < 12 ? "AM" : "PM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return { value, label: `${displayHour}:${String(minutes).padStart(2, "0")} ${period}` };
});

function formatHourLabel(hour: number) {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(displayHour).padStart(2, "0")}:00 ${period}`;
}


function getTimezoneLabel(): string {
  try {
    const offsetPart = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    if (!offsetPart) return "Local";
    const match = offsetPart.match(/^GMT([+-]\d+)(?::(\d{2}))?$/);
    if (!match) return offsetPart === "GMT" ? "GMT+0:00" : offsetPart;
    const [, hours, minutes = "00"] = match;
    return `GMT${hours}:${minutes}`;
  } catch {
    return "Local";
  }
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

function formatTimeRange(start: Date, end: Date) {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
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
  initialView: CalendarView;
  staff: StaffMember[];
};

export function CalendarClient({
  initialAppointments,
  initialTimeOff,
  initialAnchorDate,
  initialView,
  staff,
}: CalendarClientProps) {
  const router = useRouter();
  const refreshCalendar = React.useCallback(() => {
    router.refresh();
  }, [router]);

  const [anchorDate, setAnchorDate] = React.useState(
    () => new Date(initialAnchorDate)
  );
  const [view, setView] = React.useState<CalendarView>(initialView);
  const [newAppointmentOpen, setNewAppointmentOpen] = React.useState(false);
  const [newTimeOffOpen, setNewTimeOffOpen] = React.useState(false);
  const [appointmentDraft, setAppointmentDraft] = React.useState<{
    date: Date;
    time: string;
  } | null>(null);
  const [staffFilterId, setStaffFilterId] = React.useState<string | "all">("all");
  const [selectedAppointment, setSelectedAppointment] =
    React.useState<AppointmentRow | null>(null);

  const visibleAppointments = React.useMemo(() => {
    if (staffFilterId === "all") return initialAppointments;
    return initialAppointments.filter(
      (appointment) => appointment.staff_id === staffFilterId
    );
  }, [initialAppointments, staffFilterId]);

  function openNewAppointmentAt(date: Date, hour: number) {
    setAppointmentDraft({
      date,
      time: `${String(hour).padStart(2, "0")}:00`,
    });
    setNewAppointmentOpen(true);
  }

  React.useEffect(() => {
    setAnchorDate(new Date(initialAnchorDate));
  }, [initialAnchorDate]);

  React.useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const navigateCalendar = React.useCallback(
    (nextDate: Date, nextView: CalendarView = view) => {
      setAnchorDate(nextDate);
      setView(nextView);
      router.push(
        `/calendar?date=${formatCalendarDateParam(nextDate)}&view=${nextView}`
      );
    },
    [router, view]
  );

  const [today, setToday] = React.useState(() => new Date());
  React.useEffect(() => {
    const interval = setInterval(() => setToday(new Date()), 1000 * 30);
    return () => clearInterval(interval);
  }, []);
  const weekDates = React.useMemo(() => getWeekDates(anchorDate), [anchorDate]);
  const displayDates = React.useMemo(() => {
    if (view === "Day") return [anchorDate];
    return weekDates;
  }, [anchorDate, view, weekDates]);
  const monthGridDates = React.useMemo(
    () => getMonthGridDates(anchorDate),
    [anchorDate]
  );
  const timezoneLabel = React.useMemo(() => getTimezoneLabel(), []);
  const currentHour = hourOfDay(today);

  const goToPrevious = () => {
    const next = new Date(anchorDate);
    if (view === "Month") next.setMonth(next.getMonth() - 1);
    else next.setDate(next.getDate() - (view === "Day" ? 1 : 7));
    navigateCalendar(next);
  };

  const goToNext = () => {
    const next = new Date(anchorDate);
    if (view === "Month") next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + (view === "Day" ? 1 : 7));
    navigateCalendar(next);
  };

  const goToToday = () => navigateCalendar(new Date(today));

  const appointmentsByDay = React.useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const date of displayDates) {
      map.set(date.toDateString(), []);
    }
    for (const appointment of visibleAppointments) {
      const start = new Date(appointment.starts_at);
      const key = start.toDateString();
      if (map.has(key)) {
        map.get(key)!.push(appointment);
      }
    }
    return map;
  }, [visibleAppointments, displayDates]);

  const appointmentsByMonthDay = React.useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const appointment of visibleAppointments) {
      const start = new Date(appointment.starts_at);
      const key = start.toDateString();
      const existing = map.get(key) ?? [];
      existing.push(appointment);
      map.set(key, existing);
    }
    return map;
  }, [visibleAppointments]);

  const timeOffByDay = React.useMemo(() => {
    const map = new Map<string, TimeOffRow[]>();
    for (const date of displayDates) {
      map.set(date.toDateString(), []);
    }
    for (const timeOff of initialTimeOff) {
      const start = new Date(timeOff.starts_at);
      const end = new Date(timeOff.ends_at);
      for (const date of displayDates) {
        if (date >= startOfDay(start) && date <= endOfDay(end)) {
          map.get(date.toDateString())?.push(timeOff);
        }
      }
    }
    return map;
  }, [initialTimeOff, displayDates]);

  return (
    <div className="flex h-[calc(100svh-50px)] min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex h-[44.8px] shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1.5 border-b bg-background/90 px-2.5 backdrop-blur-sm">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="h-8 shrink-0 justify-between gap-1 rounded-[10px] px-3 text-sm font-medium"
                >
                  <span className="min-w-0 truncate">{formatMonthYear(anchorDate)}</span>
                  <ChevronDown className="size-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={goToToday}>
                {formatMonthYear(today)}
              </DropdownMenuItem>
              <div className="p-2">
                <Calendar
                  mode="single"
                  selected={anchorDate}
                  onSelect={(date) => {
                    if (date) navigateCalendar(date);
                  }}
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg p-0"
              aria-label="Previous period"
              onClick={goToPrevious}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg p-0"
              aria-label="Next period"
              onClick={goToNext}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            className="h-8 rounded-lg border-border bg-background px-2.5 text-sm text-foreground shadow-none"
            onClick={goToToday}
          >
            Today
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="h-8 gap-1 rounded-lg border-border bg-background px-2.5 text-sm text-foreground shadow-none"
                >
                  {view}
                  <ChevronDown className="size-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {VIEWS.map((v) => (
                <DropdownMenuItem key={v} onClick={() => navigateCalendar(anchorDate, v)}>
                  {v}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Dialog
            open={newAppointmentOpen}
            onOpenChange={(open) => {
              setNewAppointmentOpen(open);
              if (!open) setAppointmentDraft(null);
            }}
          >
            <DialogTrigger
              render={
                <Button
                  aria-label="New appointment"
                  title="New appointment"
                  className="h-8 gap-1 rounded-lg bg-foreground px-2 text-background shadow-none hover:bg-foreground/80 lg:px-3"
                >
                  <Plus className="size-3.5" />
                  <span className="hidden lg:inline">New appointment</span>
                </Button>
              }
            />
            <NewAppointmentDialog
              key={
                appointmentDraft
                  ? `${appointmentDraft.date.toISOString()}-${appointmentDraft.time}`
                  : "default"
              }
              defaultDate={appointmentDraft?.date ?? anchorDate}
              defaultTime={appointmentDraft?.time ?? "09:00"}
              onClose={() => {
                setNewAppointmentOpen(false);
                setAppointmentDraft(null);
              }}
              onSuccess={refreshCalendar}
            />
          </Dialog>

          <Dialog open={newTimeOffOpen} onOpenChange={setNewTimeOffOpen}>
            <DialogTrigger
              render={
                <Button
                  aria-label="New time off"
                  title="New time off"
                  className="h-8 gap-1 rounded-lg bg-foreground px-2 text-background shadow-none hover:bg-foreground/80 lg:px-3"
                >
                  <CalendarOff className="size-3.5" />
                  <span className="hidden lg:inline">New time off</span>
                </Button>
              }
            />
            <NewTimeOffDialog
              defaultDate={anchorDate}
              onClose={() => setNewTimeOffOpen(false)}
              onSuccess={refreshCalendar}
            />
          </Dialog>

          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Filters"
                  title="Filters"
                  className="-mr-2 h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground"
                >
                  <Funnel className="size-4" />
                </Button>
              }
            />
            <PopoverContent className="w-56 space-y-3">
              <div className="space-y-1.5">
                <Label>Staff member</Label>
                <Select
                  value={staffFilterId}
                  onValueChange={(value) => setStaffFilterId(value ?? "all")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All staff</SelectItem>
                    {staff.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.displayName ?? member.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {staff.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add staff to filter appointments by team member.
                </p>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Calendar body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "Month" ? (
          <div className="scrollbar-thin h-full overflow-y-auto p-4">
            <div className="mb-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGridDates.map((date) => {
                const inMonth = date.getMonth() === anchorDate.getMonth();
                const isToday = isSameDay(date, today);
                const dayAppointments =
                  appointmentsByMonthDay.get(date.toDateString()) ?? [];
                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => navigateCalendar(date, "Day")}
                    className={cn(
                      "flex min-h-[88px] flex-col rounded-lg border p-2 text-left transition-colors hover:bg-muted/50",
                      !inMonth && "opacity-40",
                      isToday && "border-foreground/30 bg-muted/30"
                    )}
                  >
                    <span
                      className={cn(
                        "mb-1 text-xs font-medium",
                        isToday ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {date.getDate()}
                    </span>
                    {dayAppointments.slice(0, 2).map((appointment) => (
                      <span
                        key={appointment.id}
                        className="truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] text-foreground"
                      >
                        {appointment.title}
                      </span>
                    ))}
                    {dayAppointments.length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dayAppointments.length - 2} more
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
        <div className="scrollbar-thin h-full overflow-y-auto">
          <div
            className={cn(
              "grid",
              view === "Day"
                ? "grid-cols-[80px_1fr]"
                : "grid-cols-[80px_repeat(7,1fr)]"
            )}
          >
            {/* Header row */}
            <div className="sticky top-0 z-20 flex h-8 shrink-0 items-center justify-center border-b border-border bg-background px-2">
              <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                {timezoneLabel}
              </span>
            </div>
            {displayDates.map((date) => {
              const isToday = isSameDay(date, today);
              return (
                <div
                  key={date.toISOString()}
                  className="sticky top-0 z-20 flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 border-b border-border bg-background px-2 lg:px-4"
                >
                  <span
                    className={cn(
                      "min-w-0 truncate text-[10px] font-medium sm:text-xs",
                      isToday ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {DAYS[date.getDay()]}
                  </span>
                  <span
                    className={cn(
                      "min-w-[22px] shrink-0 rounded-sm px-1 py-0.5 text-center text-xs font-medium whitespace-nowrap",
                      isToday ? "bg-foreground text-background" : "text-muted-foreground",
                    )}
                  >
                    {date.getDate()}
                  </span>
                </div>
              );
            })}

            {/* All day row */}
            <div className="sticky top-8 z-20 flex h-7 w-20 shrink-0 items-center justify-center border-b border-border bg-background px-2">
              <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                All day
              </span>
            </div>
            {displayDates.map((date) => {
              const dayTimeOff = timeOffByDay.get(date.toDateString()) ?? [];
              return (
                <div
                  key={`allday-${date.toISOString()}`}
                  className="sticky top-8 z-20 flex h-7 min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden border-b border-l border-border bg-background px-4 py-1"
                >
                  {dayTimeOff.length > 0 && (
                    <span className="max-w-full truncate rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                      {dayTimeOff[0].name}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Time rows */}
            {HOURS.map((hour) => {
              const showCurrentTimeLabel =
                currentHour >= hour && currentHour < hour + 1;

              return (
                <React.Fragment key={hour}>
                  <div className="relative h-[90px] border-r px-2 text-right text-[13px] text-muted-foreground">
                    <span className="relative -top-2.5 inline-block">{formatHourLabel(hour)}</span>
                    {showCurrentTimeLabel && (
                      <div
                        className="absolute inset-x-0 z-30 flex -translate-y-1/2 items-center justify-end"
                        style={{ top: `${(currentHour - hour) * 100}%` }}
                      >
                        <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-semibold text-background">
                          {formatHourLabel(Math.floor(currentHour)).replace(
                            ":00",
                            `:${String(Math.floor((currentHour % 1) * 60)).padStart(2, "0")}`
                          )}
                        </span>
                        <div className="h-0.5 flex-1 bg-border" />
                      </div>
                    )}
                  </div>
                  {displayDates.map((date) => {
                    const isToday = isSameDay(date, today);
                    const isBeforeToday = date < today && !isToday;
                    const isAfterToday = date > today && !isToday;
                    const isBusinessHour =
                      hour >= BUSINESS_START && hour < BUSINESS_END;
                    const inCurrentHourBand =
                      currentHour >= hour && currentHour < hour + 1;
                    const showCurrentTime = isToday && inCurrentHourBand;
                    const showCurrentTimeLine =
                      (isToday || isAfterToday) && inCurrentHourBand;
                    const showCurrentTimeReference =
                      isBeforeToday && inCurrentHourBand;
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
                        role="button"
                        tabIndex={0}
                        onClick={() => openNewAppointmentAt(date, hour)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openNewAppointmentAt(date, hour);
                          }
                        }}
                        className={cn(
                          "relative h-[90px] cursor-pointer border-b border-r last:border-r-0",
                          isTimeOff
                            ? "bg-amber-500/10 [background-image:repeating-linear-gradient(135deg,var(--border)_0,var(--border)_1px,transparent_1px,transparent_10px)]"
                            : isBusinessHour
                              ? "bg-background"
                              : "bg-muted/40 [background-image:repeating-linear-gradient(135deg,var(--border)_0,var(--border)_1px,transparent_1px,transparent_10px)]",
                        )}
                      >
                        {showCurrentTimeLine && (
                          <div
                            className="absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
                            style={{
                              top: `${(currentHour - hour) * 100}%`,
                            }}
                          >
                            {showCurrentTime && (
                              <div className="-ml-1 size-2 rounded-full bg-foreground" />
                            )}
                            <div className="h-0.5 w-full bg-foreground" />
                          </div>
                        )}

                        {showCurrentTimeReference && (
                          <div
                            className="absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
                            style={{
                              top: `${(currentHour - hour) * 100}%`,
                            }}
                          >
                            <div className="h-0.5 w-full bg-border" />
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
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedAppointment(appointment);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedAppointment(appointment);
                                }
                              }}
                              className="absolute inset-x-0.5 z-10 cursor-pointer overflow-hidden rounded-md border border-primary/30 bg-primary/15 px-1.5 py-0.5 text-[11px] leading-tight hover:bg-primary/25 focus-visible:outline-2 focus-visible:outline-primary"
                              style={{
                                top: `${startHourFraction * 100}%`,
                                height: `${durationHours * 100}%`,
                              }}
                              title={`${appointment.title} — ${appointment.client_name}`}
                              aria-label={`Open ${appointment.title} for ${appointment.client_name}`}
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
              );
            })}
          </div>
        </div>
        )}
      </div>

      <Dialog
        open={selectedAppointment !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAppointment(null);
        }}
      >
        {selectedAppointment && (
          <AppointmentDetailDialog
            appointment={selectedAppointment}
            onClose={() => setSelectedAppointment(null)}
            onSuccess={refreshCalendar}
          />
        )}
      </Dialog>
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

type AppointmentFormState = {
  title: string;
  clientName: string;
  clientPhone: string;
  duration: number;
  time: string;
  notes: string;
  internalNotes: string;
};

function buildAppointmentInput(
  state: AppointmentFormState,
  baseDate: Date
): CreateAppointmentInput {
  const [hours, minutes] = state.time.split(":").map(Number);
  const startsAt = new Date(baseDate);
  startsAt.setHours(hours, minutes, 0, 0);
  const endsAt = new Date(startsAt.getTime() + state.duration * 60 * 1000);
  return {
    title: state.title,
    clientName: state.clientName,
    clientPhone: state.clientPhone || undefined,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    notes: state.notes || undefined,
    internalNotes: state.internalNotes || undefined,
  };
}

function AppointmentFormFields({
  state,
  update,
  baseDate,
  onDateChange,
}: {
  state: AppointmentFormState;
  update: (patch: Partial<AppointmentFormState>) => void;
  baseDate: Date;
  onDateChange?: (date: Date) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Plain text inputs for now — becomes a real Select once Services/Clients pages share data with this page */}
      <div className="space-y-1.5">
        <Label>Service / title</Label>
        <Input
          placeholder="e.g., Consultation"
          value={state.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Client name</Label>
        <Input
          placeholder="e.g., Jane Doe"
          value={state.clientName}
          onChange={(e) => update({ clientName: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Client phone</Label>
        <Input
          placeholder="e.g., +14155551234"
          value={state.clientPhone}
          onChange={(e) => update({ clientPhone: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Date</Label>
        {onDateChange ? (
          <DatePickerField value={baseDate} onChange={onDateChange} />
        ) : (
          <Button variant="outline" className="w-full justify-start font-normal">
            {formatFullDate(baseDate)}
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Duration in minutes</Label>
        <Input
          type="number"
          value={state.duration}
          min={0}
          step={5}
          onChange={(e) => update({ duration: Number(e.target.value) })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Time</Label>
        <Select
          value={state.time}
          onValueChange={(value) => update({ time: value ?? "" })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select time..." />
          </SelectTrigger>
          <SelectContent>
            {!TIME_OPTIONS.some((option) => option.value === state.time) && (
              <SelectItem value={state.time}>{state.time}</SelectItem>
            )}
            {TIME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
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
          value={state.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label>Internal notes</Label>
          <span className="text-xs text-muted-foreground">Staff only</span>
        </div>
        <Textarea
          placeholder="Add internal notes..."
          value={state.internalNotes}
          onChange={(e) => update({ internalNotes: e.target.value })}
        />
      </div>
    </div>
  );
}

function NewAppointmentDialog({
  onClose,
  defaultDate,
  defaultTime = "09:00",
  onSuccess,
}: {
  onClose: () => void;
  defaultDate: Date;
  defaultTime?: string;
  onSuccess: () => void;
}) {
  const [appointmentDate, setAppointmentDate] = React.useState(defaultDate);
  const [state, setState] = React.useState<AppointmentFormState>({
    title: "",
    clientName: "",
    clientPhone: "",
    duration: 60,
    time: defaultTime,
    notes: "",
    internalNotes: "",
  });
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    setAppointmentDate(defaultDate);
    setState((current) => ({ ...current, time: defaultTime }));
  }, [defaultDate, defaultTime]);

  const handleCreate = async () => {
    setSubmitting(true);
    const result = await createAppointment(buildAppointmentInput(state, appointmentDate));
    setSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Appointment created");
    onClose();
    onSuccess();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New appointment</DialogTitle>
        <DialogDescription>
          Schedule a new appointment for a client.
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <AppointmentFormFields
          state={state}
          update={(patch) => setState((s) => ({ ...s, ...patch }))}
          baseDate={appointmentDate}
          onDateChange={setAppointmentDate}
        />
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" className="gap-1.5" onClick={onClose}>
          <X />
          Cancel
        </Button>
        <Button className="gap-1.5" onClick={handleCreate} disabled={submitting}>
          <CalendarPlus />
          Create appointment
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-foreground">{value}</span>
    </div>
  );
}

function AppointmentDetailDialog({
  appointment,
  onClose,
  onSuccess,
}: {
  appointment: AppointmentRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    const result = await cancelAppointment(appointment.id);
    setCancelling(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Appointment cancelled");
    onClose();
    onSuccess();
  };

  if (editing) {
    return (
      <AppointmentEditContent
        appointment={appointment}
        onDone={() => {
          onClose();
          onSuccess();
        }}
        onBack={() => setEditing(false)}
      />
    );
  }

  const start = new Date(appointment.starts_at);
  const end = new Date(appointment.ends_at);
  const durationMinutes = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60)
  );
  const status =
    appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{appointment.title}</DialogTitle>
        <DialogDescription>
          {formatFullDate(start)} · {formatTimeRange(start, end)}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <div className="space-y-3">
          <DetailRow label="Client" value={appointment.client_name} />
          {appointment.client_phone && (
            <DetailRow label="Phone" value={appointment.client_phone} />
          )}
          <DetailRow label="Duration" value={`${durationMinutes} min`} />
          {appointment.notes && (
            <DetailRow label="Notes" value={appointment.notes} />
          )}
          {appointment.internal_notes && (
            <DetailRow label="Internal notes" value={appointment.internal_notes} />
          )}
          <DetailRow label="Status" value={status} />
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" className="gap-1.5" onClick={onClose}>
          <X />
          Close
        </Button>
        {confirmingCancel ? (
          <>
            <Button variant="outline" className="gap-1.5" onClick={() => setConfirmingCancel(false)}>
              <X />
              Keep
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              onClick={handleCancel}
              disabled={cancelling}
            >
              <Trash2 />
              {cancelling ? "Cancelling…" : "Yes, cancel appointment"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="destructive" className="gap-1.5" onClick={() => setConfirmingCancel(true)}>
              <Trash2 />
              Cancel appointment
            </Button>
            <Button className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function AppointmentEditContent({
  appointment,
  onDone,
  onBack,
}: {
  appointment: AppointmentRow;
  onDone: () => void;
  onBack: () => void;
}) {
  const start = new Date(appointment.starts_at);
  const [appointmentDate, setAppointmentDate] = React.useState(start);
  const [state, setState] = React.useState<AppointmentFormState>(() => ({
    title: appointment.title,
    clientName: appointment.client_name,
    clientPhone: appointment.client_phone ?? "",
    duration: Math.round(
      (new Date(appointment.ends_at).getTime() - start.getTime()) / (1000 * 60)
    ),
    time: `${String(start.getHours()).padStart(2, "0")}:${String(
      start.getMinutes()
    ).padStart(2, "0")}`,
    notes: appointment.notes ?? "",
    internalNotes: appointment.internal_notes ?? "",
  }));
  const [submitting, setSubmitting] = React.useState(false);

  const handleSave = async () => {
    setSubmitting(true);
    const result = await updateAppointment(
      appointment.id,
      buildAppointmentInput(state, appointmentDate)
    );
    setSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Appointment updated");
    onDone();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit appointment</DialogTitle>
        <DialogDescription>
          Update the details for {appointment.title}.
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <AppointmentFormFields
          state={state}
          update={(patch) => setState((s) => ({ ...s, ...patch }))}
          baseDate={appointmentDate}
          onDateChange={setAppointmentDate}
        />
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" className="gap-1.5" onClick={onBack}>
          <ChevronLeft />
          Back
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={onDone}>
          <X />
          Cancel
        </Button>
        <Button className="gap-1.5" onClick={handleSave} disabled={submitting}>
          <Check />
          Save changes
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewTimeOffDialog({
  onClose,
  defaultDate,
  onSuccess,
}: {
  onClose: () => void;
  defaultDate: Date;
  onSuccess: () => void;
}) {
  const [scope, setScope] = React.useState<"company" | "staff" | "asset">(
    "company"
  );
  const [name, setName] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [startDate, setStartDate] = React.useState(defaultDate);
  const [endDate, setEndDate] = React.useState(defaultDate);
  const [submitting, setSubmitting] = React.useState(false);

  const handleAdd = async () => {
    const startsAt = startOfDay(startDate);
    const endsAt = endOfDay(endDate < startDate ? startDate : endDate);

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

    toast.success("Time off added");
    onClose();
    onSuccess();
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

      <DialogBody>
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
              <DatePickerField value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <DatePickerField value={endDate} onChange={setEndDate} />
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
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" className="gap-1.5" onClick={onClose}>
          <X />
          Cancel
        </Button>
        <Button className="gap-1.5" onClick={handleAdd} disabled={submitting}>
          <Plus />
          Add time off
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
