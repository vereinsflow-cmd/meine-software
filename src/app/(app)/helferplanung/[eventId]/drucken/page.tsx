import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { NoAccess } from "@/components/shared/no-access";
import { PrintButton } from "@/components/shared/print-button";
import { formatDate, formatDateLong, formatTimeRange } from "@/lib/dates";
import { FILL_LABEL } from "@/lib/shift-health";
import { listShiftsForEvent } from "@/modules/shifts/service";
import { isAppError } from "@/server/errors";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Helferliste (Druckansicht)" };

/**
 * Druckbare Helferliste: schwarz auf weiß, ohne Menü, mit Feldern zum Abhaken. Freie Plätze sind als leere Zeilen
 * sichtbar. Enthält nur Namen (keine Kontaktdaten).
 */
export default async function PrintShiftsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const ctx = await requirePageContext();
  if (!can(ctx, "shifts:read")) return <NoAccess what="die Helferliste" />;

  const plan = await listShiftsForEvent(ctx, eventId).catch((error: unknown) => {
    if (isAppError(error) && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!plan) notFound();
  const shifts = plan.shifts.filter((s) => s.status !== "CANCELLED");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/helferplanung/${eventId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" /> Zurück zum Helferplan
        </Link>
        <PrintButton />
      </div>

      <header className="mb-6 border-b pb-3">
        <h1 className="text-2xl font-semibold">Helferliste: {plan.event.title}</h1>
        <p className="text-sm">
          {formatDateLong(plan.event.startsAt)} · {ctx.club.name}
        </p>
        <p className="text-xs text-muted-foreground print:text-black">
          Stand: {formatDate(new Date())}
        </p>
      </header>

      {shifts.length === 0 && <p>Keine Schichten geplant.</p>}
      {shifts.map((shift) => (
        <section key={shift.id} className="mb-6 break-inside-avoid">
          <h2 className="text-lg font-semibold">
            {shift.title}{" "}
            <span className="text-sm font-normal">
              — {formatTimeRange(shift.startsAt, shift.endsAt)}
            </span>
          </h2>
          <p className="mb-1 text-sm">
            {shift.taskName && <>{shift.taskName} · </>}
            {shift.meetingPoint && <>Treffpunkt: {shift.meetingPoint} · </>}
            {shift.responsible && <>Verantwortlich: {shift.responsible.name} · </>}
            {shift.filled} von {shift.requiredCount} besetzt ({FILL_LABEL[shift.health.fill]})
          </p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="w-8 py-1">Nr.</th>
                <th className="py-1">Name</th>
                <th className="w-24 py-1">Anwesend</th>
                <th className="w-32 py-1">Bemerkung</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: shift.requiredCount }, (_, index) => {
                const helper = shift.assignments[index];
                return (
                  <tr key={index} className="border-b border-gray-400">
                    <td className="py-1.5">{index + 1}</td>
                    <td className="py-1.5">
                      {helper ? (
                        helper.name
                      ) : (
                        <span className="text-gray-500 italic">— frei —</span>
                      )}
                    </td>
                    <td className="py-1.5">☐</td>
                    <td className="py-1.5"></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
