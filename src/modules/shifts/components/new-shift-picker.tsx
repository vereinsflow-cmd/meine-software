"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Eine Veranstaltung in der Auswahl – Datum und Zeit schon als Text (die Seite rechnet in Berliner Zeit). */
export interface NewShiftChoice {
  id: string;
  title: string;
  /** z. B. „Sa., 24. Okt.“ */
  date: string;
  /** z. B. „14:00 – 22:00 Uhr“ oder „ganztägig“ */
  time: string;
  /** z. B. „Entwurf · Fußball · 3 Schichten“ */
  details: string;
}

/** Ab so vielen Veranstaltungen hilft ein Suchfeld (Trainings jede Woche …). */
const SEARCH_FROM = 7;

/**
 * „Neue Schicht“ auf der Übersicht der Helferplanung: Eine Schicht gehört immer zu einer Veranstaltung – der Dialog fragt
 * deshalb zuerst „Für welche Veranstaltung?“. Die Auswahl führt in deren Helferplan, wo sich „Neue Schicht“ gleich öffnet
 * (`?neu=schicht`). Angeboten wird nur, wofür der Benutzer Schichten anlegen darf (`listEventsForNewShift`); gibt es
 * nichts, erklärt der Dialog das und bietet – wenn erlaubt – „Veranstaltung anlegen“ an.
 */
export function NewShiftPicker({
  choices,
  more,
  ownDepartments,
  canCreateEvent,
}: {
  choices: NewShiftChoice[];
  /** Es gibt mehr Veranstaltungen, als die Auswahl zeigt. */
  more: boolean;
  /** Schichten nur für Veranstaltungen der eigenen Abteilung(en): wie viele – 0 = vereinsweit (für die Erklärung). */
  ownDepartments: number;
  canCreateEvent: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> Neue Schicht
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={focusFirstChoice}>
        {/* Eigene Komponente: Sie entsteht bei jedem Öffnen neu – die Suche beginnt leer. */}
        {choices.length === 0 ? (
          <NothingToChoose ownDepartments={ownDepartments} canCreateEvent={canCreateEvent} />
        ) : (
          <ChoiceList choices={choices} more={more} canCreateEvent={canCreateEvent} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Anfangsfokus: Mit Suchfeld steht er dort (wie Radix es ohnehin macht). Ohne Suchfeld auf der ersten Veranstaltung –
 * Radix überspringt dabei Links, und die Auswahl besteht nur aus Links: Der Fokus landete sonst auf „Schließen“, und ein
 * sofortiges Enter schlösse den Dialog, statt zu wählen. Ohne Auswahl (keine Veranstaltung) bleibt es bei Radix.
 */
function focusFirstChoice(event: Event) {
  const content = event.currentTarget;
  if (!(content instanceof HTMLElement) || content.querySelector("input")) return;
  const first = content.querySelector<HTMLElement>("[data-choice]");
  if (!first) return;
  event.preventDefault();
  first.focus();
}

function ChoiceList({
  choices,
  more,
  canCreateEvent,
}: {
  choices: NewShiftChoice[];
  more: boolean;
  canCreateEvent: boolean;
}) {
  const searchId = useId();
  const [filter, setFilter] = useState("");
  const searchable = choices.length >= SEARCH_FROM;
  // Jedes Wort muss vorkommen – im Namen, im Datum oder in den Angaben darunter („Training Okt“).
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = choices.filter((choice) => {
    const text = `${choice.title} ${choice.date} ${choice.details}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const count = `${visible.length} ${visible.length === 1 ? "Veranstaltung" : "Veranstaltungen"}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Für welche Veranstaltung?</DialogTitle>
        <DialogDescription>
          Eine Schicht gehört immer zu einer Veranstaltung. Wähle sie aus – im Helferplan öffnet
          sich dann „Neue Schicht“.
        </DialogDescription>
      </DialogHeader>
      {searchable && (
        <div className="grid gap-1.5">
          <Label htmlFor={searchId}>Veranstaltung suchen</Label>
          <Input
            id={searchId}
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Name oder Datum …"
            autoComplete="off"
            enterKeyHint="search"
          />
          {/* Für Screenreader: wie viele beim Tippen übrig bleiben. */}
          <p role="status" className="sr-only">
            {words.length > 0 ? count : ""}
          </p>
        </div>
      )}
      <div className="max-h-[min(24rem,50dvh)] overflow-y-auto rounded-lg border">
        {visible.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">Keine Veranstaltung gefunden.</p>
        ) : (
          <ul aria-label="Veranstaltungen">
            {visible.map((choice) => (
              <li key={choice.id} className="[&+&]:border-t">
                {/* Ab `sm` Datum und Zeit links in einer Spalte, am Handy in einer Zeile über dem Namen. */}
                <Link
                  href={`/helferplanung/${choice.id}?neu=schicht`}
                  data-choice
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 transition-colors hover:bg-muted focus-visible:-outline-offset-2 motion-reduce:transition-none sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]"
                >
                  <span className="text-sm tabular-nums">
                    <span className="font-semibold sm:block">{choice.date}</span>{" "}
                    <span aria-hidden="true" className="text-muted-foreground sm:hidden">
                      ·{" "}
                    </span>
                    <span className="text-muted-foreground sm:block sm:whitespace-nowrap">
                      {choice.time}
                    </span>
                  </span>
                  <span className="min-w-0 max-sm:col-start-1">
                    <span className="block font-medium break-words">{choice.title}</span>
                    <span className="block text-sm text-muted-foreground">{choice.details}</span>
                  </span>
                  <ChevronRightIcon
                    className="size-4 text-muted-foreground max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {(more || canCreateEvent) && (
        <div className="grid gap-1 text-sm text-muted-foreground">
          {more && (
            <p>
              Angezeigt werden die nächsten {choices.length} Veranstaltungen. Spätere erreichst du
              über die Veranstaltung selbst („Helferplanung öffnen“).
            </p>
          )}
          {canCreateEvent && (
            <p>
              Die Veranstaltung fehlt noch?{" "}
              <Link
                href="/veranstaltungen/neu"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Veranstaltung anlegen
              </Link>
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** Erklärung, wenn nichts zur Auswahl steht – als Abteilungsleitung mit „deiner Abteilung“ bzw. „deiner Abteilungen“. */
export function nothingToChooseText(ownDepartments: number, canCreateEvent: boolean): string {
  const which =
    ownDepartments === 0
      ? ""
      : ` Veranstaltung ${ownDepartments === 1 ? "deiner Abteilung" : "deiner Abteilungen"}`;
  const next = canCreateEvent
    ? "Lege zuerst die Veranstaltung an – danach planst du dort die Schichten."
    : "Sobald eine angelegt ist, kannst du hier Schichten planen.";
  return `Eine Schicht gehört immer zu einer Veranstaltung. Gerade steht keine${which} an, für die du Schichten anlegen kannst. ${next}`;
}

function NothingToChoose({
  ownDepartments,
  canCreateEvent,
}: {
  ownDepartments: number;
  canCreateEvent: boolean;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Noch keine passende Veranstaltung</DialogTitle>
        <DialogDescription>{nothingToChooseText(ownDepartments, canCreateEvent)}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Schließen</Button>
        </DialogClose>
        {canCreateEvent && (
          <Button asChild>
            <Link href="/veranstaltungen/neu">
              <PlusIcon /> Veranstaltung anlegen
            </Link>
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
