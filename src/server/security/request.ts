import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { env } from "@/server/env";

export interface RequestMeta {
  /** Vollständige IP – nur für Rate-Limiting im Speicher/Zähler, wird nicht dauerhaft gespeichert. */
  ip: string;
  /** Gekürzte IP für Protokolle (Datensparsamkeit). */
  ipPrefix: string | null;
  userAgent: string | null;
}

/**
 * Ermittelt die Client-IP. Den Headern `X-Forwarded-For`/`X-Real-IP` wird nur vertraut, wenn
 * `TRUST_PROXY=true` gesetzt ist (Anwendung läuft hinter einem eigenen Reverse-Proxy). Sonst
 * könnte jeder Client die IP fälschen und so das Rate-Limiting umgehen.
 */
export function clientIpFromHeaders(h: Headers): string {
  if (env.TRUST_PROXY) {
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded && isIP(forwarded)) return forwarded;
    const real = h.get("x-real-ip")?.trim();
    if (real && isIP(real)) return real;
  }
  return "unknown";
}

/** Kürzt eine IP-Adresse (IPv4: letztes Oktett, IPv6: alles nach dem dritten Block). */
export function truncateIp(ip: string): string | null {
  const family = isIP(ip);
  if (family === 4) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (family === 6) {
    return `${ip.split(":").slice(0, 3).join(":")}:*`;
  }
  return null;
}

export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  return {
    ip,
    ipPrefix: truncateIp(ip),
    userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
  };
}
