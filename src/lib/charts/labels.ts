import type { Granularity } from "./types";

/** Beschriftung der Zeitraumauswahl – nennt auch, wie weit zurückgeschaut wird. (Eigene Datei ohne Datumsbibliothek, damit der Browser sie schlank laden kann.) */
export const GRANULARITY_LABEL: Record<Granularity, string> = {
  W: "12 Wochen",
  M: "12 Monate",
  Q: "8 Quartale",
  Y: "5 Jahre",
};
