import { describe, expect, it } from "vitest";
import { describeDevice } from "@/lib/user-agent";

describe("Gerätebeschreibung", () => {
  const cases: [string, string][] = [
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
      "Edge auf Windows",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Chrome auf Windows",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36",
      "Chrome auf Windows",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      "Chrome auf Android",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Safari auf iOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
      "Chrome auf iOS",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      "Safari auf macOS",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0", "Firefox auf Linux"],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0",
      "Firefox auf macOS",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0",
      "Opera auf Windows",
    ],
  ];

  it.each(cases)("%s", (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected);
  });

  it("unbekannte oder fehlende Angaben ergeben eine neutrale Beschreibung", () => {
    expect(describeDevice(null)).toBe("Unbekanntes Gerät");
    expect(describeDevice(undefined)).toBe("Unbekanntes Gerät");
    expect(describeDevice("")).toBe("Unbekanntes Gerät");
    expect(describeDevice("curl/8.5.0")).toBe("Unbekanntes Gerät");
  });

  it("nennt nur das Betriebssystem, wenn der Browser unbekannt ist", () => {
    expect(describeDevice("MeineApp/1.0 (Android 14)")).toBe("Android");
  });
});
