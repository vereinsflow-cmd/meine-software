"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, LoaderCircleIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { CompactEmpty } from "@/components/shared/compact-empty";
import { IconButton } from "@/components/shared/icon-button";
import { PageSection } from "@/components/shared/page-section";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { saveAttendanceAction } from "../actions";
// Nur der Typ: `import type` fällt beim Übersetzen weg, der Dienst (Datenbank, Protokoll) landet nicht im Browser.
import type { AttendanceSheetRow } from "../attendance";
import {
  ATTENDANCE_RESULT_LABEL,
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUSES,
  countStatuses,
  countsText,
  pendingAttendance,
  pendingAttendanceText,
} from "../attendance-schemas";

interface Row extends AttendanceSheetRow {
  /**
   * Vorschlag beim Laden bzw. nach dem letzten Speichern (bei einer Absage „entschuldigt“). Weicht die Auswahl davon ab,
   * hat der Benutzer selbst etwas geändert – nur dann fragt die Seite beim Verlassen nach.
   */
  proposed: AttendanceStatus | null;
  /** In diesem Fenster hinzugefügt (Gruppe oder „+ Person“) – lässt sich vor dem Speichern wieder wegnehmen. */
  added: boolean;
}

/** Die Anfrage kam nicht an oder die Antwort nicht zurück – wie bei `useActionForm`. */
const CONNECTION_ERROR =
  "Die Verbindung wurde unterbrochen. Bitte lade die Seite neu und prüfe, ob gespeichert wurde, bevor du es noch einmal versuchst.";

/** Rückfrage, wenn ein Link die Seite mit ungespeicherten Änderungen verlassen würde. */
const LEAVE_QUESTION =
  "Die Anwesenheit ist noch nicht gespeichert. Seite trotzdem verlassen? Deine Änderungen gehen dann verloren.";

const SAVE_BUTTON_ID = "anwesenheit-speichern";

/**
 * Ein Klick auf einen Link, der innerhalb der Anwendung die Seite wechselt (Next-`Link` oder gewöhnlicher Link derselben
 * Herkunft, ohne neuen Tab, ohne Download, kein Sprung innerhalb der Seite)?
 */
function leavesPage(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return false;
  if (link.target && link.target !== "_self") return false;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return false; // Fremde Seiten: das übernimmt `beforeunload`
  const here = window.location;
  return !(url.pathname === here.pathname && url.search === here.search && url.hash !== "");
}

/**
 * Gewählter Knopf: getönt in der Farbe seiner Bedeutung (Grün = da, Bernstein = entschuldigt, Grau = fehlt), fett und mit
 * Haken – die Bedeutung steht immer auch im Text. Rot bleibt Fehlern vorbehalten.
 */
const CHECKED: Record<AttendanceStatus, string> = {
  PRESENT:
    "has-checked:border-emerald-600 has-checked:bg-emerald-50 has-checked:text-emerald-900 dark:has-checked:border-emerald-400 dark:has-checked:bg-emerald-400/15 dark:has-checked:text-emerald-100",
  EXCUSED:
    "has-checked:border-amber-600 has-checked:bg-amber-50 has-checked:text-amber-900 dark:has-checked:border-amber-400 dark:has-checked:bg-amber-400/15 dark:has-checked:text-amber-100",
  ABSENT:
    "has-checked:border-foreground/60 has-checked:bg-muted has-checked:text-foreground dark:has-checked:border-foreground/50",
};

const optionId = (memberId: string, status: AttendanceStatus) =>
  `anwesenheit-${memberId}-${status}`;

/**
 * Erfassungsliste für die Anwesenheit eines Termins – fürs Handy gebaut: je Person drei große Auswahlknöpfe
 * (Anwesend / Entschuldigt / Fehlt, mindestens 44 px hoch), „Alle anwesend“ für die noch offenen, unten eine feste Leiste
 * „Speichern (n)“ mit der Zahl der Änderungen. Gespeichert werden nur geänderte Personen – dazu zählen auch vorausgefüllte
 * Absagen („entschuldigt“), der Hinweis neben dem Knopf sagt das. Nur mit selbst gemachten, ungespeicherten Änderungen
 * fragen Links und Neuladen nach; wer die Seite bloß öffnet, kann sie ohne Rückfrage wieder verlassen.
 */
export function AttendanceSheet({
  eventId,
  editable,
  rows: initialRows,
  people,
  groups,
}: {
  eventId: string;
  editable: boolean;
  rows: AttendanceSheetRow[];
  people: { id: string; name: string }[];
  groups: { id: string; name: string; memberIds: string[] }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((row) => ({ ...row, proposed: row.status, added: false })),
  );
  const [groupId, setGroupId] = useState("");
  const [personId, setPersonId] = useState("");
  const [notice, setNotice] = useState("");
  /** Element (per `id`), das nach dem nächsten Zeichnen der Liste den Fokus bekommt. */
  const focusNext = useRef<string | null>(null);
  const groupSelect = useRef<HTMLSelectElement>(null);

  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const onList = new Set(rows.map((row) => row.memberId));
  const candidates = people.filter((person) => !onList.has(person.id));
  const counts = countStatuses(rows.map((row) => row.status));
  const open = rows.filter((row) => row.status === null).length;
  const changes = rows.filter((row) => row.status !== row.saved);
  const unsaved = pendingAttendance(rows);
  const toSave = unsaved.toSave;
  // Nur selbst gemachte Änderungen und nur beim Erfassen: Vorausgefüllte Absagen allein fragen beim Verlassen nicht nach.
  const dirty = editable && unsaved.edited > 0;

  // Fokus nach einer Änderung der Liste gezielt setzen: nach „+ Person“ auf „Anwesend“ der neuen Zeile (sie kann mitten in
  // der Liste stehen), nach „Alle anwesend“ auf „Speichern (n)“ – der gedrückte Knopf ist dann gesperrt, der Fokus fiele
  // sonst an den Seitenanfang. Ist „Speichern“ gesperrt (nichts geändert), auf die erste Person.
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = null;
    const target = document.getElementById(id);
    if (target instanceof HTMLButtonElement && target.disabled) {
      const first = rows[0];
      if (first)
        document.getElementById(optionId(first.memberId, first.status ?? "PRESENT"))?.focus();
      return;
    }
    target?.focus();
  }, [rows]);

  // Selbst gemachte, ungespeicherte Änderungen nicht versehentlich verlieren: Neuladen und Tab schließen fragt der Browser
  // nach (`beforeunload`), Links innerhalb der Anwendung (z. B. „‹ Termin“, Seitenleiste) fragen wir selbst – die Klicks
  // werden vor Next.js abgefangen (Capture-Phase); `preventDefault` hält dann auch `Link` an. Die Zurück-Taste des Browsers
  // lässt sich so nicht abfangen.
  useEffect(() => {
    if (!dirty) return;
    let confirmed = false;
    const warn = (event: BeforeUnloadEvent) => {
      if (!confirmed) event.preventDefault();
    };
    const guardLinks = (event: MouseEvent) => {
      if (!leavesPage(event)) return;
      if (!window.confirm(LEAVE_QUESTION)) {
        event.preventDefault();
        return;
      }
      confirmed = true; // Beim Verlassen nicht noch einmal per `beforeunload` fragen
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [dirty]);

  const sorted = (list: Row[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, "de"));

  const setStatus = (memberId: string, status: AttendanceStatus | null) =>
    setRows((list) => list.map((row) => (row.memberId === memberId ? { ...row, status } : row)));

  const remove = (row: Row) =>
    setRows((list) =>
      row.added && row.saved === null
        ? list.filter((r) => r.memberId !== row.memberId)
        : list.map((r) => (r.memberId === row.memberId ? { ...r, status: null } : r)),
    );

  const addMembers = (ids: string[]) =>
    setRows((list) =>
      sorted([
        ...list,
        ...ids.map((id) => ({
          memberId: id,
          name: nameOf.get(id) ?? "Mitglied",
          status: null,
          saved: null,
          proposed: null,
          rsvp: null,
          added: true,
        })),
      ]),
    );

  function loadGroup() {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const ids = group.memberIds.filter((id) => !onList.has(id) && nameOf.has(id));
    addMembers(ids);
    setGroupId("");
    setNotice(
      ids.length === 0
        ? `Alle aus „${group.name}“ stehen schon auf der Liste.`
        : `${ids.length} ${ids.length === 1 ? "Person" : "Personen"} aus „${group.name}“ hinzugefügt.`,
    );
    // „Gruppe laden“ ist ohne gewählte Gruppe gesperrt – zurück ins Auswahlfeld, gleich bereit für die nächste Gruppe.
    groupSelect.current?.focus();
  }

  function addPerson() {
    if (!personId) return;
    addMembers([personId]);
    setNotice(`${nameOf.get(personId) ?? "Person"} hinzugefügt.`);
    focusNext.current = optionId(personId, "PRESENT");
    setPersonId("");
  }

  function markAllPresent() {
    setRows((list) =>
      list.map((row) => (row.status === null ? { ...row, status: "PRESENT" } : row)),
    );
    setNotice(`${open} ${open === 1 ? "Person" : "Personen"} als anwesend markiert.`);
    focusNext.current = SAVE_BUTTON_ID;
  }

  function save() {
    const entries = changes.map((row) => ({ memberId: row.memberId, status: row.status }));
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveAttendanceAction>>;
      try {
        result = await saveAttendanceAction({ eventId, entries });
      } catch {
        toast.error(CONNECTION_ERROR);
        return;
      }
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Anwesenheit gespeichert: ${countsText(result.data)}.`);
      setNotice("");
      setRows((list) =>
        list
          .filter((row) => row.status !== null || row.rsvp !== null)
          .map((row) => ({ ...row, saved: row.status, proposed: row.status, added: false })),
      );
      router.refresh();
    });
  }

  if (!editable) {
    const recorded = rows.filter((row) => row.saved !== null);
    return (
      <PageSection
        title="Personen"
        description={summary(
          recorded.length,
          countStatuses(recorded.map((row) => row.saved)),
          null,
        )}
      >
        {recorded.length === 0 ? (
          <CompactEmpty card icon={<UsersIcon />} accent="violet" title="Nichts erfasst">
            Für diesen Termin ist keine Anwesenheit gespeichert.
          </CompactEmpty>
        ) : (
          <ul className={cn(CARD_SURFACE, "divide-y")}>
            {recorded.map((row) => (
              <li
                key={row.memberId}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="font-medium">{row.name}</span>
                <span className="text-muted-foreground">
                  {row.saved && ATTENDANCE_RESULT_LABEL[row.saved]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    );
  }

  return (
    <>
      <PageSection
        title="Personen"
        description={summary(rows.length, counts, open)}
        // Am Handy über die ganze Breite – der wichtigste Knopf am Spielfeldrand.
        actionsClassName="max-sm:w-full"
        actions={
          <Button
            variant="outline"
            className="max-sm:w-full pointer-coarse:h-11"
            disabled={open === 0 || pending}
            onClick={markAllPresent}
          >
            <CheckIcon /> Alle anwesend
          </Button>
        }
      >
        {/* Auswahlfelder mit Breite in Prozent bzw. fest: So macht ein sehr langer Name die Seite am Handy nicht breiter. */}
        {(groups.length > 0 || candidates.length > 0) && (
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
            {groups.length > 0 && (
              <div className="flex gap-2">
                <NativeSelect
                  ref={groupSelect}
                  aria-label="Gruppe wählen"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full min-w-0 flex-1 sm:w-56 sm:flex-none pointer-coarse:h-11"
                >
                  <option value="">Gruppe wählen …</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  variant="outline"
                  className="pointer-coarse:h-11"
                  disabled={!groupId || pending}
                  onClick={loadGroup}
                >
                  <UsersIcon /> Gruppe laden
                </Button>
              </div>
            )}
            {candidates.length > 0 && (
              <div className="flex gap-2">
                <NativeSelect
                  aria-label="Person wählen"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  className="w-full min-w-0 flex-1 sm:w-56 sm:flex-none pointer-coarse:h-11"
                >
                  <option value="">Person wählen …</option>
                  {candidates.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  variant="outline"
                  className="pointer-coarse:h-11"
                  aria-label="Person hinzufügen"
                  disabled={!personId || pending}
                  onClick={addPerson}
                >
                  <UserPlusIcon /> Person
                </Button>
              </div>
            )}
          </div>
        )}
        {/* Die Meldezeile bleibt immer im Baum (leer nur unsichtbar): Eine Live-Region, die erst mit ihrem Text erscheint,
            lesen VoiceOver und teils NVDA nicht vor. `sr-only` ist absolut positioniert und lässt keine Lücke. */}
        <p role="status" className={cn("text-sm text-muted-foreground", !notice && "sr-only")}>
          {notice}
        </p>

        {rows.length === 0 ? (
          <CompactEmpty
            card
            icon={<UsersIcon />}
            accent="violet"
            title="Noch niemand auf der Liste"
          >
            Hier stehen alle, die zu- oder abgesagt haben. Lade eine Gruppe oder füge Personen
            einzeln hinzu.
          </CompactEmpty>
        ) : (
          <ul className={cn(CARD_SURFACE, "divide-y")} aria-label="Anwesenheit je Person">
            {rows.map((row) => {
              const nameId = `anwesenheit-${row.memberId}-name`;
              const hint =
                row.status === null && row.saved !== null
                  ? "wird beim Speichern entfernt"
                  : row.rsvp === "ACCEPTED"
                    ? "hat zugesagt"
                    : row.rsvp === "DECLINED"
                      ? "hat abgesagt"
                      : row.added
                        ? "neu auf der Liste"
                        : null;
              const removable = row.status !== null || row.added;
              return (
                <li
                  key={row.memberId}
                  className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4"
                >
                  <div className="flex min-h-9 items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p id={nameId} className="font-medium break-words">
                        {row.name}
                      </p>
                      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                    </div>
                    {removable && (
                      <IconButton
                        label={
                          row.added && row.saved === null
                            ? `${row.name} von der Liste nehmen`
                            : `Eintrag für ${row.name} entfernen`
                        }
                        // Fokus nie unter der festen Leiste „Speichern“ (WCAG 2.4.11): beim Scrollen Platz lassen
                        className="shrink-0 scroll-mb-28 text-muted-foreground pointer-coarse:size-11"
                        disabled={pending}
                        onClick={() => remove(row)}
                      >
                        <XIcon />
                      </IconButton>
                    )}
                  </div>
                  {/* Am Handy bekommt die Mitte („Entschuldigt“, das längste Wort) mehr Platz, ab 768 px drei gleiche Spalten. Keine
                      Spalte wird schmaler als ihre Beschriftung in Fettschrift (`max-content`): In breiteren Schriften (z. B.
                      DejaVu Sans unter Linux) passt „Anwesend“ bei 360 px sonst nicht mehr in sein Feld – dann nimmt es sich
                      den Platz, den „Fehlt“ nicht braucht. */}
                  <fieldset
                    aria-labelledby={nameId}
                    disabled={pending}
                    className="grid grid-cols-[minmax(max-content,1fr)_minmax(max-content,1.3fr)_minmax(max-content,1fr)] gap-2 md:w-[26rem] md:grid-cols-3"
                  >
                    {ATTENDANCE_STATUSES.map((status) => (
                      <label
                        key={status}
                        htmlFor={optionId(row.memberId, status)}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border bg-card px-1 text-center text-sm font-medium text-muted-foreground transition-colors select-none hover:bg-muted/60 has-checked:font-semibold has-disabled:cursor-not-allowed has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 motion-reduce:transition-none sm:px-2 md:min-h-10",
                          CHECKED[status],
                        )}
                      >
                        <input
                          type="radio"
                          id={optionId(row.memberId, status)}
                          name={`anwesenheit-${row.memberId}`}
                          value={status}
                          checked={row.status === status}
                          onChange={() => setStatus(row.memberId, status)}
                          // Fokus nie unter der festen Leiste „Speichern“ (WCAG 2.4.11): beim Scrollen Platz lassen
                          className="peer sr-only scroll-mb-28"
                        />
                        {/* Haken erst ab 640 px – am Handy passt „Entschuldigt“ sonst nicht in sein Feld. Die Auswahl zeigen
                            dort Tönung, Rand und Fettschrift. */}
                        <CheckIcon
                          aria-hidden="true"
                          className="hidden size-4 shrink-0 sm:peer-checked:block"
                        />
                        {/* Unsichtbare fette Kopie (Höhe 0, für Screenreader stumm) hält die Breite der Fettschrift frei – so
                            springen die Spalten beim Antippen nicht, wenn die gewählte Beschriftung fett wird. */}
                        <span
                          data-label={ATTENDANCE_STATUS_LABEL[status]}
                          className="grid after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]"
                        >
                          {ATTENDANCE_STATUS_LABEL[status]}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>

      {/* Feste Leiste unten: bleibt beim Scrollen durch lange Listen erreichbar (am Handy über die ganze Breite). */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:-mx-6 sm:-mb-6 sm:px-6 xl:-mx-8 xl:-mb-8 xl:px-8">
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {/* Am Handy nur, wenn vorausgefüllte Absagen dabei sind – sonst erklärt die Zahl auf dem Knopf alles. */}
          {toSave > 0 && (
            <p
              className={cn(
                "mr-auto text-sm text-muted-foreground",
                unsaved.prefilled === 0 ? "hidden sm:block" : "max-sm:basis-full",
              )}
            >
              {pendingAttendanceText(unsaved)}
            </p>
          )}
          <Button
            id={SAVE_BUTTON_ID}
            onClick={save}
            disabled={toSave === 0 || pending}
            className="max-sm:flex-1 pointer-coarse:h-11"
          >
            {pending ? (
              <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <CheckIcon aria-hidden="true" />
            )}
            Speichern ({toSave})
          </Button>
        </div>
      </div>
    </>
  );
}

/** „17 Personen · 14 anwesend · 2 entschuldigt · 1 fehlt · 0 offen“ (offen nur beim Erfassen). */
function summary(
  people: number,
  counts: { present: number; excused: number; absent: number },
  open: number | null,
): string {
  const parts = [
    `${people} ${people === 1 ? "Person" : "Personen"}`,
    `${counts.present} anwesend`,
    `${counts.excused} entschuldigt`,
    `${counts.absent} ${counts.absent === 1 ? "fehlt" : "fehlen"}`,
  ];
  if (open !== null) parts.push(`${open} offen`);
  return parts.join(" · ");
}
