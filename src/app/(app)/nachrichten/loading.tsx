import { ChatPageSkeleton } from "@/components/shared/page-skeletons";

/**
 * Ladezustand der Nachrichten: Chatliste und Verlauf über die ganze Höhe, wie die fertige Seite. Gilt auch für
 * `/nachrichten/<id>` – gesendete Nachrichten leiten dort in ihren Chat weiter.
 */
export default function Loading() {
  return <ChatPageSkeleton label="Nachrichten werden geladen …" />;
}
