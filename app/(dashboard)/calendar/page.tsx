"use client";

import * as React from "react";
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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VIEWS = ["Week", "Day", "Month"] as const;
type ViewMode = (typeof VIEWS)[number];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const BUSINESS_START = 9;
const BUSINESS_END = 17;
const CURRENT_HOUR = 10.5; // demo "current time" position (10:30 AM)

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

export default function CalendarPage() {
  const [anchorDate, setAnchorDate] = React.useState(() => new Date(2026, 7, 2));
  const [view, setView] = React.useState<ViewMode>("Week");
  const [newAppointmentOpen, setNewAppointmentOpen] = React.useState(false);
  const [newTimeOffOpen, setNewTimeOffOpen] = React.useState(false);

  const today = React.useMemo(() => new Date(2026, 7, 2), []);
  const weekDates = React.useMemo(() => getWeekDates(anchorDate), [anchorDate]);

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
            <NewAppointmentDialog onClose={() => setNewAppointmentOpen(false)} />
          </Dialog>

          <Dialog open={newTimeOffOpen} onOpenChange={setNewTimeOffOpen}>
            <DialogTrigger render={<Button variant="outline">New time off</Button>} />
            <NewTimeOffDialog onClose={() => setNewTimeOffOpen(false)} />
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
                    CURRENT_HOUR >= hour &&
                    CURRENT_HOUR < hour + 1;

                  return (
                    <div
                      key={`${date.toISOString()}-${hour}`}
                      className={cn(
                        "relative h-16 border-b border-r last:border-r-0",
                        isBusinessHour
                          ? "bg-background"
                          : "bg-muted/40 [background-image:repeating-linear-gradient(135deg,var(--border)_0,var(--border)_1px,transparent_1px,transparent_10px)]",
                      )}
                    >
                      {showCurrentTime && (
                        <div
                          className="absolute inset-x-0 z-10 flex items-center"
                          style={{
                            top: `${(CURRENT_HOUR - hour) * 100}%`,
                          }}
                        >
                          <div className="-ml-1 size-2 rounded-full bg-red-500" />
                          <div className="h-px w-full bg-red-500" />
                        </div>
                      )}
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

function NewAppointmentDialog({ onClose }: { onClose: () => void }) {
  const [serviceSelected, setServiceSelected] = React.useState(false);

  // TODO: wire to real appointments API
  const handleCreate = () => {
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
        <div className="space-y-1.5">
          <Label>Service</Label>
          <Select
            onValueChange={(value) => setServiceSelected(Boolean(value))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select service..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="consultation">Consultation</SelectItem>
              <SelectItem value="haircut">Haircut</SelectItem>
              <SelectItem value="checkup">Checkup</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Client</Label>
          <Select>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select client..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jane-doe">Jane Doe</SelectItem>
              <SelectItem value="john-smith">John Smith</SelectItem>
              <SelectItem value="alex-lee">Alex Lee</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Date</Label>
          <Button variant="outline" className="w-full justify-start font-normal">
            {formatFullDate(new Date(2026, 7, 2))}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Duration in minutes</Label>
          <Input type="number" defaultValue={60} min={0} step={5} />
        </div>

        <div className="space-y-1.5">
          <Label>Time</Label>
          <Select disabled={!serviceSelected}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select time..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="09:00">09:00 AM</SelectItem>
              <SelectItem value="09:30">09:30 AM</SelectItem>
              <SelectItem value="10:00">10:00 AM</SelectItem>
            </SelectContent>
          </Select>
          {!serviceSelected && (
            <p className="text-xs text-muted-foreground">
              Select a service first to set the time
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label>Notes</Label>
            <span className="text-xs text-muted-foreground">
              Visible to the receptionist
            </span>
          </div>
          <Textarea placeholder="Add any notes for this appointment..." />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label>Internal notes</Label>
            <span className="text-xs text-muted-foreground">Staff only</span>
          </div>
          <Textarea placeholder="Add internal notes..." />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleCreate}>Create appointment</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewTimeOffDialog({ onClose }: { onClose: () => void }) {
  // TODO: wire to real time-off API
  const handleAdd = () => {
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
          <Select defaultValue="company">
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
          <Input placeholder="e.g., Christmas Day, Half Day Friday" />
        </div>

        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select defaultValue="closed">
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="closed">Closed all day</SelectItem>
              <SelectItem value="custom">Custom hours</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Button variant="outline" className="w-full justify-start font-normal">
              {formatFullDate(new Date(2026, 7, 2))}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>End date</Label>
            <Button variant="outline" className="w-full justify-start font-normal">
              {formatFullDate(new Date(2026, 7, 2))}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Input placeholder="e.g., Vacation, Renovation, Sick leave" />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleAdd}>Add</Button>
      </DialogFooter>
    </DialogContent>
  );
}
