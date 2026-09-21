import { NextResponse, type NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/server/api";
import { forbidden, unauthenticated } from "@/server/errors";
import { env } from "@/server/env";
import { JOB_NAMES, isJobName, runJobs, type JobName } from "@/server/jobs/runner";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { getRequestMeta } from "@/server/security/request";
import { safeEqual } from "@/server/security/tokens";

/**
 * Löst die Hintergrundjobs per HTTP aus (für Scheduler, die nur URLs aufrufen können).
 *
 * Schutz: geheimer Bearer-Token (`CRON_SECRET`, Vergleich in konstanter Zeit) – keine Cookies, keine Sitzung. Der Aufruf
 * ist deshalb auch nicht "same-origin"-pflichtig. Falsche Versuche werden je Herkunft begrenzt. Die Antwort enthält nur
 * Zahlen und Fehlertypen, nie Daten aus der Datenbank.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://verein.example/api/cron/run?jobs=reminders,mail"
 */
async function handle(request: NextRequest): Promise<Response> {
  try {
    const { ip } = await getRequestMeta();
    await enforceRateLimit(`cron:${ip}`, 60, 3600);

    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw unauthenticated();
    if (!safeEqual(token, env.CRON_SECRET)) throw forbidden("Ungültiges Token.");

    const requested = request.nextUrl.searchParams.get("jobs");
    let only: JobName[] | undefined;
    if (requested) {
      const names = requested
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const unknown = names.filter((name) => !isJobName(name));
      if (unknown.length > 0)
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "VALIDATION",
              message: `Unbekannte Jobs. Erlaubt: ${JOB_NAMES.join(", ")}`,
            },
          },
          { status: 422, headers: { "Cache-Control": "no-store" } },
        );
      only = names as JobName[];
    }

    const summary = await runJobs({ only });
    return jsonOk(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error, "cron");
  }
}

export const GET = handle;
export const POST = handle;
