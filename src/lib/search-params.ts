/**
 * Hilfen für URL-Parameter (Suche, Filter, Sortierung, Seitenzahl). Listen werden serverseitig über
 * die URL gesteuert: bookmarkbar, teilbar, mit Zurück-Taste bedienbar und ohne Client-Zustand.
 */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export function param(params: RawSearchParams, key: string): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single === undefined || single === "" ? undefined : single;
}

/** Liest alle Werte eines Parameters, der mehrfach vorkommen kann (z. B. angehakte Kästchen gleichen Namens). */
export function paramList(params: RawSearchParams, key: string): string[] {
  const value = params[key];
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter((v) => v !== "");
}

/** Liest eine Ganzzahl innerhalb von Grenzen; ungültige Werte ergeben den Standardwert. */
export function intParam(
  params: RawSearchParams,
  key: string,
  fallback: number,
  min = 1,
  max = 10_000,
): number {
  const raw = param(params, key);
  if (raw === undefined || !/^\d{1,9}$/.test(raw)) return fallback;
  return Math.min(max, Math.max(min, Number(raw)));
}

/** Liest einen Wert, der zu einer festen Liste gehören muss (verhindert beliebige Eingaben in Filtern). */
export function enumParam<T extends string>(
  params: RawSearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const raw = param(params, key);
  return raw !== undefined && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/** Baut eine Query-Zeichenkette aus vorhandenen Parametern und Änderungen (`undefined`/"" entfernt den Parameter). */
export function buildQuery(
  params: RawSearchParams,
  changes: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined && single !== "" && !(key in changes)) query.set(key, single);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  page: number;
  pageSize: number;
  skip: number;
}

export function pageRequest(params: RawSearchParams, defaultSize = DEFAULT_PAGE_SIZE): PageRequest {
  const pageSize = intParam(params, "pageSize", defaultSize, 5, MAX_PAGE_SIZE);
  const page = intParam(params, "page", 1, 1, 100_000);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function paged<T>(items: T[], total: number, request: PageRequest): Paged<T> {
  return {
    items,
    total,
    page: request.page,
    pageSize: request.pageSize,
    pageCount: Math.max(1, Math.ceil(total / request.pageSize)),
  };
}
