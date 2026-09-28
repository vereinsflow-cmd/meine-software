import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/** Unbekanntes oder fremdes Mitglied: zurück zur Mitgliederliste statt nur zum Dashboard. */
export default function MemberNotFound() {
  return (
    <EmptyState
      icon={<SearchXIcon />}
      title="Mitglied nicht gefunden"
      description="Dieses Mitglied gibt es nicht (mehr), oder du hast keinen Zugriff darauf."
      action={
        <Button asChild>
          <Link href="/mitglieder">Zur Mitgliederliste</Link>
        </Button>
      }
    />
  );
}
