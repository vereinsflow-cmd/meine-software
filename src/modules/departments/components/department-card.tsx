import Link from "next/link";
import { AREA_ICON } from "@/components/shared/area-icons";
import { cn } from "@/lib/utils";
import {
  CARD_SCRIM,
  departmentFallbackColors,
  departmentImage,
} from "@/modules/departments/department-image";
import type { DepartmentListItem } from "@/modules/departments/service";

/**
 * Angezeigte Breite der Karten fürs `srcset` (gemessen bei 390, 768, 1024, 1280, 1440 und 1920 px): am Handy eine Spalte über
 * die ganze Breite, ab 768 px zwei, ab 1280 px drei Spalten; der Inhalt wächst höchstens auf 96 rem (Karte dann rund 530 px).
 * In px, weil `rem` in `sizes` die Grundgröße des Browsers meint, nicht die mitwachsende Schrift der App. Bei drei Spalten
 * knapp gerechnet, damit ein 1440er-Bildschirm mit doppelter Auflösung die 800er-Datei nimmt statt der 1200er.
 */
const CARD_SIZES =
  "(min-width: 1280px) min(calc(33.3vw - 82px), 528px), (min-width: 1024px) calc(50vw - 88px), (min-width: 768px) calc(50vw - 36px), calc(100vw - 32px)";

/**
 * Hintergrund einer Abteilung: das Foto zur Sportart im Namen oder – ohne passendes Foto – ein Verlauf in der
 * Abteilungsfarbe (dunkel genug für weiße Schrift, siehe `departmentFallbackColors`). Rein schmückend (`alt=""`,
 * `aria-hidden`); füllt das nächste positionierte Elternelement.
 */
export function DepartmentCover({
  name,
  color,
  sizes,
  eager = false,
  inactive = false,
  className,
}: {
  name: string;
  color: string | null;
  sizes: string;
  /** Sofort laden (Karten im ersten Bild); alle anderen erst, wenn sie ins Bild scrollen. */
  eager?: boolean;
  /** Deaktivierte Abteilung: Foto in Graustufen. */
  inactive?: boolean;
  className?: string;
}) {
  const image = departmentImage(name);
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- fertige WebP-Größen aus public/ mit srcset; next/image brächte hier nichts
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes={sizes}
        alt=""
        aria-hidden="true"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        data-department-image={image.sport}
        className={cn(
          "absolute inset-0 size-full object-cover select-none",
          inactive && "grayscale",
          className,
        )}
        style={{ objectPosition: image.position }}
      />
    );
  }
  const { from, to, glow } = departmentFallbackColors(color);
  return (
    <div
      aria-hidden="true"
      data-department-image="verlauf"
      className={cn("absolute inset-0", className)}
      style={{
        backgroundImage: `radial-gradient(circle at 100% 0%, ${glow}, ${glow}80 7rem, transparent 18rem), linear-gradient(150deg, ${from}, ${to})`,
      }}
    />
  );
}

/**
 * Karte einer Abteilung in der Übersicht – nach Luis' Vorlage (Kacheln „Gym“, „RunClubs“ …): Foto über die ganze Karte mit
 * großer Rundung, unten ein dunkler Verlauf mit weißer Schrift. Die ganze Karte führt zur Abteilung (der Link im Namen dehnt
 * seine Klickfläche per `after` aus); der Fokusrahmen sitzt an der Karte selbst. Beim Überfahren wächst der Schatten und
 * das Bild zoomt leicht heran, beim Drücken gibt die Karte minimal nach – Bewegung nur ohne „Bewegung reduzieren“.
 */
export function DepartmentCard({
  department,
  eager,
}: {
  department: DepartmentListItem;
  eager: boolean;
}) {
  return (
    <article
      className={cn(
        "group/abteilung relative isolate flex h-full min-h-80 flex-col justify-end overflow-hidden rounded-3xl bg-slate-950 text-white sm:min-h-88",
        "shadow-[0_1px_2px_rgb(15_23_42/0.06),0_18px_36px_-24px_rgb(15_23_42/0.55)] ring-1 ring-black/5 dark:shadow-none dark:ring-white/10",
        "transition-[box-shadow,scale] duration-200 ease-out hover:shadow-[0_2px_4px_rgb(15_23_42/0.08),0_24px_44px_-22px_rgb(15_23_42/0.6)] motion-reduce:transition-none",
        "motion-safe:has-[[data-slot=abteilung-link]:active]:scale-[0.985]",
        "has-[[data-slot=abteilung-link]:focus-visible]:ring-2 has-[[data-slot=abteilung-link]:focus-visible]:ring-ring has-[[data-slot=abteilung-link]:focus-visible]:ring-offset-2 has-[[data-slot=abteilung-link]:focus-visible]:ring-offset-background",
      )}
    >
      <DepartmentCover
        name={department.name}
        color={department.color}
        sizes={CARD_SIZES}
        eager={eager}
        inactive={!department.isActive}
        className="-z-10 transition-transform duration-500 ease-out motion-safe:group-hover/abteilung:scale-105"
      />
      {!department.isActive && (
        <span
          className={cn(
            "absolute top-4 right-4 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-white/25 backdrop-blur-sm",
            CARD_SCRIM.badge,
          )}
        >
          Deaktiviert
        </span>
      )}
      <div aria-hidden="true" className={cn("h-20 shrink-0", CARD_SCRIM.fade)} />
      {/* Feste Spalte (`minmax(0,1fr)`) und Umbruch auch mitten im Wort (`overflow-wrap: anywhere`): Lange Einzelwörter wie
          „Behindertensportgemeinschaft“ brechen um, statt die Karte zu sprengen oder rechts abgeschnitten zu werden. */}
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] gap-1.5 px-5 pb-5 [overflow-wrap:anywhere] [text-shadow:0_1px_2px_rgb(0_0_0/0.35)]",
          CARD_SCRIM.text,
        )}
      >
        <h2 className="flex items-start gap-2.5 text-2xl leading-tight font-semibold tracking-tight">
          {/* Abteilungsfarbe als kleiner Punkt – mit hellem Ring, damit auch dunkle Farben auf dem dunklen Grund erkennbar bleiben.
              Mittig zur ersten Zeile (`1lh`), auch wenn ein langer Name umbricht. */}
          <span
            className="mt-[calc((1lh-0.75rem)/2)] size-3 shrink-0 rounded-full ring-2 ring-white/80"
            style={{ backgroundColor: department.color ?? "rgb(255 255 255 / 0.6)" }}
            aria-hidden="true"
          />
          <Link
            href={`/abteilungen/${department.id}`}
            data-slot="abteilung-link"
            className="min-w-0 underline-offset-4 group-hover/abteilung:underline after:absolute after:inset-0 after:rounded-3xl after:content-[''] focus-visible:outline-hidden"
          >
            {department.name}
          </Link>
        </h2>
        {department.description && (
          <p className="line-clamp-2 text-sm text-white/90">{department.description}</p>
        )}
        <div className="mt-1 grid gap-1 text-sm text-white/90">
          <p className="flex items-center gap-1.5">
            <AREA_ICON.mitglieder className="size-4 shrink-0" aria-hidden="true" />
            {department.memberCount} {department.memberCount === 1 ? "Mitglied" : "Mitglieder"}
            {department.groupCount > 0 &&
              ` · ${department.groupCount} ${department.groupCount === 1 ? "Gruppe" : "Gruppen"}`}
          </p>
          <p>
            Leitung:{" "}
            <span className="font-medium text-white">
              {department.leaders.length > 0
                ? department.leaders.map((l) => l.name).join(", ")
                : "–"}
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}
