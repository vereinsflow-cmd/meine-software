/**
 * Kartenfläche – eine Quelle für alles, was wie eine Karte auf dem Seitengrund liegt (`Card`, `TableCard`, `EmptyState`,
 * Ladegerüste, Fehlermeldung eines Bereichs): weiße bzw. dunkle Kartenfarbe, Rundung `rounded-xl`, leichter Schatten und
 * ein feiner, blasser Rand als Ring (dunkel etwas kräftiger). Der Ring nimmt keinen Platz ein – anders als `border`, der
 * die Fläche um 1 px verkleinert. Eigene Karten bauen auf diese Klassen statt auf `border bg-card shadow-xs`.
 * (Eigene Datei ohne „use client“, damit auch Server-Komponenten die Klassen nutzen können.)
 */
export const CARD_SURFACE =
  "rounded-xl bg-card shadow-sm ring-1 ring-foreground/10 dark:ring-foreground/15";
