"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  POSTER_SIZES,
  STAGE_PANELS,
  STAGE_SPORTS,
  STAGE_START_SPORT,
  panelSport,
  posterImage,
  stageCssVariables,
} from "../stage";
import styles from "./login-stage.module.css";
import { motionPreference } from "./motion-preference";
import { startStage } from "./stage-loop";

/**
 * Die Szene der Anmeldebühne („3D-Fotokarussell“): Nachthimmel, Raumlicht, Lichtkegel, der Ring aus Abteilungsplakaten in
 * CSS-3D mit Bodenspiegelung, Horizontlinie, Lichtstaub. Rein schmückend – alles hier ist `aria-hidden` und nicht
 * fokussierbar; Bilder ohne Alternativtext. Der Inhalt der Seite (Schrift, Formular) kommt als `children` vom Server, die
 * Schleife (stage-loop.ts) findet ihre Ziele darin über `data-stage`.
 *
 * Die Fotos laden mit niedriger Priorität (Formular, Schrift und Skripte gehen vor) und nur in der gezeichneten Größe
 * (`POSTER_SIZES`); dieselbe Datei steht für Plakat, Gegenüber und Spiegelbild – acht Fotos für 16 Plakate.
 */
export function StageScene({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return startStage(root);
  }, []);

  return (
    // Die Bühne ist in beiden Darstellungen Nacht: `dark` schaltet für Formular und Logo die dunklen Farbwerte ein.
    <div
      ref={rootRef}
      className={cn(styles.stage, "dark")}
      style={stageCssVariables() as React.CSSProperties}
      data-slot="login-stage"
    >
      <div className={styles.scene} aria-hidden="true">
        <div className={styles.sky} />
        <div className={styles.lights}>
          {STAGE_SPORTS.map((sport, index) => (
            <div
              key={sport.sport}
              className={styles.glow}
              data-stage="glow"
              data-still={index === STAGE_START_SPORT}
              style={{ "--light": sport.light } as React.CSSProperties}
            />
          ))}
        </div>
        <div className={styles.puddle} />
        <div className={styles.beams}>
          <span />
          <span />
          <span />
        </div>

        <div className={styles.entrance} data-stage="entrance">
          <div className={styles.room}>
            <div className={styles.anchor} data-stage="anchor">
              <div className={styles.floor} />
              <div className={styles.ring} data-stage="ring">
                {Array.from({ length: STAGE_PANELS.wide }, (_, index) => {
                  const sport = STAGE_SPORTS[panelSport(index)];
                  const image = posterImage(sport.sport);
                  return (
                    <div
                      key={index}
                      className={styles.panel}
                      data-stage="panel"
                      data-sport={panelSport(index)}
                      style={
                        {
                          "--i": index,
                          "--focus": sport.focus,
                          "--light": sport.light,
                        } as React.CSSProperties
                      }
                    >
                      <span className={styles.halo} data-stage="halo" />
                      <div className={styles.poster}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- 32 Bilder in CSS-3D; next/image brächte hier nur Hüllen */}
                        <img
                          data-stage="photo"
                          src={image.src}
                          srcSet={image.srcSet}
                          sizes={POSTER_SIZES}
                          width={800}
                          height={600}
                          alt=""
                          draggable={false}
                          decoding="async"
                          fetchPriority="low"
                        />
                        <span className={styles.label} data-stage="label">
                          {sport.name}
                        </span>
                        <span className={styles.sheen} data-stage="sheen" />
                        <span className={styles.shade} data-stage="shade" />
                      </div>
                      <div className={styles.reflection} data-stage="reflection">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Spiegelbild desselben Fotos (schmal ausgeblendet, lädt dann nicht) */}
                        <img
                          src={image.src}
                          srcSet={image.srcSet}
                          sizes={POSTER_SIZES}
                          width={800}
                          height={600}
                          alt=""
                          draggable={false}
                          decoding="async"
                          loading="lazy"
                          fetchPriority="low"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.horizon} data-stage="horizon" />
        <div className={styles.flash} data-stage="flash" />
        <canvas className={styles.dust} data-stage="dust" />
        <div className={styles.scrim} />
        <div className={styles.grain} />
      </div>
      <div className={styles.focusVeil} aria-hidden="true" />
      <div className={styles.measure} data-stage="measure" aria-hidden="true" />
      {children}
    </div>
  );
}

/**
 * „Bewegung anhalten“ / „Bewegung fortsetzen“ (WCAG 2.2.2: was sich länger als 5 s von selbst bewegt, muss sich anhalten
 * lassen). Breit eine Pille mit Text neben „Im Fokus“, schmal ein runder Knopf oben rechts (Text für Screenreader). Die Wahl
 * bleibt in diesem Browser gemerkt. Bei „Bewegung reduzieren“ ausgeblendet – dann steht ohnehin alles still.
 */
export function MotionToggle() {
  const paused = useSyncExternalStore(
    motionPreference.subscribe,
    motionPreference.get,
    motionPreference.getServer,
  );
  const label = paused ? "Bewegung fortsetzen" : "Bewegung anhalten";
  return (
    <button
      type="button"
      className={styles.motionToggle}
      data-stage="motion-toggle"
      onClick={() => motionPreference.set(!paused)}
    >
      {paused ? <PlayIcon aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}
      <span className={styles.motionLabel}>
        <span>{label}</span>
        {/* Platzhalter in der Breite der anderen Beschriftung – so springt die Pille beim Umschalten nicht */}
        <span aria-hidden="true">{paused ? "Bewegung anhalten" : "Bewegung fortsetzen"}</span>
      </span>
    </button>
  );
}
