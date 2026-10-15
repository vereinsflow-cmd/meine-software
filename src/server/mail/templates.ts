import { formatDateTime } from "@/lib/dates";
import type { MailMessage } from "./index";

/**
 * E-Mail-Vorlagen (Text + einfaches HTML). Dynamische Werte werden für HTML immer maskiert.
 */
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface Layout {
  title: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footer?: string;
}

function render(subject: string, to: string, layout: Layout): MailMessage {
  const text = [
    layout.title,
    "",
    ...layout.paragraphs,
    ...(layout.action ? ["", `${layout.action.label}: ${layout.action.url}`] : []),
    "",
    layout.footer ?? "Diese E-Mail wurde automatisch von VereinsFlow versendet.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="de"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:32px;">
<tr><td>
<h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(layout.title)}</h1>
${layout.paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(p)}</p>`).join("\n")}
${
  layout.action
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(layout.action.url)}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;">${escapeHtml(layout.action.label)}</a></p>
<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>${escapeHtml(layout.action.url)}</p>`
    : ""
}
<p style="margin:24px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(layout.footer ?? "Diese E-Mail wurde automatisch von VereinsFlow versendet.")}</p>
</td></tr></table></td></tr></table></body></html>`;

  return { to, subject, text, html };
}

export function invitationEmail(input: {
  to: string;
  clubName: string;
  inviterName: string | null;
  roleName: string;
  url: string;
  expiresAt: Date;
}): MailMessage {
  const who = input.inviterName ? `${input.inviterName} hat dich` : "Du wurdest";
  return render(`Einladung zu ${input.clubName}`, input.to, {
    title: `Einladung zu ${input.clubName}`,
    paragraphs: [
      `${who} eingeladen, dem Verein „${input.clubName}“ in VereinsFlow beizutreten (Rolle: ${input.roleName}).`,
      `Die Einladung ist gültig bis ${formatDateTime(input.expiresAt)} Uhr und kann nur einmal verwendet werden.`,
    ],
    action: { label: "Einladung annehmen", url: input.url },
    footer:
      "Wenn du diese Einladung nicht erwartet hast, kannst du diese E-Mail einfach ignorieren.",
  });
}

export function passwordResetEmail(input: {
  to: string;
  url: string;
  validMinutes: number;
}): MailMessage {
  return render("Passwort zurücksetzen", input.to, {
    title: "Passwort zurücksetzen",
    paragraphs: [
      "Für dein VereinsFlow-Konto wurde das Zurücksetzen des Passworts angefordert.",
      `Der Link ist ${input.validMinutes} Minuten gültig und kann nur einmal verwendet werden.`,
    ],
    action: { label: "Neues Passwort festlegen", url: input.url },
    footer:
      "Wenn du das nicht angefordert hast, ignoriere diese E-Mail – dein Passwort bleibt unverändert.",
  });
}

export function passwordChangedEmail(input: { to: string }): MailMessage {
  return render("Dein Passwort wurde geändert", input.to, {
    title: "Dein Passwort wurde geändert",
    paragraphs: [
      "Das Passwort deines VereinsFlow-Kontos wurde soeben geändert. Aus Sicherheitsgründen wurdest du auf allen Geräten abgemeldet.",
      "Warst du das nicht? Setze dein Passwort bitte sofort über „Passwort vergessen“ zurück und informiere den Vereinsadministrator.",
    ],
  });
}

export function emailVerificationEmail(input: { to: string; url: string }): MailMessage {
  return render("E-Mail-Adresse bestätigen", input.to, {
    title: "E-Mail-Adresse bestätigen",
    paragraphs: ["Bitte bestätige deine E-Mail-Adresse, um dein VereinsFlow-Konto zu nutzen."],
    action: { label: "E-Mail-Adresse bestätigen", url: input.url },
  });
}

export function deletionRequestedEmail(input: {
  to: string;
  scheduledFor: Date;
  profileUrl: string;
}): MailMessage {
  return render("Löschung deines Kontos beantragt", input.to, {
    title: "Löschung deines Kontos beantragt",
    paragraphs: [
      "Du hast die Löschung deines VereinsFlow-Kontos und deiner Mitgliedsdaten beantragt.",
      `Nach einer Bedenkzeit wird die Löschung am ${formatDateTime(input.scheduledFor)} Uhr automatisch ausgeführt. Danach lassen sich die Daten nicht wiederherstellen.`,
      "Du kannst den Antrag bis dahin jederzeit unter „Datenschutz“ zurückziehen.",
    ],
    action: { label: "Datenschutz-Seite öffnen", url: input.profileUrl },
    footer:
      "Warst du das nicht? Ändere sofort dein Passwort und melde dich beim Administrator deines Vereins.",
  });
}

export function deletionCompletedEmail(input: { to: string }): MailMessage {
  return render("Dein Konto wurde gelöscht", input.to, {
    title: "Dein Konto wurde gelöscht",
    paragraphs: [
      "Auf deinen Antrag hin wurden dein VereinsFlow-Konto gelöscht und deine Mitgliedsdaten anonymisiert.",
      "Diese Bestätigung ist die letzte E-Mail an diese Adresse. Deine Adresse wird nicht weiter gespeichert.",
    ],
  });
}

export function deletionRejectedEmail(input: { to: string; reason: string }): MailMessage {
  return render("Dein Löschantrag konnte nicht ausgeführt werden", input.to, {
    title: "Dein Löschantrag konnte nicht ausgeführt werden",
    paragraphs: [
      input.reason,
      "Dein Konto besteht unverändert weiter. Sobald das Hindernis beseitigt ist, kannst du den Antrag erneut stellen.",
    ],
  });
}

export function notificationEmail(input: {
  to: string;
  clubName: string;
  title: string;
  body: string | null;
  url: string | null;
}): MailMessage {
  // Betreff einzeilig halten: Titel stammen aus Nutzereingaben; ein Zeilenumbruch würde vom Versand als Header-Injection abgelehnt.
  const oneLine = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
  return render(`[${oneLine(input.clubName)}] ${oneLine(input.title)}`.slice(0, 200), input.to, {
    title: input.title,
    paragraphs: input.body ? [input.body] : [],
    action: input.url ? { label: "In VereinsFlow öffnen", url: input.url } : undefined,
    footer: `Benachrichtigung von ${input.clubName}. Du kannst E-Mail-Benachrichtigungen in deinem Profil abschalten.`,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Zwei-Faktor-Anmeldung: Jede Änderung meldet sich bei der Person – so fällt auf, wenn jemand anderes am Konto war.
// ---------------------------------------------------------------------------------------------------------------------

const NOT_YOU =
  "Warst du das nicht? Ändere bitte sofort dein Passwort und melde dich beim Vereinsadministrator.";

export function twoFactorEnabledEmail(input: { to: string }): MailMessage {
  return render("Zwei-Faktor-Anmeldung eingeschaltet", input.to, {
    title: "Zwei-Faktor-Anmeldung eingeschaltet",
    paragraphs: [
      "Für dein VereinsFlow-Konto ist jetzt die Zwei-Faktor-Anmeldung eingeschaltet. Bei jeder Anmeldung fragen wir nach dem Passwort zusätzlich nach dem Code aus deiner Authenticator-App.",
      "Bewahre deine Wiederherstellungscodes gut auf. Mit ihnen kommst du in dein Konto, falls du dein Handy verlierst. Alle anderen Geräte wurden abgemeldet.",
    ],
    footer: NOT_YOU,
  });
}

export function twoFactorDisabledEmail(input: { to: string }): MailMessage {
  return render("Zwei-Faktor-Anmeldung ausgeschaltet", input.to, {
    title: "Zwei-Faktor-Anmeldung ausgeschaltet",
    paragraphs: [
      "Für dein VereinsFlow-Konto wurde die Zwei-Faktor-Anmeldung ausgeschaltet. Ab jetzt genügt zur Anmeldung wieder dein Passwort.",
      "Deine bisherigen Wiederherstellungscodes gelten nicht mehr.",
    ],
    footer: NOT_YOU,
  });
}

export function twoFactorRecoveryUsedEmail(input: { to: string; remaining: number }): MailMessage {
  return render("Anmeldung mit Wiederherstellungscode", input.to, {
    title: "Anmeldung mit Wiederherstellungscode",
    paragraphs: [
      "Soeben hat sich jemand mit einem deiner Wiederherstellungscodes bei VereinsFlow angemeldet. Dieser Code gilt jetzt nicht mehr.",
      input.remaining === 1
        ? "Du hast noch 1 Wiederherstellungscode."
        : `Du hast noch ${input.remaining} Wiederherstellungscodes.`,
      "Hast du dein Handy verloren? Erstelle unter „Mein Profil“ neue Codes oder schalte die Zwei-Faktor-Anmeldung aus und richte sie mit dem neuen Handy wieder ein.",
    ],
    footer: NOT_YOU,
  });
}

export function twoFactorRecoveryRenewedEmail(input: { to: string }): MailMessage {
  return render("Neue Wiederherstellungscodes erstellt", input.to, {
    title: "Neue Wiederherstellungscodes erstellt",
    paragraphs: [
      "Für dein VereinsFlow-Konto wurden neue Wiederherstellungscodes erstellt. Die bisherigen Codes gelten nicht mehr.",
    ],
    footer: NOT_YOU,
  });
}

export function twoFactorLockedEmail(input: { to: string }): MailMessage {
  return render("Mehrere falsche Codes bei der Anmeldung", input.to, {
    title: "Mehrere falsche Codes bei der Anmeldung",
    paragraphs: [
      "Bei der Anmeldung in dein VereinsFlow-Konto wurde mehrmals ein falscher Code aus der Authenticator-App eingegeben. Die Anmeldung ist deshalb für eine Weile gesperrt.",
      "Das Passwort war dabei richtig. Warst du das nicht, kennt vermutlich jemand dein Passwort: Ändere es bitte bald unter „Mein Profil“ oder über „Passwort vergessen?“.",
    ],
  });
}

export function twoFactorResetEmail(input: { to: string; by: string }): MailMessage {
  return render("Zwei-Faktor-Anmeldung zurückgesetzt", input.to, {
    title: "Zwei-Faktor-Anmeldung zurückgesetzt",
    paragraphs: [
      `Die Zwei-Faktor-Anmeldung deines VereinsFlow-Kontos wurde durch ${input.by} zurückgesetzt. Du wurdest auf allen Geräten abgemeldet.`,
      "Du meldest dich jetzt nur mit deinem Passwort an. Richte die Zwei-Faktor-Anmeldung danach bitte unter „Mein Profil“ neu ein.",
    ],
    footer: "Hast du das nicht veranlasst? Melde dich bitte sofort beim Vereinsadministrator.",
  });
}
