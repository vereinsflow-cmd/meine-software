import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AreaError } from "@/components/shared/area-error";
import { PageSection, PageStack } from "@/components/shared/page-section";
import {
  CalendarPageSkeleton,
  CardGridSkeleton,
  ChatPageSkeleton,
  DetailPageSkeleton,
  ListPageSkeleton,
  TablePageSkeleton,
} from "@/components/shared/page-skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { contrastRgb, mix, tokens, type Rgb } from "./contrast-helpers";

/**
 * Gemeinsame Bausteine der Oberfläche (Design-Feinschliff, 14.10.2026): Ladegerüste, Fehlermeldung eines Bereichs,
 * Seitenrhythmus, gestapelte Tabellen am Handy und die Farben der Nachrichten.
 */

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

describe("Ladegerüste ganzer Seiten", () => {
  it.each([
    ["ListPageSkeleton", ListPageSkeleton],
    ["TablePageSkeleton", TablePageSkeleton],
    ["CardGridSkeleton", CardGridSkeleton],
    ["DetailPageSkeleton", DetailPageSkeleton],
    ["CalendarPageSkeleton", CalendarPageSkeleton],
    ["ChatPageSkeleton", ChatPageSkeleton],
  ] as const)(
    "%s ist eine Live-Region mit „Wird geladen …“ und pulsiert nur ohne reduzierte Bewegung",
    (_, Skeleton) => {
      const markup = html(createElement(Skeleton));
      expect(markup).toMatch(/^<div role="status" aria-live="polite" aria-busy="true"/);
      expect(markup).toContain('<span class="sr-only">Wird geladen …</span>');
      expect(markup).toContain("motion-safe:animate-pulse");
      expect(markup).not.toMatch(/[\s"]animate-pulse/);
    },
  );

  it("nennt auf Wunsch, was geladen wird", () => {
    expect(
      html(createElement(TablePageSkeleton, { label: "Mitglieder werden geladen …" })),
    ).toContain("Mitglieder werden geladen …");
  });
});

describe("Fehlermeldung eines Bereichs", () => {
  const error = Object.assign(new Error("geheim"), { digest: "abc123" });

  it("sagt in einfachen Worten, was los ist, und bietet „Nochmal versuchen“ und einen Weg zurück", () => {
    const markup = html(createElement(AreaError, { error, reset: () => {} }));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Dieser Bereich konnte nicht geladen werden.");
    expect(markup).toContain("Nochmal versuchen");
    expect(markup).toContain('href="/dashboard"');
    expect(markup).toContain("Zur Übersicht");
    expect(markup).toContain("abc123");
    expect(markup).not.toContain("geheim");
  });

  it("führt auf Wunsch zur Übersicht des Bereichs", () => {
    const markup = html(
      createElement(AreaError, {
        error,
        reset: () => {},
        homeHref: "/finanzen",
        homeLabel: "Zur Finanzübersicht",
      }),
    );
    expect(markup).toContain('href="/finanzen"');
    expect(markup).toContain("Zur Finanzübersicht");
  });
});

/** Kinder kommen als drittes Argument von `createElement` (nicht als Eigenschaft). */
type SectionProps = ComponentProps<typeof PageSection>;

describe("Seitenrhythmus", () => {
  it("PageStack ist eine Spalte mit 1,5 rem Lücke", () => {
    expect(html(createElement(PageStack, null, "x"))).toBe(
      '<div data-slot="page-stack" class="flex flex-col gap-6">x</div>',
    );
  });

  it("PageSection ist über ihre Überschrift (Ebene 2) benannt", () => {
    const markup = html(
      createElement(
        PageSection,
        { title: "Offene Anträge", description: "Älteste zuerst" } as SectionProps,
        "Inhalt",
      ),
    );
    const id = markup.match(/<section aria-labelledby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(markup).toContain(`<h2 id="${id}" class="text-lg font-semibold">Offene Anträge</h2>`);
    expect(markup).toContain("Älteste zuerst");
  });

  it("PageSection nimmt eine feste Kennung und kann Fokusziel sein", () => {
    const markup = html(
      createElement(
        PageSection,
        { id: "tagesablauf", title: "Tagesablauf", focusTarget: true } as SectionProps,
        "x",
      ),
    );
    expect(markup).toContain('aria-labelledby="tagesablauf"');
    expect(markup).toMatch(/<h2 id="tagesablauf" tabindex="-1"/);
  });
});

describe("Tabellen am Handy gestapelt", () => {
  const table = (stack: boolean) =>
    html(
      createElement(
        Table,
        { stack },
        createElement(
          TableHeader,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableHead, null, "Name"),
            createElement(TableHead, null, "Status"),
          ),
        ),
        createElement(
          TableBody,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableCell, null, "Anna"),
            createElement(TableCell, { label: "Status" }, "Aktiv"),
          ),
        ),
      ),
    );

  it("trägt gestapelt ausdrückliche Rollen und die Beschriftung der Zelle", () => {
    const markup = table(true);
    expect(markup).toContain('data-stack=""');
    expect(markup).toContain('role="table"');
    expect(markup.match(/role="rowgroup"/g)).toHaveLength(2);
    expect(markup.match(/role="row"/g)).toHaveLength(2);
    expect(markup.match(/role="columnheader"/g)).toHaveLength(2);
    expect(markup.match(/role="cell"/g)).toHaveLength(2);
    expect(markup).toContain('data-label="Status"');
  });

  it("bleibt ohne `stack` eine gewöhnliche Tabelle", () => {
    const markup = table(false);
    expect(markup).not.toContain("data-stack");
    expect(markup).not.toContain(' role="');
  });

  it("das Aussehen steht in globals.css: Anzeige schwach (hidden gewinnt), Abstände stark", () => {
    const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");
    expect(css).toMatch(/@layer components \{\s*@media \(width < 48rem\) \{\s*table\[data-stack\]/);
    expect(css).toContain('content: attr(data-label) / "";');
  });
});

/** #rrggbb → sRGB */
function hex(value: string): Rgb {
  const match = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) throw new Error(`Kein Hex-Wert: ${value}`);
  return match.slice(1).map((part) => parseInt(part, 16)) as Rgb;
}

describe.each([
  { scheme: "hell", selector: ":root" as const },
  { scheme: "dunkel", selector: ".dark" as const },
])("Farben der Nachrichten ($scheme)", ({ selector }) => {
  const t = tokens(selector);
  const names = [
    "--chat-wallpaper",
    "--chat-day",
    "--chat-bubble-own",
    "--chat-bubble-other",
    "--chat-bubble-foreground",
    "--chat-meta",
  ];

  it("alle Tokens sind gesetzt", () => {
    for (const name of names) expect(t[name], name).toBeTruthy();
  });

  it.each(["--chat-bubble-own", "--chat-bubble-other"])(
    "Schrift und Uhrzeit auf %s: mindestens 4,5:1",
    (bubble) => {
      const ground = hex(t[bubble]!);
      const meta = t["--chat-meta"]!;
      const metaRgb = meta.startsWith("rgb(255 255 255 / 80%)")
        ? mix([255, 255, 255], 0.8, ground)
        : hex(meta);
      expect(contrastRgb(hex(t["--chat-bubble-foreground"]!), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRgb(metaRgb, ground)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("Bausteine in src/components halten die Skala ein", () => {
  const root = path.resolve(__dirname, "../../src/components");
  const files = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) files(full, out);
      else if (/\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  };

  it("keine festen Kleinstgrößen, Rundungen neben der Skala oder Hex-Farben in Klassen", () => {
    const forbidden =
      /text-\[(?:\d+px|0\.6875rem|0\.8125rem|0\.9375rem)\]|rounded(?:-[a-z]+)?-\[(?:1\.75rem|0\.7rem|0\.85rem|[23]px)\]|(?:bg|text|border|ring)-\[#[0-9a-f]{3,8}\]/i;
    const offenders = files(root)
      .filter((file) => forbidden.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});
