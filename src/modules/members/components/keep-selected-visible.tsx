"use client";

import { useEffect } from "react";

/**
 * Liegt das ausgewählte Mitglied weiter unten in der Liste (Link mit `?id=…`, Rückweg aus dem Profil), rollt nur die Liste so
 * weit, dass es sichtbar ist – die Seite selbst bleibt stehen. Am Handy rollt die Liste nicht in sich; dann tut sich nichts.
 */
export function KeepSelectedVisible({
  listId,
  selectedId,
}: {
  listId: string;
  selectedId: string;
}) {
  useEffect(() => {
    const list = document.getElementById(listId);
    const row = list?.querySelector<HTMLElement>(`[data-member="${CSS.escape(selectedId)}"]`);
    if (!list || !row || list.scrollHeight <= list.clientHeight) return;
    // Die Liste ist `relative` – `offsetTop` der Zeile zählt also ab ihrem oberen Rand. 40 px Luft für den klebenden Buchstaben.
    const top = row.offsetTop;
    const visible =
      top >= list.scrollTop + 40 && top + row.offsetHeight <= list.scrollTop + list.clientHeight;
    if (!visible) list.scrollTop = Math.max(0, top - list.clientHeight / 3);
  }, [listId, selectedId]);
  return null;
}
