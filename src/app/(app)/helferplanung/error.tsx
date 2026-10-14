"use client";

import { AreaError } from "@/components/shared/area-error";

/**
 * Fehler in der Helferplanung (Übersicht, Helferplan, Helferstunden): verständliche Meldung, „Nochmal versuchen“ und der
 * Weg zurück zur Übersicht der Helferplanung.
 */
export default function HelferplanungError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} homeHref="/helferplanung" homeLabel="Zur Helferplanung" />;
}
