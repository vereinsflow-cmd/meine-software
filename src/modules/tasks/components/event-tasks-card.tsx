import Link from "next/link";
import { ListChecksIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, scopeOf } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";
import { listChecklists } from "../checklists";
import { ChecklistCard, NewChecklistDialog } from "./checklist-panel";

/**
 * Karte "Aufgaben und Checklisten" auf der Veranstaltungsseite. Wird nur angezeigt, wenn die Rolle Checklisten sehen darf
 * (Verein oder eigene Abteilung); "nur eigene Aufgaben" sieht sie nicht.
 */
export async function EventTasksCard({ ctx, eventId }: { ctx: TenantContext; eventId: string }) {
  const scope = scopeOf(ctx, "tasks:read");
  if (scope !== "CLUB" && scope !== "DEPARTMENT") return null;
  const lists = await listChecklists(ctx, { eventId });
  const canCreate = can(ctx, "tasks:manage");
  if (lists.length === 0 && !canCreate) return null;

  return (
    <section aria-labelledby="event-checklisten">
      <Card>
        <CardHeader>
          <CardTitle
            id="event-checklisten"
            role="heading"
            aria-level={2}
            className="flex items-center gap-2 text-base [&_svg]:size-4"
          >
            <ListChecksIcon aria-hidden="true" /> Aufgaben und Checklisten
          </CardTitle>
          <CardDescription>Vorbereitung und To-dos für diese Veranstaltung.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {lists.map((list) => (
            <ChecklistCard key={list.id} list={list} />
          ))}
          <div className="flex flex-wrap gap-2">
            {canCreate && <NewChecklistDialog eventId={eventId} />}
            <Button asChild variant="ghost">
              <Link href={`/aufgaben?veranstaltung=${eventId}&ansicht=alle`}>
                Aufgaben zu dieser Veranstaltung
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
