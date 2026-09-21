import "server-only";
import { logUnexpectedError } from "@/server/log";
import { purgeStaleData } from "./cleanup";
import { completePastEvents } from "./events";
import { withJobLock } from "./lock";
import { sendPendingEmails } from "./mail-queue";
import { processDueDeletionRequests } from "@/server/privacy/deletion";
import { sendEventReminders, sendShiftReminders } from "./reminders";
import { applyRetention } from "./retention";

/**
 * Hintergrundjobs. Aufruf von außen – der Betrieb stößt sie regelmäßig an (empfohlen: alle 15 Minuten):
 *   - Kommandozeile:  npm run jobs:run            (z. B. per Cron, Aufgabenplanung oder Container-Scheduler)
 *   - HTTP:           GET/POST /api/cron/run      (Header "Authorization: Bearer <CRON_SECRET>")
 *
 * Reihenfolge: erst abschließen und erinnern, dann E-Mails versenden (damit frische Erinnerungen im selben Lauf
 * hinausgehen), zuletzt aufräumen. Ein fehlgeschlagener Job stoppt die übrigen nicht.
 */
export const JOB_NAMES = [
  "events",
  "reminders",
  "privacy",
  "mail",
  "cleanup",
  "retention",
] as const;
export type JobName = (typeof JOB_NAMES)[number];

const JOBS: Record<JobName, (now: Date) => Promise<Record<string, number>>> = {
  events: async (now) => ({ completed: await completePastEvents(now) }),
  reminders: async (now) => ({
    shifts: await sendShiftReminders(now),
    events: await sendEventReminders(now),
  }),
  // Fällige Löschanträge (nach der Bedenkzeit) – vor dem E-Mail-Versand, damit Bestätigungen im selben Lauf hinausgehen.
  privacy: async (now) => ({ ...(await processDueDeletionRequests(now)) }),
  mail: async (now) => ({ ...(await sendPendingEmails({ now })) }),
  cleanup: async (now) => ({ ...(await purgeStaleData(now)) }),
  retention: async (now) => ({ ...(await applyRetention(now)) }),
};

export interface JobReport {
  name: JobName;
  ok: boolean;
  durationMs: number;
  result?: Record<string, number>;
  /** Nur der Fehlertyp – Details stehen im Server-Protokoll, nie in der Antwort. */
  error?: string;
}

export interface JobRunSummary {
  /** `false`, wenn bereits ein anderer Lauf aktiv war (nichts wurde ausgeführt). */
  ran: boolean;
  reports: JobReport[];
}

export function isJobName(value: string): value is JobName {
  return (JOB_NAMES as readonly string[]).includes(value);
}

export async function runJobs(
  options: { only?: readonly JobName[]; now?: Date } = {},
): Promise<JobRunSummary> {
  const selected = JOB_NAMES.filter((name) => !options.only || options.only.includes(name));
  const now = options.now ?? new Date();

  const outcome = await withJobLock(async () => {
    const reports: JobReport[] = [];
    for (const name of selected) {
      const started = Date.now();
      try {
        const result = await JOBS[name](now);
        reports.push({ name, ok: true, durationMs: Date.now() - started, result });
      } catch (error) {
        logUnexpectedError(`job:${name}`, error);
        reports.push({
          name,
          ok: false,
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.name : "Fehler",
        });
      }
    }
    return reports;
  });

  return outcome.ran ? { ran: true, reports: outcome.value } : { ran: false, reports: [] };
}
