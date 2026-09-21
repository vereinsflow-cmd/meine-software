/**
 * Führt die Hintergrundjobs aus (Erinnerungen, E-Mail-Versand, Aufräumen, Aufbewahrungsfristen).
 *
 *   npm run jobs:run                       alle Jobs
 *   npm run jobs:run -- --only=reminders,mail
 *
 * Empfehlung für den Betrieb: alle 15 Minuten aufrufen (Cron, Windows-Aufgabenplanung, Container-Scheduler).
 * Beendet sich mit Code 1, wenn ein Job fehlgeschlagen ist; ein übersprungener Lauf (anderer Läufer aktiv) ist kein Fehler.
 */
import "dotenv/config";
import { JOB_NAMES, isJobName, runJobs, type JobName } from "../src/server/jobs/runner";

async function main(): Promise<number> {
  const arg = process.argv.find((value) => value.startsWith("--only="));
  let only: JobName[] | undefined;
  if (arg) {
    const requested = arg
      .slice("--only=".length)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const unknown = requested.filter((value) => !isJobName(value));
    if (unknown.length > 0) {
      console.error(`Unbekannte Jobs: ${unknown.join(", ")}. Erlaubt: ${JOB_NAMES.join(", ")}`);
      return 2;
    }
    only = requested as JobName[];
  }

  const summary = await runJobs({ only });
  if (!summary.ran) {
    console.log("Übersprungen: Es läuft bereits ein anderer Job-Lauf.");
    return 0;
  }
  for (const report of summary.reports) {
    const detail = report.ok ? JSON.stringify(report.result) : `FEHLER (${report.error})`;
    console.log(
      `${report.ok ? "✓" : "✗"} ${report.name.padEnd(10)} ${String(report.durationMs).padStart(5)} ms  ${detail}`,
    );
  }
  return summary.reports.every((report) => report.ok) ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
