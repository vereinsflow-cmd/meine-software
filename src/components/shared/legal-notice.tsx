import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Deutlicher Hinweis auf rechtlich zu prüfende Platzhaltertexte. */
export function PlaceholderNotice() {
  return (
    <Alert className="mb-6">
      <TriangleAlertIcon />
      <AlertTitle>Platzhalter – vor dem Produktivbetrieb ausfüllen</AlertTitle>
      <AlertDescription>
        Dieser Text ist eine technische Vorlage und ersetzt keine Rechtsberatung. Der Betreiber muss
        ihn vollständig ausfüllen und rechtlich prüfen lassen. Alle Angaben in [eckigen Klammern]
        sind zu ersetzen.
      </AlertDescription>
    </Alert>
  );
}
