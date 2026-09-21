import "server-only";
import { env } from "@/server/env";
import { prisma } from "@/server/db/client";
import { sendMail, type MailMessage } from "@/server/mail";
import { notificationEmail } from "@/server/mail/templates";

/**
 * Versendet die E-Mails zu Benachrichtigungen, die mit `emailStatus = PENDING` vorgemerkt wurden.
 *
 * - Nur an Personen, die E-Mails nicht abgeschaltet haben und deren Konto und Verein aktiv sind – das wird HIER erneut
 *   geprüft, denn zwischen Vormerken und Versand kann sich das ändern.
 * - Scheitert der Versand (z. B. Mailserver nicht erreichbar), bleibt die Nachricht vorgemerkt und wird beim nächsten
 *   Lauf erneut versucht – höchstens sechs Stunden lang; danach gilt sie als fehlgeschlagen. Die Benachrichtigung in der
 *   Anwendung ist davon unberührt.
 * - Im Protokoll stehen weder Empfänger noch Inhalt.
 */
export const MAIL_RETRY_HOURS = 6;

export interface MailQueueResult {
  sent: number;
  failed: number;
  skipped: number;
  retry: number;
}

export async function sendPendingEmails(
  options: { now?: Date; batchSize?: number; send?: (message: MailMessage) => Promise<void> } = {},
): Promise<MailQueueResult> {
  const now = options.now ?? new Date();
  const send = options.send ?? sendMail;
  const result: MailQueueResult = { sent: 0, failed: 0, skipped: 0, retry: 0 };

  const rows = await prisma.notification.findMany({
    where: { emailStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: options.batchSize ?? 100,
    select: {
      id: true,
      title: true,
      body: true,
      linkUrl: true,
      createdAt: true,
      membership: {
        select: {
          status: true,
          club: { select: { name: true, status: true } },
          user: {
            select: { email: true, emailNotifications: true, disabledAt: true, deletedAt: true },
          },
        },
      },
    },
  });

  const mark = (id: string, emailStatus: "SENT" | "FAILED" | "NONE") =>
    prisma.notification.updateMany({
      where: { id, emailStatus: "PENDING" },
      data: { emailStatus, emailSentAt: emailStatus === "SENT" ? now : null },
    });

  for (const row of rows) {
    const { user, club } = row.membership;
    if (
      !user.emailNotifications ||
      user.disabledAt ||
      user.deletedAt ||
      row.membership.status !== "ACTIVE" ||
      club.status !== "ACTIVE"
    ) {
      await mark(row.id, "NONE");
      result.skipped += 1;
      continue;
    }
    try {
      await send(
        notificationEmail({
          to: user.email,
          clubName: club.name,
          title: row.title,
          body: row.body,
          url: row.linkUrl ? `${env.APP_URL}${row.linkUrl}` : null,
        }),
      );
      await mark(row.id, "SENT");
      result.sent += 1;
    } catch (error) {
      console.error(
        `[mail-queue] Versand fehlgeschlagen: ${error instanceof Error ? error.name : "Fehler"}`,
      );
      if (now.getTime() - row.createdAt.getTime() > MAIL_RETRY_HOURS * 3_600_000) {
        await mark(row.id, "FAILED");
        result.failed += 1;
      } else {
        result.retry += 1;
      }
    }
  }
  return result;
}
