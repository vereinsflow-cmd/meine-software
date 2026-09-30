import { describe, expect, it } from "vitest";
import { rateLimitIp } from "@/server/security/rate-limit";

/**
 * Bezugsgröße der IP-Rate-Limits: IPv4 als ganze Adresse, IPv6 als /64-Netz. Sonst wechselte ein IPv6-Anschluss für jeden
 * Versuch die Adresse innerhalb seines Netzes, und Grenzen wie „5 Beitrittsanträge je IP und Stunde“ griffen nicht.
 */
describe("rateLimitIp", () => {
  it("IPv4 bleibt die ganze Adresse; „unknown“ und Unsinn bleiben unverändert", () => {
    expect(rateLimitIp("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitIp("203.0.113.8")).toBe("203.0.113.8");
    expect(rateLimitIp("unknown")).toBe("unknown");
    expect(rateLimitIp("keine-ip")).toBe("keine-ip");
  });

  it("IPv6: alle Adressen eines /64-Netzes ergeben denselben Schlüssel – egal wie geschrieben", () => {
    const key = "2001:db8:4711:42::/64";
    for (const ip of [
      "2001:db8:4711:42::1",
      "2001:db8:4711:42:abcd:ef01:2345:6789",
      "2001:0DB8:4711:0042:0000:0000:0000:0001",
      "2001:db8:4711:42:0:0:0:ffff",
      "2001:db8:4711:42::1%eth0", // mit Zonen-Angabe
    ])
      expect(rateLimitIp(ip), ip).toBe(key);
    expect(rateLimitIp("2001:db8:4711:43::1")).toBe("2001:db8:4711:43::/64"); // Nachbarnetz
    expect(rateLimitIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitIp("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitIp("::")).toBe("0:0:0:0::/64");
  });

  it("IPv4 in IPv6-Schreibweise zählt als IPv4", () => {
    expect(rateLimitIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitIp("::FFFF:cb00:7107")).toBe("203.0.113.7");
    expect(rateLimitIp("0:0:0:0:0:ffff:203.0.113.7")).toBe("203.0.113.7");
    // Andere eingebettete IPv4 (NAT64) bleibt IPv6 mit ihrem /64.
    expect(rateLimitIp("64:ff9b::203.0.113.7")).toBe("64:ff9b:0:0::/64");
  });
});
