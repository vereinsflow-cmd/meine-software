import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function NotFound() {
  return (
    <main id="inhalt" className="mx-auto flex min-h-dvh max-w-lg items-center p-6">
      <EmptyState
        className="w-full"
        icon={<SearchXIcon />}
        title="Seite nicht gefunden"
        description="Diese Seite gibt es nicht, oder du hast keinen Zugriff darauf."
        action={
          <Button asChild>
            <Link href="/dashboard">Zum Dashboard</Link>
          </Button>
        }
      />
    </main>
  );
}
