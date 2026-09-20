import { redirect } from "next/navigation";
import { getCurrentOrgAndUser } from "@/lib/data/organization";
import { getAppointmentsForRange, getTimeOffForRange } from "@/lib/data/calendar";
import {
  getRangeForView,
  parseCalendarDate,
  parseCalendarView,
} from "@/lib/calendar-range";
import { getStaffForOrg } from "@/lib/data/staff";
import { CalendarClient } from "./calendar-client";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const context = await getCurrentOrgAndUser();
  if (!context) redirect("/login");

  const params = await searchParams;
  const anchor = parseCalendarDate(params.date);
  const view = parseCalendarView(params.view);
  const { start, end } = getRangeForView(anchor, view);

  const [appointments, timeOff, staff] = await Promise.all([
    getAppointmentsForRange(context.org.id, start.toISOString(), end.toISOString()),
    getTimeOffForRange(context.org.id, start.toISOString(), end.toISOString()),
    getStaffForOrg(),
  ]);

  return (
    <CalendarClient
      initialAppointments={appointments}
      initialTimeOff={timeOff}
      initialAnchorDate={start.toISOString()}
      initialView={view}
      staff={staff}
    />
  );
}

// Composed by the root layout's title template into "Calendar · Frontdesk.ai".
// Indexing stays off here: the root layout sets robots.index false for the whole
// app, and only the public booking pages opt back in.
export const metadata = { title: 'Calendar' }
