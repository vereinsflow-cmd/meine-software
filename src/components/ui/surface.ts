/**
 * Kartenfläche – eine Quelle für alles, was wie eine Karte auf dem Seitengrund liegt (`Card`, `TableCard`, `EmptyState`,
 * Ladegerüste, Fehlermeldung eines Bereichs): weiße bzw. dunkle Kartenfarbe, Rundung `rounded-xl`, leichter Schatten und
 * ein feiner, blasser Rand als Ring (dunkel etwas kräftiger). Der Ring nimmt keinen Platz ein – anders als `border`, der
 * die Fläche um 1 px verkleinert. Eigene Karten bauen auf diese Klassen statt auf `border bg-card shadow-xs`.
 * (Eigene Datei ohne „use client“, damit auch Server-Komponenten die Klassen nutzen können.)
 */
export const CARD_SURFACE =
  "rounded-xl bg-card shadow-sm ring-1 ring-foreground/10 dark:ring-foreground/15";

/**
 * Weiche, große Kartenfläche des Dashboards (seit 17.10.2026, Stil der Vorlage „Analytics“ in VereinsFlow-Farben): stärker
 * gerundet (`rounded-3xl`), ein weicher, tiefer Schatten statt des feinen Rands – hebt sich auf dem hellen Seitengrund ab, ohne
 * Linien. Im Dunkeln ohne Schatten, dafür mit etwas kräftigerem Ring.
 */
export const SOFT_CARD_SURFACE =
  "rounded-3xl bg-card text-card-foreground shadow-[0_1px_2px_rgb(15_23_42/0.04),0_14px_34px_-24px_rgb(15_23_42/0.32)] ring-1 ring-foreground/5 dark:shadow-none dark:ring-foreground/10";
