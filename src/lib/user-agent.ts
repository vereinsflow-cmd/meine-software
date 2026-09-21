/**
 * Lesbare Kurzbeschreibung eines Geräts aus dem User-Agent, z. B. "Edge auf Windows" – für die Liste angemeldeter Geräte.
 * Bewusst einfach gehalten: Es geht darum, dass Personen ihre eigenen Sitzungen wiedererkennen, nicht um Statistik.
 * Reihenfolge ist wichtig (Edge und Chrome nennen sich auch "Safari", iPhones "Mac OS X", Android "Linux").
 */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg(?:e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const system = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux|X11/.test(ua)
            ? "Linux"
            : null;
  if (browser && system) return `${browser} auf ${system}`;
  return browser ?? system ?? "Unbekanntes Gerät";
}
