import { ANNIVERSARY_LEVELS, levelsText, yearsLabel } from "@/lib/anniversaries";
import { formatCalendarDate } from "@/lib/dates";
import type { AnniversaryOverview } from "@/modules/members/anniversaries";

/**
 * Die Ehrungen eines Jahres als Papier – für die Mitgliederversammlung, die Urkunden oder die Vorstandssitzung. Gebaut wie der
 * Helferplan-Aushang (Entwurf „Liste mit Schreiblinien“, siehe DESIGN.md): Arial, schwarz auf weiß, nur waagerechte Linien,
 * keine Symbole, Kärtchen oder Tönungen. Am Bildschirm ein weißes A4-Blatt (auch in der dunklen Darstellung), beim Drucken
 * fallen Rahmen und angedeutete Kopf- und Fußzeile weg – die echte Kopf-/Fußzeile kommt aus `@page` (`buildPrintPageStyle`).
 *
 * Nur Name, Nummer, Eintritt, Jubiläumstag und Abteilungen – keine Kontaktdaten. Maße in mm und pt, damit die Vorschau so
 * umbricht wie das Papier; jede Stufe beginnt mit einer kräftigen Linie, eine Zeile wird nie über zwei Seiten getrennt. Ist
 * das Blatt schmaler als 150 mm (Vorschau am Handy), fallen „Nr.“ und „Mitglied seit“ weg, damit nichts über den Rand läuft –
 * gedruckt (A4, 182 mm Inhalt) stehen immer alle Spalten da.
 */
export function AnniversarySheet({
  overview,
  clubName,
  generatedAtLabel,
}: {
  overview: AnniversaryOverview;
  clubName: string;
  /** Bereits formatiert, z. B. „14.10.2026 21:30 Uhr“. */
  generatedAtLabel: string;
}) {
  const { year, groups, total, scope } = overview;
  return (
    <article
      aria-labelledby="ehrungen-titel"
      className="@container/blatt mx-auto flex w-full max-w-[210mm] flex-col bg-white px-4 py-5 font-print text-[11pt] leading-snug text-black shadow-sm ring-1 ring-foreground/10 sm:min-h-[297mm] sm:px-[15mm] sm:py-[12mm] print:min-h-0 print:max-w-none print:p-0 print:shadow-none print:ring-0"
    >
      <div
        aria-hidden="true"
        className="mb-[8mm] flex justify-between gap-4 text-[9pt] print:hidden"
      >
        <span>{clubName}</span>
        <span>Ehrungen {year}</span>
      </div>

      <h2 id="ehrungen-titel" className="text-[20pt] leading-tight font-bold">
        Ehrungen {year}
      </h2>
      <p className="mt-[2mm]">
        Diese Mitglieder haben im Jahr {year} ein rundes Jubiläum ihrer Mitgliedschaft (
        {levelsText(ANNIVERSARY_LEVELS)} Jahre), gezählt ab dem Eintrittsdatum. Insgesamt{" "}
        {total === 1 ? "ein Mitglied" : `${total} Mitglieder`}.
        {scope === "DEPARTMENT" && " Die Liste enthält nur Mitglieder der eigenen Abteilungen."}
      </p>

      {groups.map((group) => (
        <section
          key={group.years}
          aria-labelledby={`druck-stufe-${group.years}`}
          className="mt-[8mm] border-t-[1.5pt] border-black pt-[2mm]"
        >
          <h3 id={`druck-stufe-${group.years}`} className="text-[13pt] font-bold">
            {yearsLabel(group.years)} Mitgliedschaft
          </h3>
          <table className="mt-[2mm] w-full border-collapse text-left">
            <caption className="sr-only">{yearsLabel(group.years)} Mitgliedschaft</caption>
            <thead>
              <tr className="border-b-[0.75pt] border-black text-[9pt]">
                <th scope="col" className="py-[1.5mm] pr-[3mm] font-bold">
                  Name
                </th>
                <th
                  scope="col"
                  className="hidden py-[1.5mm] pr-[3mm] font-bold @min-[150mm]/blatt:table-cell print:table-cell"
                >
                  Nr.
                </th>
                <th
                  scope="col"
                  className="hidden py-[1.5mm] pr-[3mm] font-bold @min-[150mm]/blatt:table-cell print:table-cell"
                >
                  Mitglied seit
                </th>
                <th scope="col" className="py-[1.5mm] pr-[3mm] font-bold">
                  Jubiläum am
                </th>
                <th scope="col" className="py-[1.5mm] font-bold">
                  Abteilungen
                </th>
              </tr>
            </thead>
            <tbody>
              {group.entries.map((entry) => (
                <tr
                  key={entry.memberId}
                  className="break-inside-avoid border-b-[0.5pt] border-neutral-500 align-top"
                >
                  <td className="py-[1.5mm] pr-[3mm] wrap-anywhere">
                    <span className="font-bold">
                      {entry.lastName}, {entry.firstName}
                    </span>
                    {entry.leftAt && (
                      <span className="block text-[9pt]">
                        Austritt am {formatCalendarDate(entry.leftAt)}
                      </span>
                    )}
                  </td>
                  <td className="hidden py-[1.5mm] pr-[3mm] tabular-nums @min-[150mm]/blatt:table-cell print:table-cell">
                    {entry.memberNumber ?? ""}
                  </td>
                  <td className="hidden py-[1.5mm] pr-[3mm] tabular-nums @min-[150mm]/blatt:table-cell print:table-cell">
                    {formatCalendarDate(entry.joinedAt)}
                  </td>
                  <td className="py-[1.5mm] pr-[3mm] tabular-nums">
                    {formatCalendarDate(entry.date)}
                  </td>
                  <td className="py-[1.5mm] wrap-anywhere">{entry.departments.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <p aria-hidden="true" className="mt-auto pt-[6mm] text-[9pt] print:hidden">
        Erstellt am {generatedAtLabel}
      </p>
    </article>
  );
}
