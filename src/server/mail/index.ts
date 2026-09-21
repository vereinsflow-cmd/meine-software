import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { after } from "next/server";
import { env } from "@/server/env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    // Kurze Zeitlimits: Ein hängender Mailserver darf Anfragen nicht blockieren.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

/** Zeilenumbrüche im Betreff/Empfänger könnten Header einschleusen ("Header Injection"). */
function assertSafeHeader(value: string, name: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Ungültiger ${name} (Zeilenumbruch)`);
  }
}

/**
 * Versendet eine E-Mail über den konfigurierten Transport:
 *   log  – Ausgabe in der Server-Konsole (nur Entwicklung; in Produktion verboten)
 *   file – JSON-Datei in .local/outbox/ (für automatisierte Tests)
 *   smtp – Versand über den SMTP-Server
 */
export async function sendMail(message: MailMessage): Promise<void> {
  assertSafeHeader(message.to, "Empfänger");
  assertSafeHeader(message.subject, "Betreff");

  switch (env.MAIL_TRANSPORT) {
    case "log":
      console.info(
        `\n[mail] An: ${message.to}\n[mail] Betreff: ${message.subject}\n${message.text}\n`,
      );
      return;

    case "file": {
      const dir = path.resolve(".local", "outbox");
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${Date.now()}-${randomBytes(4).toString("hex")}.json`);
      await writeFile(
        file,
        JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2),
        "utf8",
      );
      return;
    }

    case "smtp":
      await getTransporter().sendMail({
        from: env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return;
  }
}

/**
 * Versendet eine E-Mail NACH der Antwort an den Browser (Next.js `after`). So verrät die Antwortzeit
 * nicht, ob eine Adresse existiert (Benutzer-Enumeration), und ein langsamer Mailserver bremst nichts.
 * Außerhalb einer Anfrage (z. B. in Jobs und Tests) wird direkt gesendet.
 */
export async function sendMailDeferred(message: MailMessage): Promise<void> {
  const run = async () => {
    try {
      await sendMail(message);
    } catch (error) {
      // Fehler protokollieren, aber niemals Empfänger oder Inhalt (können Token enthalten).
      console.error(
        `[mail] Versand fehlgeschlagen: ${error instanceof Error ? error.name : "Fehler"}`,
      );
    }
  };
  try {
    after(run);
  } catch {
    await run();
  }
}
