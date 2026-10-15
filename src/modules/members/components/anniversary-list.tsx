import Link from "next/link";
import { PageSection } from "@/components/shared/page-section";
import { TableCard } from "@/components/shared/table-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { yearsLabel } from "@/lib/anniversaries";
import { formatCalendarDate } from "@/lib/dates";
import type { AnniversaryOverview } from "@/modules/members/anniversaries";

const membersLabel = (count: number) => (count === 1 ? "1 Mitglied" : `${count} Mitglieder`);

/**
 * Ehrungen eines Jahres als Abschnitte je Stufe („50 Jahre“, höchste zuerst), darin eine Tabelle: Name (Link zum Mitglied),
 * Nummer, Eintritt, Jubiläumstag und Abteilungen. Am Handy wird jede Zeile eine kleine Karte (`<Table stack>`), die ganze
 * Zeile ist antippbar wie in der Mitgliederliste. Bewusst schlicht – keine Abzeichen, Symbole oder Farben.
 */
export function AnniversaryList({ groups }: { groups: AnniversaryOverview["groups"] }) {
  return groups.map((group) => (
    <PageSection
      key={group.years}
      id={`stufe-${group.years}`}
      title={yearsLabel(group.years)}
      description={membersLabel(group.entries.length)}
    >
      <TableCard>
        <Table stack>
          <caption className="sr-only">{yearsLabel(group.years)} Mitgliedschaft</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Nr.</TableHead>
              <TableHead>Eintritt</TableHead>
              <TableHead>Jubiläum am</TableHead>
              <TableHead>Abteilungen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.entries.map((entry) => (
              // Die ganze Zeile ist antippbar: Der Namenslink legt eine unsichtbare Fläche über die Zeile (`after:`).
              <TableRow key={entry.memberId} className="relative">
                <TableCell className="whitespace-normal">
                  <Link
                    href={`/mitglieder/${entry.memberId}`}
                    className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline"
                  >
                    {entry.lastName}, {entry.firstName}
                  </Link>
                  {entry.leftAt && (
                    <p className="text-xs text-muted-foreground">
                      Austritt am {formatCalendarDate(entry.leftAt)}
                    </p>
                  )}
                </TableCell>
                <TableCell label="Nr." className="text-muted-foreground tabular-nums">
                  {entry.memberNumber ?? "–"}
                </TableCell>
                <TableCell label="Eintritt" className="text-muted-foreground tabular-nums">
                  {formatCalendarDate(entry.joinedAt)}
                </TableCell>
                <TableCell label="Jubiläum am" className="font-medium tabular-nums">
                  {formatCalendarDate(entry.date)}
                </TableCell>
                <TableCell label="Abteilungen" className="whitespace-normal">
                  {entry.departments.length === 0 ? (
                    <span className="text-muted-foreground">–</span>
                  ) : (
                    entry.departments.join(", ")
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </PageSection>
  ));
}
