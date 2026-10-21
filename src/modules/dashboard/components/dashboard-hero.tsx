import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import { ClubLogo } from "@/components/shared/club-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DepartmentCover } from "@/modules/departments/components/department-card";
import {
  HERO_BANNER_HEIGHT,
  HERO_BUTTON_TOKENS,
  heroCssVariables,
  heroFigureSteps,
  heroScrimGradient,
  heroStripShape,
  heroStripSizes,
  heroTitleEms,
  type HeroDepartment,
  type HeroFigure,
  type HeroFigureStep,
} from "../hero";
import { CustomizeDashboard, type CustomizeTab } from "./customize-dashboard";

/** Symbol und Farbe je Chip (Farbe auf dunklem Glas, rein schmückend – die Zahl steht daneben). */
const FIGURE_ICON: Record<HeroFigure["key"], { icon: React.ElementType; tone: string }> = {
  mitglieder: { icon: AREA_ICON.mitglieder, tone: "text-emerald-300" },
  termine: { icon: AREA_ICON.veranstaltungen, tone: "text-sky-300" },
  helferplaetze: { icon: AREA_ICON.helferplanung, tone: "text-amber-300" },
};

/**
 * Chips neben den Knöpfen (ab 62 rem): Symbol und lange Form erst ab der Stufe aus `heroFigureSteps`, damit die Reihe einzeilig
 * bleibt – je Stufe ausgeschriebene Klassen (nur die findet Tailwind). Ohne Symbol hat der Chip links denselben Rand wie rechts.
 */
const CHIP_ICON_FROM: Record<HeroFigureStep | "nie", { icon: string; chip: string }> = {
  62: { icon: "", chip: "" },
  66: {
    icon: "@[62rem]/buehne:hidden @[66rem]/buehne:grid",
    chip: "@[62rem]/buehne:pl-3.5 @[66rem]/buehne:pl-1.5",
  },
  70: {
    icon: "@[62rem]/buehne:hidden @[70rem]/buehne:grid",
    chip: "@[62rem]/buehne:pl-3.5 @[70rem]/buehne:pl-1.5",
  },
  74: {
    icon: "@[62rem]/buehne:hidden @[74rem]/buehne:grid",
    chip: "@[62rem]/buehne:pl-3.5 @[74rem]/buehne:pl-1.5",
  },
  78: {
    icon: "@[62rem]/buehne:hidden @[78rem]/buehne:grid",
    chip: "@[62rem]/buehne:pl-3.5 @[78rem]/buehne:pl-1.5",
  },
  84: {
    icon: "@[62rem]/buehne:hidden @[84rem]/buehne:grid",
    chip: "@[62rem]/buehne:pl-3.5 @[84rem]/buehne:pl-1.5",
  },
  90: {
    icon: "@[62rem]/buehne:hidden @[90rem]/buehne:grid",
    chip: "@[62rem]/buehne:pl-3.5 @[90rem]/buehne:pl-1.5",
  },
  nie: { icon: "@[62rem]/buehne:hidden", chip: "@[62rem]/buehne:pl-3.5" },
};
/** Lange Form („7 Termine in 30 Tagen“) ab dieser Stufe sichtbar (frühestens 70 rem), für Screenreader immer. */
const CHIP_LONG_FROM: Record<HeroFigureStep | "nie", string> = {
  62: "@[62rem]/buehne:not-sr-only",
  66: "@[66rem]/buehne:not-sr-only",
  70: "@[70rem]/buehne:not-sr-only",
  74: "@[74rem]/buehne:not-sr-only",
  78: "@[78rem]/buehne:not-sr-only",
  84: "@[84rem]/buehne:not-sr-only",
  90: "@[90rem]/buehne:not-sr-only",
  nie: "",
};

/** Schnitt des Handyfotos: unten schräg – links höher, rechts tiefer (dieselbe Neigung wie die Streifen). */
const PHONE_CUT = "polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - 2.75rem))";

/**
 * Glas auf Nacht (Farben aus `heroCssVariables`): Chips, Namensschilder, Vereinsschild am Handy. Beim Darüberfahren dunkler,
 * nie heller – so bleibt weiße Schrift auch dann über 4,5 : 1. Fokus: weißer Ring (auf Nacht gut zu sehen).
 */
const GLASS = "bg-(--hero-glass) ring-1 ring-white/15 ring-inset backdrop-blur-md";
const GLASS_FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-0";

/** Der runde Knopf „Anpassen“: Glas, weißes Symbol, weißer Fokusring. */
const CUSTOMIZE_GLASS = cn(
  "border border-white/20 bg-(--hero-glass-icon) text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] backdrop-blur-md",
  "hover:bg-(--hero-glass-hover) aria-expanded:bg-(--hero-glass-hover)",
  "focus-visible:border-white/80 focus-visible:ring-3 focus-visible:ring-white/45",
  "[&_svg:not([class*='size-'])]:size-[1.125rem]",
);

/** Schein unter den farbigen Knöpfen (Wunsch Luis, 20.10.2026: Grün kräftig mit Schein, wie die Hauptaktion). */
const GLOW = {
  primary:
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_12px_30px_-10px_var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary),black_14%)] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_14px_36px_-8px_var(--primary)]",
  success:
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_12px_30px_-10px_var(--success)] hover:bg-[color-mix(in_oklch,var(--success),black_14%)] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_14px_36px_-8px_var(--success)]",
} as const;

/** Gemeinsame Maße der Knöpfe: rund, 44 px hoch; am schmalen Handy weniger Innenabstand. */
const ACTION = "h-11 rounded-full px-5 text-base @max-[40rem]/buehne:px-3";

/**
 * Kopf des Dashboards – die „Vereins-Bühne“ (Entwurf D, umgesetzt am 21.10.2026): ein dunkles Banner über die ganze
 * Inhaltsbreite. Rechts stehen die echten Abteilungsfotos des Vereins als schräge Streifen (Abteilungen ohne passendes Foto mit
 * ihrem Farbverlauf, wie auf /abteilungen), oben rechts je ein Glas-Namensschild mit Farbpunkt; durch die Fugen scheint ein
 * blaues Licht. Von links legt sich ein Nachtverlauf darüber, darauf in Weiß Vereinslogo und -name, groß die Begrüßung und
 * Rolle · Datum. Unten links Glas-Chips mit echten Zahlen (Links in die Bereiche), unten rechts die Knöpfe und „Anpassen“ als
 * runder Glasknopf. Hell und dunkel sieht das Banner gleich aus – es ist immer „Nacht“.
 *
 * Gemessen wird die Breite des Kopfes (Containerabfrage `buehne`): ab 62 rem alles im Banner; ab 40 rem stehen die Knöpfe
 * darunter und „Anpassen“ oben rechts; schmaler (Handy) ist das Banner kürzer, zeigt oben EIN Foto (das der größten
 * Abteilung) schräg abgeschnitten mit einer blauen Lichtkante, darunter die Schrift auf Nacht, ohne Chips (die Zahlen stehen
 * direkt darunter in den Kennzahlkarten). Ohne Abteilungen: nur Nacht und Licht, die Begrüßung unten wie mit Foto.
 *
 * Die Höhe ist fest (`HERO_BANNER_HEIGHT`, dieselbe im Ladegerüst) – egal wie lang Name, Rolle oder Zahlen sind und ob es Fotos
 * gibt. Dafür bleibt jede Zeile einzeilig: Die Begrüßung wird bei langen Namen kleiner, der Rest kürzt sich notfalls mit „…“.
 *
 * Bilder: rein schmückend (`alt=""`). Das Foto, das am Handy stehen bleibt, lädt sofort und vorrangig; die übrigen Streifen
 * `lazy` – am Handy sind sie ausgeblendet und werden so gar nicht geladen, am Rechner stehen sie im ersten Bild und laden gleich.
 */
export function DashboardHero({
  greeting,
  firstName,
  roleName,
  dateLabel,
  club,
  strips,
  main,
  figures,
  can,
  customize,
}: {
  greeting: string;
  firstName: string;
  roleName: string;
  dateLabel: string;
  club: { name: string; logoUrl: string | null };
  /** Schon ausgewählt und sortiert (`heroStage`); leer = keine Fotos, nur Licht. */
  strips: HeroDepartment[];
  /** Der Streifen, der am Handy allein stehen bleibt (`heroStage`). */
  main: HeroDepartment | null;
  figures: HeroFigure[];
  /** Knöpfe wie bisher: „Neue Veranstaltung“, „Neues Mitglied“ – ohne Recht zum Anlegen, aber mit Leserecht „Kalender“. */
  can: { createEvent: boolean; createMember: boolean; readEvents: boolean };
  customize: CustomizeTab[];
}) {
  const photo = main !== null;
  const title = `${greeting}, ${firstName}`;
  const steps = heroFigureSteps(figures);
  const chipIcon = CHIP_ICON_FROM[steps.icon ?? "nie"];
  const chipLong = CHIP_LONG_FROM[steps.long ?? "nie"];
  const actions = [
    can.createEvent && (
      <Button key="veranstaltung" asChild className={cn(ACTION, GLOW.primary)}>
        <Link href="/veranstaltungen/neu">
          <PlusIcon aria-hidden="true" />
          {/* Am Handy nur „Veranstaltung“ – „Neue“ bleibt für Screenreader im Namen. */}
          <span>
            <span className="@max-[24rem]/buehne:sr-only">Neue </span>Veranstaltung
          </span>
        </Link>
      </Button>
    ),
    can.createMember && (
      <Button key="mitglied" asChild variant="success" className={cn(ACTION, GLOW.success)}>
        <Link href="/mitglieder/neu">
          <PlusIcon aria-hidden="true" />
          <span>
            <span className="@max-[24rem]/buehne:sr-only">Neues </span>Mitglied
          </span>
        </Link>
      </Button>
    ),
    !can.createEvent && can.readEvents && (
      // Ohne Recht zum Anlegen der Weg zum Kalender – dunkles Glas, im Banner wie darunter (dort wie „Alle Mitglieder“).
      <Button
        key="kalender"
        asChild
        variant={null}
        className={cn(
          ACTION,
          GLASS,
          // Fokus: weißer Ring innen – auf dem dunklen Knopf überall zu sehen, im Banner wie auf dem Seitengrund.
          "font-semibold text-white hover:bg-(--hero-glass-hover) focus-visible:ring-3 focus-visible:ring-white/70 @max-[62rem]/buehne:bg-(--hero-night)",
        )}
      >
        <Link href="/kalender">
          <AREA_ICON.kalender aria-hidden="true" /> Kalender
        </Link>
      </Button>
    ),
  ].filter(Boolean);

  return (
    <div
      data-slot="dashboard-hero"
      className="@container/buehne"
      style={{ ...heroCssVariables(), ...HERO_BUTTON_TOKENS } as React.CSSProperties}
    >
      <div className="relative flex flex-col @[62rem]/buehne:block">
        {/* ---------- Das Banner ---------- */}
        <div
          data-slot="hero-banner"
          className={cn(
            "relative isolate flex flex-col overflow-hidden rounded-3xl bg-(--hero-night) px-5 pt-4 pb-6 text-white",
            HERO_BANNER_HEIGHT,
            "@[40rem]/buehne:rounded-4xl @[40rem]/buehne:px-8 @[40rem]/buehne:pt-7 @[40rem]/buehne:pb-8",
            // Tiefer, weicher Schatten in Nachtblau (hell); dunkel ohne Schatten – dort genügt die feine Lichtkante rundum (s. u.).
            "shadow-[0_1px_2px_rgb(6_10_22/0.12),0_28px_56px_-30px_rgb(6_10_22/0.75)] dark:shadow-none",
          )}
        >
          {/* Licht hinter den Fotos: scheint durch die Fugen zwischen den Streifen – ohne Abteilungen allein auf der Nacht. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 left-[34%] -z-30 @max-[40rem]/buehne:hidden"
            style={{
              backgroundImage:
                "radial-gradient(120% 70% at 60% 105%, rgb(96 165 250 / 0.95), rgb(37 99 235 / 0.55) 45%, transparent 75%)",
            }}
          />
          {/* Am Handy: blaue Lichtkante an der schrägen Unterkante des Fotos (3 px unter dem Schnitt). */}
          {photo && (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 -z-30 h-[calc(9.5rem+3px)] @[40rem]/buehne:hidden"
              style={{
                clipPath: PHONE_CUT,
                backgroundImage:
                  "linear-gradient(90deg, rgb(37 99 235 / 0.9), rgb(96 165 250) 60%, rgb(147 197 253))",
              }}
            />
          )}

          {/* Die Fotostreifen. Am Handy bleibt nur `main` stehen: über die ganze Breite, oben, unten schräg. */}
          {strips.length > 0 && (
            <div
              aria-hidden="true"
              className="absolute -z-20 flex @max-[40rem]/buehne:inset-x-0 @max-[40rem]/buehne:top-0 @max-[40rem]/buehne:h-38 @[40rem]/buehne:inset-y-0 @[40rem]/buehne:right-0 @[40rem]/buehne:left-[34%]"
            >
              {strips.map((department, index) => {
                const shape = heroStripShape(index, strips.length);
                const isMain = department.id === main?.id;
                return (
                  <div
                    key={department.id}
                    data-hero-strip={isMain ? "main" : ""}
                    className={cn(
                      "relative min-w-0 flex-1 overflow-hidden bg-slate-900",
                      "ml-(--strip-ml) [clip-path:var(--strip-clip)] @max-[40rem]/buehne:ml-0 @max-[40rem]/buehne:[clip-path:var(--phone-cut)]",
                      !isMain && "@max-[40rem]/buehne:hidden",
                      // Einmal beim Öffnen gleiten die Streifen nacheinander herein (nicht bei „Bewegung reduzieren“).
                      "motion-safe:animate-in motion-safe:duration-700 motion-safe:ease-out motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-right-6",
                    )}
                    style={
                      {
                        "--strip-ml": shape.marginLeft,
                        "--strip-clip": shape.clipPath,
                        "--phone-cut": PHONE_CUT,
                        animationDelay: `${120 + index * 90}ms`,
                      } as React.CSSProperties
                    }
                  >
                    <DepartmentCover
                      name={department.name}
                      color={department.color}
                      sizes={heroStripSizes(strips.length)}
                      priority={isMain}
                      className="motion-safe:animate-in motion-safe:duration-[1600ms] motion-safe:ease-out motion-safe:zoom-in-110"
                    />
                    {/* Am Handy ein Hauch Dunkel oben (unter Vereinsschild und „Anpassen“) und unten an der Kante */}
                    <div className="absolute inset-0 bg-linear-to-b from-black/35 via-transparent to-black/25 @[40rem]/buehne:hidden" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Nacht von links: Auf ihr steht die Schrift (Deckkraft je Stelle in `HERO_SCRIM`) – ab Tablet-Breite. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 hidden @[40rem]/buehne:block"
            style={{ backgroundImage: heroScrimGradient() }}
          />
          {/* Blauer Schein oben links und eine feine Lichtkante rundum */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              backgroundImage:
                "radial-gradient(38rem 20rem at -6% -20%, rgb(37 99 235 / 0.42), rgb(37 99 235 / 0.12) 55%, transparent 75%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_rgb(255_255_255/0.14),inset_0_0_0_1px_rgb(255_255_255/0.08)]"
          />

          {/* Namen der Abteilungen oben rechts an den Streifen, mit Farbpunkt – eigene Ebene über dem Nachtverlauf, damit auch
              der erste lesbar bleibt. Erst ab 62 rem: schmaler sitzt oben rechts „Anpassen“. */}
          {strips.length > 0 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 left-[34%] hidden @[62rem]/buehne:flex"
            >
              {strips.map((department, index) => (
                <div
                  key={department.id}
                  className="relative min-w-0 flex-1"
                  style={{ marginLeft: heroStripShape(index, strips.length).marginLeft }}
                >
                  <span
                    className={cn(
                      "absolute top-6 right-4 inline-flex max-w-[calc(100%-4.5rem)] items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-xs font-medium text-white",
                      GLASS,
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full ring-1 ring-white/70"
                      style={{ backgroundColor: department.color ?? "rgb(255 255 255 / 0.6)" }}
                    />
                    <span className="truncate">{department.name}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Schriftspalte: höchstens 46 % breit – bis dorthin ist die Nacht dicht genug für weiße Schrift über jedem Foto. Am Handy
              füllt sie die Höhe: Verein oben, Begrüßung samt Rolle und Datum unten – mit Foto wie ohne. */}
          <div className="flex min-w-0 flex-col @max-[40rem]/buehne:flex-1 @[40rem]/buehne:max-w-[46%]">
            {/* Verein. Am Handy auf Glas über dem Foto; der Platz darunter gehört dem Foto (die Schrift beginnt erst unter ihm). */}
            <div className={cn(photo && "@max-[40rem]/buehne:h-37")}>
              <p
                className={cn(
                  "inline-flex max-w-full min-w-0 items-center gap-2.5 rounded-full",
                  "@max-[40rem]/buehne:max-w-[calc(100%-3.25rem)] @max-[40rem]/buehne:py-1 @max-[40rem]/buehne:pr-3 @max-[40rem]/buehne:pl-1",
                  photo &&
                    "@max-[40rem]/buehne:bg-(--hero-glass) @max-[40rem]/buehne:ring-1 @max-[40rem]/buehne:ring-white/15 @max-[40rem]/buehne:backdrop-blur-md",
                )}
              >
                <ClubLogo
                  name={club.name}
                  logoUrl={club.logoUrl}
                  size="sm"
                  className="shrink-0 ring-1 ring-white/25"
                />
                <span className="truncate text-xs font-semibold tracking-[0.05em] text-(--hero-club) uppercase @[40rem]/buehne:tracking-[0.14em]">
                  {club.name}
                </span>
              </p>
            </div>

            {/* Begrüßung (Überschrift der Seite) – immer EINE Zeile. Schriftgröße: die übliche (Handy 2 rem; ab 40 rem wächst sie mit
                der Breite des Banners, `cqi`), höchstens aber so groß, dass die Begrüßung in die Schriftspalte passt (Spaltenbreite
                geteilt durch die geschätzte Breite in em, `heroTitleEms`), mindestens 1,125 rem – ein noch längerer Name endet mit
                „…“ und ragt nie über die Spalte (dort reicht die Nacht für den Kontrast). Die Zeilenhöhe bleibt die übliche. */}
            <h1
              style={{ "--hero-title-ems": heroTitleEms(title) } as React.CSSProperties}
              className={cn(
                "overflow-x-clip font-semibold tracking-[-0.035em] text-ellipsis whitespace-nowrap [text-shadow:0_2px_24px_rgb(6_10_22/0.6)]",
                "text-[length:max(1.125rem,min(2rem,calc((100cqi_-_2.5rem)_/_var(--hero-title-ems))))] leading-[2.1rem] @max-[40rem]/buehne:mt-auto",
                "@[40rem]/buehne:mt-5 @[40rem]/buehne:text-[length:max(1.125rem,min(clamp(2.25rem,4.6cqi,3.5rem),calc((100cqi_-_4rem)_*_0.46_/_var(--hero-title-ems))))]",
                "@[40rem]/buehne:leading-[calc(clamp(2.25rem,4.6cqi,3.5rem)_*_1.05)]",
              )}
            >
              {title}
            </h1>
            {/* Rolle · Datum – in dieser Reihenfolge, sichtbar wie vorgelesen. Bis 62 rem zwei Zeilen (Rolle, darunter das Datum)
                statt eines Umbruchs mitten im Datum, breiter eine Zeile; eine lange Rolle kürzt sich mit „…“, das Datum nie. */}
            <p className="mt-2 flex flex-col text-sm text-(--hero-meta) @[40rem]/buehne:mt-3 @[40rem]/buehne:text-base @[62rem]/buehne:flex-row">
              <span className="min-w-0 truncate">{roleName}</span>
              <span aria-hidden="true" className="hidden shrink-0 px-1.5 @[62rem]/buehne:inline">
                ·
              </span>
              <span className="sr-only">, </span>
              <span className="shrink-0 truncate">{dateLabel}</span>
            </p>
          </div>

          {/* Glas-Chips mit echten Zahlen (ab Tablet-Breite) – je ein Link in seinen Bereich, immer in EINER Reihe. Rechts bleibt ab
              62 rem Platz für die Knöpfe; Symbol und lange Form dann erst, wo sie passen (`heroFigureSteps`). */}
          {figures.length > 0 && (
            <ul
              aria-label="Auf einen Blick"
              className="mt-auto hidden min-w-0 gap-2 pt-6 @[40rem]/buehne:flex @[62rem]/buehne:max-w-[calc(100%-29rem)]"
            >
              {figures.map((figure) => {
                const { icon: Icon, tone } = FIGURE_ICON[figure.key];
                return (
                  <li key={figure.key} className="min-w-0">
                    <Link
                      href={figure.href}
                      data-hero-figure={figure.key}
                      className={cn(
                        "inline-flex h-10 max-w-full items-center gap-2 rounded-full pr-3.5 pl-1.5 text-sm whitespace-nowrap text-(--hero-chip)",
                        chipIcon.chip,
                        GLASS,
                        GLASS_FOCUS,
                        "transition-[background-color,box-shadow] duration-200 ease-out hover:bg-(--hero-glass-hover) hover:ring-white/30",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full bg-white/10 [&_svg]:size-3.5",
                          tone,
                          chipIcon.icon,
                        )}
                      >
                        <Icon />
                      </span>
                      {/* Zahl und Wort in EINER Zeile Text: Das Leerzeichen dazwischen gehört so auch zum Namen des Links. Reicht der
                          Platz nach der Schätzung doch nicht (sehr breite Schrift), kürzt sich das Wort mit „…“, die Zahl bleibt. */}
                      <span className="min-w-0 truncate">
                        <span className="mr-0.5 font-semibold text-white tabular-nums">
                          {figure.value.toLocaleString("de-DE")}
                        </span>{" "}
                        {figure.before && (
                          <span className={cn("sr-only", chipLong)}>{figure.before}</span>
                        )}
                        {figure.word}
                        {figure.after && (
                          <span className={cn("sr-only", chipLong)}>{figure.after}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ---------- Knöpfe: ab 62 rem unten rechts im Banner, sonst darunter ---------- */}
        <div
          className={cn(
            "grid grid-cols-2 gap-2 @[40rem]/buehne:flex @[40rem]/buehne:justify-end @[40rem]/buehne:gap-2.5",
            actions.length > 0 && "mt-3 @[62rem]/buehne:mt-0",
            actions.length === 1 && "*:first:col-span-2",
            // Im Banner: unten rechts, mittig zu den Chips; Fokusring dort weiß statt in der Markenfarbe.
            "@[62rem]/buehne:absolute @[62rem]/buehne:right-8 @[62rem]/buehne:bottom-[1.875rem] @[62rem]/buehne:items-center @[62rem]/buehne:[--ring:oklch(1_0_0)]",
          )}
        >
          {actions}
          {/* „Anpassen“ als runder Glasknopf mit Hinweis; schmaler als 62 rem oben rechts im Banner. */}
          <div className="absolute top-4 right-4 flex @[40rem]/buehne:top-7 @[40rem]/buehne:right-8 @[62rem]/buehne:static">
            <CustomizeDashboard
              tabs={customize}
              trigger="icon"
              triggerClassName={CUSTOMIZE_GLASS}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
