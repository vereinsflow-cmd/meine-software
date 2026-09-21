"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, SearchXIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FaqItem, FaqSection } from "../faq";

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

function haystack(section: FaqSection, item: FaqItem): string {
  return normalize(
    [
      section.title,
      item.question,
      ...(item.answer ?? []),
      ...(item.steps ?? []),
      item.tip ?? "",
      item.keywords ?? "",
    ].join(" "),
  );
}

/**
 * Bedienungsanleitung mit Suche. Die Fragen sind aufklappbar (`<details>`: ohne Skript bedienbar, von Screenreadern
 * verstanden). Ein Anker `#faq-<id>` in der Adresse klappt die passende Frage auf. Alle Suchwörter müssen vorkommen
 * (Umlaute sind egal: „ueberschicht“ findet „Überschicht“).
 */
export function FaqList({ sections }: { sections: FaqSection[] }) {
  const [query, setQuery] = useState("");

  const words = useMemo(() => normalize(query).split(/\s+/).filter(Boolean), [query]);
  const filtered = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            if (words.length === 0) return true;
            const text = haystack(section, item);
            return words.every((word) => text.includes(word));
          }),
        }))
        .filter((section) => section.items.length > 0),
    [sections, words],
  );
  const total = filtered.reduce((sum, section) => sum + section.items.length, 0);

  // Ein Sprung auf "#faq-…" öffnet die Frage (reine DOM-Änderung; kein Zustand nötig).
  useEffect(() => {
    const open = () => {
      const target = window.location.hash
        ? document.getElementById(window.location.hash.slice(1))
        : null;
      if (target instanceof HTMLDetailsElement) {
        target.open = true;
        target.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5 sm:max-w-md">
        <Label htmlFor="faq-suche">Anleitung durchsuchen</Label>
        <Input
          id="faq-suche"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="z. B. Passwort, Schicht, Kalender …"
          autoComplete="off"
        />
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {words.length > 0
            ? total === 0
              ? "Keine passende Frage gefunden."
              : `${total} ${total === 1 ? "Frage" : "Fragen"} gefunden.`
            : ""}
        </p>
      </div>

      {total === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          <SearchXIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            Dazu gibt es noch keine Antwort. Versuche ein anderes Wort – oder melde dein Anliegen
            über „Problem melden“, damit dir die Vereinsverwaltung helfen kann.
          </p>
        </div>
      ) : (
        filtered.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`faq-abschnitt-${section.id}`}
            className="grid gap-2"
          >
            <div>
              <h3 id={`faq-abschnitt-${section.id}`} className="text-base font-semibold">
                {section.title}
              </h3>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            <div className="divide-y rounded-xl border">
              {section.items.map((item) => (
                <details
                  key={item.id}
                  id={`faq-${item.id}`}
                  // Bei aktiver Suche sind die Treffer aufgeklappt.
                  open={words.length > 0 ? true : undefined}
                  className="group scroll-mt-20 px-4 py-3"
                >
                  <summary className="cursor-pointer list-none rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <span className="flex items-start justify-between gap-3">
                      <span>{item.question}</span>
                      <span
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                      >
                        <ArrowRightIcon className="size-4" />
                      </span>
                    </span>
                  </summary>
                  <div className="mt-3 grid gap-3 text-sm">
                    {item.answer?.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {item.steps && (
                      <ol className="list-decimal space-y-1.5 pl-5 marker:font-medium">
                        {item.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    )}
                    {item.tip && (
                      <p className="rounded-lg bg-muted px-3 py-2 text-muted-foreground">
                        <span className="font-medium text-foreground">Hinweis: </span>
                        {item.tip}
                      </p>
                    )}
                    {item.link && (
                      <Link
                        href={item.link.href}
                        className="inline-flex w-fit items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {item.link.label} <ArrowRightIcon className="size-3.5" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
