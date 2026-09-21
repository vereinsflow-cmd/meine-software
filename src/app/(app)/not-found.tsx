import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/** 404 innerhalb des angemeldeten Bereichs (Menü und Kopfzeile bleiben sichtbar). */
export default function AppNotFound() {
  return (
    <EmptyState
      icon={<SearchXIcon />}
      title="Nicht gefunden"
      description="Diesen Eintrag gibt es nicht, oder du hast keinen Zugriff darauf."
      action={
        <Button asChild>
          <Link href="/dashboard">Zum Dashboard</Link>
        </Button>
      }
    />
  );
}
