import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { AREA_ICON } from "@/components/shared/area-icons";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { TASK_PRIORITY_LABEL } from "@/lib/labels";
import {
  buildQuery,
  enumParam,
  pageRequest,
  param,
  type RawSearchParams,
} from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { listChecklists } from "@/modules/tasks/checklists";
import { ChecklistCard, NewChecklistDialog } from "@/modules/tasks/components/checklist-panel";
import { TaskFormDialog, TaskRow } from "@/modules/tasks/components/task-controls";
import {
  TASK_TABS,
  TASK_TAB_LABEL,
  TASK_TAB_PARAMS,
  activeTaskTab,
  groupByDue,
  type TaskTab,
} from "@/modules/tasks/list-view";
import { TASK_PRIORITIES, emptyTask } from "@/modules/tasks/schemas";
import {
  countUnassignedOpen,
  getTaskFormOptions,
  getTaskStats,
  listTasks,
} from "@/modules/tasks/service";
import { can, scopeOf } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Aufgaben" };

/** Hinweis, wenn ein Reiter leer ist – sagt, was das bedeutet, statt nur „nichts gefunden“. */
const EMPTY_TEXT: Record<TaskTab, { title: string; description: string }> = {
  offen: {
    title: "Keine offenen Aufgaben",
    description: "Dir sind aktuell keine Aufgaben zugewiesen.",
  },
  mir: {
    title: "Nichts zugewiesen",
    description: "Dir ist gerade keine offene Aufgabe zugewiesen.",
  },
  niemand: {
    title: "Alles verteilt",
    description: "Um jede offene Aufgabe kümmert sich schon jemand.",
  },
  ueberfaellig: {
    title: "Nichts überfällig",
    description: "Alle Fristen offener Aufgaben liegen noch vor uns.",
  },
  erledigt: { title: "Noch nichts erledigt", description: "Abgehakte Aufgaben erscheinen hier." },
  alle: { title: "Noch keine Aufgaben", description: "Hier stehen offene und erledigte Aufgaben." },
};

/**
 * Aufgaben. Oben Reiter statt Auswahlfeldern (ein Klick, sofort wirksam, mit Anzahl), darunter die Aufgaben nach Frist
 * gruppiert (überfällig, nächste 7 Tage, später, ohne Datum). Suche und Priorität bleiben als schlanke Zeile.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "tasks:read")) return <NoAccess what="die Aufgaben" />;

  const view = enumParam(params, "ansicht", ["offen", "erledigt", "alle"] as const) ?? "offen";
  const priority = enumParam(params, "prioritaet", TASK_PRIORITIES);
  const assignee = param(params, "zustaendig");
  const eventId = param(params, "veranstaltung");
  const overdueOnly = param(params, "ueberfaellig") === "1";
  const q = param(params, "q");
  const scope = scopeOf(ctx, "tasks:read");
  const showChecklists = scope === "CLUB" || scope === "DEPARTMENT";
  const canManage = can(ctx, "tasks:manage");
  // Wer nur die eigenen Aufgaben sieht, braucht weder „Mir zugewiesen“ noch „Nicht zugewiesen“.
  const seesOthers = scope !== "OWN";
  const tab = activeTaskTab({
    ansicht: view,
    zustaendig: assignee,
    ueberfaellig: param(params, "ueberfaellig"),
  });

  const [result, options, stats, unassigned, checklists] = await Promise.all([
    listTasks(ctx, {
      q,
      view: { offen: "open", erledigt: "done", alle: "all" }[view] as "open" | "done" | "all",
      priority,
      assignee,
      eventId,
      overdueOnly,
      request: pageRequest(params, 15),
    }),
    getTaskFormOptions(ctx),
    getTaskStats(ctx),
    seesOthers ? countUnassignedOpen(ctx) : Promise.resolve(0),
    showChecklists ? listChecklists(ctx) : Promise.resolve([]),
  ]);
  const searched = Boolean(q || priority);
  const eventTitle = eventId ? options.events.find((event) => event.id === eventId)?.title : null;

  const tabs = TASK_TABS.filter((entry) =>
    entry === "mir" ? seesOthers && Boolean(ctx.memberId) : entry === "niemand" ? seesOthers : true,
  );
  const counts: Partial<Record<TaskTab, number>> = {
    offen: stats.open,
    mir: stats.mineOpen,
    niemand: unassigned,
    ueberfaellig: stats.overdue,
  };
  // Reiterwechsel behält Suche, Priorität und Veranstaltung und springt auf Seite 1.
  const tabHref = (entry: TaskTab) =>
    `/aufgaben${buildQuery(params, { ...TASK_TAB_PARAMS[entry], page: undefined })}`;
  const groups = tab === "erledigt" ? null : groupByDue(result.items);
  const empty = searched
    ? { title: "Keine passenden Aufgaben", description: "Passe die Suche oder die Priorität an." }
    : tab === "offen" && canManage
      ? {
          title: "Keine offenen Aufgaben",
          description: "Lege eine Aufgabe an und weise sie jemandem zu.",
        }
      : EMPTY_TEXT[tab];

  return (
    <>
      <PageHeader
        title="Aufgaben"
        description="Was im Verein zu erledigen ist – wer sich kümmert und bis wann."
        actions={
          canManage ? <TaskFormDialog defaults={emptyTask(eventId)} options={options} /> : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Aufgaben anzeigen" className={SEGMENT_BAR}>
          {tabs.map((entry) => {
            const count = counts[entry];
            const current = entry === tab;
            return (
              <Link
                key={entry}
                href={tabHref(entry)}
                aria-current={current ? "page" : undefined}
                className={segmentItem(current)}
              >
                {TASK_TAB_LABEL[entry]}
                {count !== undefined && (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
                      entry === "ueberfaellig" && count > 0
                        ? "bg-destructive/10 text-destructive"
                        : "bg-background/70 text-muted-foreground dark:bg-background/40",
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <form
          key={JSON.stringify(params)}
          method="get"
          action="/aufgaben"
          role="search"
          aria-label="Aufgaben filtern"
          className="flex w-full flex-wrap items-center gap-2 lg:w-auto"
        >
          {/* Der gewählte Reiter und die Veranstaltung bleiben beim Suchen erhalten. */}
          {Object.entries(TASK_TAB_PARAMS[tab]).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null,
          )}
          {eventId && <input type="hidden" name="veranstaltung" value={eventId} />}
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Suchen …"
            aria-label="Aufgaben durchsuchen"
            className="min-w-40 flex-1 lg:w-56 lg:flex-none"
          />
          <NativeSelect
            name="prioritaet"
            defaultValue={priority ?? ""}
            aria-label="Nach Priorität filtern"
            className="w-auto"
          >
            <option value="">Alle Prioritäten</option>
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {TASK_PRIORITY_LABEL[value]}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" variant="outline">
            Filtern
          </Button>
          {searched && (
            <Button asChild variant="ghost">
              <Link
                href={`/aufgaben${buildQuery(params, { q: undefined, prioritaet: undefined, page: undefined })}`}
              >
                Zurücksetzen
              </Link>
            </Button>
          )}
        </form>
      </div>

      {eventId && (
        <p className="mb-4 text-sm text-muted-foreground">
          Es werden nur Aufgaben {eventTitle ? `zu „${eventTitle}“` : "zu einer Veranstaltung"}{" "}
          angezeigt.{" "}
          <Link
            href={`/aufgaben${buildQuery(params, { veranstaltung: undefined, page: undefined })}`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Alle Aufgaben anzeigen
          </Link>
        </p>
      )}

      {result.items.length === 0 ? (
        <EmptyState
          icon={<AREA_ICON.aufgaben />}
          title={empty.title}
          description={empty.description}
          action={
            !searched && tab === "offen" && canManage ? (
              <TaskFormDialog defaults={emptyTask(eventId)} options={options} />
            ) : undefined
          }
        />
      ) : (
        <>
          {groups ? (
            <div className="grid gap-6">
              {groups.map((group) => (
                <section key={group.group} aria-labelledby={`gruppe-${group.group}`}>
                  <h2
                    id={`gruppe-${group.group}`}
                    className={cn(
                      "mb-2 flex items-center gap-2 text-sm font-semibold",
                      group.group === "ueberfaellig" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {group.label}
                    <span className="font-normal tabular-nums">· {group.tasks.length}</span>
                  </h2>
                  <ul className="grid gap-2">
                    {group.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} options={options} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <ul className="grid gap-2">
              {result.items.map((task) => (
                <TaskRow key={task.id} task={task} options={options} />
              ))}
            </ul>
          )}
          <Pagination basePath="/aufgaben" searchParams={params} {...result} />
        </>
      )}

      {showChecklists && (
        <section aria-labelledby="checklisten" className="mt-12 border-t pt-8">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="checklisten" className="text-lg font-semibold">
                Checklisten
              </h2>
              <p className="text-sm text-muted-foreground">
                Abhaklisten, z. B. zur Vorbereitung einer Veranstaltung.
              </p>
            </div>
            {canManage && <NewChecklistDialog events={options.events} />}
          </div>
          {checklists.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Checklisten.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {checklists.map((list) => (
                <div key={list.id}>
                  {list.event && (
                    <p className="mb-1 text-xs text-muted-foreground">
                      Veranstaltung:{" "}
                      <Link
                        href={`/veranstaltungen/${list.event.id}`}
                        className="underline underline-offset-4"
                      >
                        {list.event.title}
                      </Link>
                    </p>
                  )}
                  <ChecklistCard list={list} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
