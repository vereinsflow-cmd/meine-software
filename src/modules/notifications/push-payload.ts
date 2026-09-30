import type { NotificationType } from "@/generated/prisma/enums";

/**
 * Inhalt einer Push-Benachrichtigung – reine Funktionen ohne Server-Code (testbar, ohne Datenbank).
 *
 * DATENSCHUTZ: Push-Benachrichtigungen erscheinen auf dem Sperrbildschirm und laufen über den Push-Dienst des Browser-Herstellers
 * (Google, Apple, Mozilla, Microsoft). Deshalb enthalten sie NIE Namen, Personendaten oder Nachrichtentext – auch nicht den
 * Titel oder Text der Benachrichtigung in der Anwendung, denn der nennt Veranstaltungen, Schichten oder Absender. Der Text hängt
 * allein vom TYP der Benachrichtigung ab (feste, allgemeine Sätze); dazu kommt der interne Link, damit ein Tipp auf die Meldung
 * die richtige Seite öffnet. Wer mehr wissen will, öffnet VereinsFlow – dort gelten Anmeldung und Berechtigungen.
 */
export interface PushText {
  title: string;
  body: string;
}

const TEXT: Record<NotificationType, PushText> = {
  SYSTEM: { title: "Neue Benachrichtigung", body: "Öffne VereinsFlow, um sie zu lesen." },
  SHIFT_ASSIGNED: {
    title: "Neue Schicht für dich",
    body: "Du wurdest für eine Schicht eingeteilt.",
  },
  SHIFT_CHANGED: { title: "Schicht geändert", body: "Eine deiner Schichten wurde geändert." },
  SHIFT_CANCELLED: { title: "Schicht abgesagt", body: "Eine deiner Schichten entfällt." },
  SHIFT_REMINDER: {
    title: "Erinnerung an deine Schicht",
    body: "Deine Schicht steht bald an.",
  },
  EVENT_PUBLISHED: { title: "Neue Veranstaltung", body: "Im Kalender steht ein neuer Termin." },
  EVENT_CHANGED: { title: "Veranstaltung geändert", body: "Ein Termin wurde geändert." },
  EVENT_CANCELLED: { title: "Veranstaltung abgesagt", body: "Ein Termin entfällt." },
  EVENT_REMINDER: {
    title: "Erinnerung an einen Termin",
    body: "Eine Veranstaltung steht bald an.",
  },
  TASK_ASSIGNED: { title: "Neue Aufgabe für dich", body: "Dir wurde eine Aufgabe zugewiesen." },
  MESSAGE: { title: "Neue Nachricht", body: "Du hast eine neue Nachricht in deinem Verein." },
  INVITATION: { title: "Neue Einladung", body: "Du wurdest zu einem Verein eingeladen." },
};

/** Der allgemeine Text zu einem Typ der Benachrichtigung. */
export function pushTextFor(type: NotificationType): PushText {
  return TEXT[type];
}

/** Wo die Benachrichtigungen in der Anwendung stehen – Ziel, wenn eine Benachrichtigung keinen eigenen Link hat. */
export const NOTIFICATIONS_PATH = "/benachrichtigungen";

/**
 * Absolute Adresse für den Tipp auf die Meldung. Nur interne Pfade (beginnen mit einem einzelnen "/") – alles andere fällt auf
 * das Benachrichtigungscenter zurück. Die Adresse gehört immer zu `appUrl`, nie zu einem fremden Server.
 */
export function pushTargetUrl(linkUrl: string | null | undefined, appUrl: string): string {
  const origin = new URL(appUrl).origin;
  const internal =
    typeof linkUrl === "string" &&
    linkUrl.startsWith("/") &&
    !linkUrl.startsWith("//") &&
    !linkUrl.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(linkUrl);
  if (internal) {
    const url = new URL(linkUrl, origin);
    if (url.origin === origin) return url.href;
  }
  return new URL(NOTIFICATIONS_PATH, origin).href;
}

/**
 * Nutzlast im Format „Declarative Web Push“ (WebKit/Safari, iOS und iPadOS ab 18.4; https://webkit.org/blog/16535/):
 * Der Browser zeigt die Meldung selbst an und öffnet bei einem Tipp `navigate`. Das Format ist zugleich das, das unser Service
 * Worker (public/sw.js) für alle anderen Browser liest – ein Format für alle. `web_push: 8030` kennzeichnet es.
 */
export interface PushPayload {
  web_push: 8030;
  notification: {
    title: string;
    body: string;
    navigate: string;
    lang: "de";
    dir: "ltr";
  };
}

export function buildPushPayload(
  notification: { type: NotificationType; linkUrl: string | null },
  appUrl: string,
): PushPayload {
  const { title, body } = pushTextFor(notification.type);
  return {
    web_push: 8030,
    notification: {
      title,
      body,
      navigate: pushTargetUrl(notification.linkUrl, appUrl),
      lang: "de",
      dir: "ltr",
    },
  };
}

/** Dringlichkeit beim Push-Dienst: zeitkritische Meldungen dürfen das Gerät sofort wecken, der Rest schont den Akku. */
export function pushUrgency(type: NotificationType): "high" | "normal" {
  switch (type) {
    case "SHIFT_REMINDER":
    case "EVENT_REMINDER":
    case "SHIFT_CANCELLED":
    case "EVENT_CANCELLED":
      return "high";
    default:
      return "normal";
  }
}

/** So lange hält der Push-Dienst eine Meldung für ein ausgeschaltetes Gerät zurück (Sekunden); danach ist sie überholt. */
export const PUSH_TTL_SECONDS = 6 * 60 * 60;
