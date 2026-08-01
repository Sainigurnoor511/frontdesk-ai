import { redirect } from "next/navigation";
import { getCurrentOrgAndUser } from "@/lib/data/organization";
import { getAppointmentsForRange, getTimeOffForRange } from "@/lib/data/calendar";
import { CalendarClient } from "./calendar-client";

function getWeekRange(anchor: Date) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export default async function CalendarPage() {
  const context = await getCurrentOrgAndUser();
  if (!context) redirect("/login");

  const today = new Date();
  const { start, end } = getWeekRange(today);

  const [appointments, timeOff] = await Promise.all([
    getAppointmentsForRange(context.org.id, start.toISOString(), end.toISOString()),
    getTimeOffForRange(context.org.id, start.toISOString(), end.toISOString()),
  ]);

  return (
    <CalendarClient
      initialAppointments={appointments}
      initialTimeOff={timeOff}
      initialAnchorDate={start.toISOString()}
    />
  );
}
