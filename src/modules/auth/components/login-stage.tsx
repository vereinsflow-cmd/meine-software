import Link from "next/link";
import { Brand } from "@/components/shared/brand";
import { STAGE_SPORTS, STAGE_START_SPORT } from "../stage";
import styles from "./login-stage.module.css";
import { MotionToggle, StageScene } from "./stage-scene";

/**
 * Rahmen der Anmeldeseiten als Kinobühne („3D-Fotokarussell“, seit 22.10.2026, Entwurf neu-3; Luis: „setze das um“):
 * dunkle Bühne über den ganzen Bildschirm, dahinter dreht sich ein schräger Ring aus Abteilungsfotos (`StageScene`).
 * Aufgebaut wie ein Filmplakat: oben links das Logo, oben rechts „Mitgliederbereich“ und „Bewegung anhalten“, groß
 * „Dein Verein. In Bewegung.“, unten links der Abspann (Satz, „Im Fokus“) und Impressum/Datenschutz; rechts die Glasfläche
 * mit dem Formular der Seite (`children`, gebaut mit `StageCard`). Am Handy steht der Ring oben, darunter Schrift und Glas.
 *
 * Sitzt im Layout der Routen-Gruppe `(anmelden)`: Beim Wechsel zwischen Anmelden, Passwort vergessen, Code und neuem
 * Passwort bleibt die Bühne stehen und dreht weiter – nur der Inhalt der Glasfläche wechselt.
 *
 * Reihenfolge für Tastatur und Screenreader: „Zum Inhalt springen“ (Seitenlayout) → Logo → „Bewegung anhalten“ → Formular →
 * Impressum, Datenschutz. Die große Zeile wird einmal vorgelesen (die Nachbilder sind ausgeblendet), „Im Fokus“ gar nicht.
 */

const word = (text: string, delay: number, className?: string) => (
  <span
    className={`${styles.word} ${className ?? ""}`}
    style={{ "--delay": `${delay}s` } as React.CSSProperties}
  >
    {text}
  </span>
);

export function LoginStage({ children }: { children: React.ReactNode }) {
  return (
    <StageScene>
      <div className={styles.content}>
        <header className={styles.top}>
          <div className={styles.logo}>
            <Brand variant="horizontal" logoClassName="h-10 sm:h-11" className="rounded-md" />
          </div>
          <div className={styles.topEnd}>
            <span className={styles.eyebrow}>Mitgliederbereich</span>
            <MotionToggle />
          </div>
        </header>

        {/* Schmal: Hier liegt der Ring; man kann ihn seitlich wischen. */}
        <div className={styles.zone} data-stage="zone" aria-hidden="true" />

        <section className={styles.intro} aria-label="Willkommen">
          <p className={styles.title}>
            <span className="sr-only">Dein Verein. In Bewegung.</span>
            <span aria-hidden="true">
              <span className={styles.line}>
                {word("Dein", 0.3, styles.plain)} {word("Verein.", 0.38, styles.plain)}
              </span>
              <span className={styles.line}>
                <span
                  className={`${styles.word} ${styles.swingHolder}`}
                  style={{ "--delay": "0.5s" } as React.CSSProperties}
                >
                  {[0, 1, 2].map((ghost) => (
                    <span key={ghost} className={styles.ghost} data-stage="ghost">
                      In Bewegung.
                    </span>
                  ))}
                  <span className={styles.swing} data-stage="swing">
                    In Bewegung.
                  </span>
                </span>
              </span>
            </span>
          </p>
        </section>

        {/* Abspann wie unten auf einem Filmplakat – die Mitte bleibt frei für die vorderen Plakate. */}
        <div className={styles.credits}>
          <p className={styles.tagline}>
            Mitglieder, Termine, Helferpläne und Finanzen – alles, was deinen Verein bewegt, an
            einem Ort.
          </p>
          <div className={styles.ticker} aria-hidden="true">
            <span className={styles.tickerLabel}>Im Fokus</span>
            <span className={styles.tickerReel}>
              {STAGE_SPORTS.map((sport, index) => (
                <span
                  key={sport.sport}
                  data-stage="focus"
                  data-state={index === STAGE_START_SPORT ? "active" : ""}
                >
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <b>{sport.name}</b>
                </span>
              ))}
            </span>
            <span className={styles.tickerTrack}>
              <span data-stage="progress" />
            </span>
            <span className={styles.tickerHint}>Zum Drehen ziehen</span>
          </div>
        </div>

        <main id="inhalt" className={styles.glassHolder}>
          <div className={styles.glass} data-stage="glass">
            <div className={styles.rim} aria-hidden="true">
              <span className={styles.rimLight} data-stage="rim" />
            </div>
            <span className={styles.pulse} data-stage="pulse" aria-hidden="true" />
            <div className={styles.core}>{children}</div>
          </div>
        </main>

        <footer className={styles.foot}>
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutzerklaerung">Datenschutz</Link>
        </footer>
      </div>
    </StageScene>
  );
}

/**
 * Inhalt der Glasfläche (wie `AuthCard` auf den übrigen Seiten): kleine Zeile in Versalien, Überschrift (die `h1` der
 * Seite), Beschreibung, das Formular und darunter ein Hinweis mit Trennlinie.
 */
export function StageCard({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <div className={styles.cardHead}>
        <span className={styles.cardEyebrow}>
          <span aria-hidden="true" />
          {eyebrow}
        </span>
        <h1 className={styles.cardTitle}>{title}</h1>
        {description && <p className={styles.cardText}>{description}</p>}
      </div>
      {children}
      {footer && <p className={styles.cardFoot}>{footer}</p>}
    </>
  );
}
