import type { Metadata } from "next";
import Link from "next/link";
import { ListChecksIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { TASK_PRIORITY_LABEL } from "@/lib/labels";
import { enumParam, pageRequest, param, type RawSearchParams } from "@/lib/search-params";
import { listChecklists } from "@/modules/tasks/checklists";
import { ChecklistCard, NewChecklistDialog } from "@/modules/tasks/components/checklist-panel";
import { TaskFormDialog, TaskRow } from "@/modules/tasks/components/task-controls";
import { TASK_PRIORITIES, emptyTask } from "@/modules/tasks/schemas";
import { getTaskFormOptions, getTaskStats, listTasks } from "@/modules/tasks/service";
import { can, scopeOf } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Aufgaben" };

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

  const [result, options, stats, checklists] = await Promise.all([
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
    showChecklists ? listChecklists(ctx) : Promise.resolve([]),
  ]);
  const filtered = Boolean(q || view !== "offen" || priority || assignee || eventId || overdueOnly);
  const canManage = can(ctx, "tasks:manage");
  const canFilterAssignee = scope !== "OWN";

  return (
    <>
      <PageHeader
        title="Aufgaben"
        description={`${stats.open} offen · ${stats.overdue} überfällig${ctx.memberId ? ` · ${stats.mineOpen} mir zugewiesen` : ""}`}
        actions={
          canManage ? <TaskFormDialog defaults={emptyTask(eventId)} options={options} /> : undefined
        }
      />

      <form
        key={JSON.stringify(params)}
        method="get"
        action="/aufgaben"
        role="search"
        aria-label="Aufgaben filtern"
        className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_auto_auto]"
      >
        {eventId && <input type="hidden" name="veranstaltung" value={eventId} />}
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Titel oder Beschreibung suchen …"
          aria-label="Aufgaben durchsuchen"
        />
        <NativeSelect name="ansicht" defaultValue={view} aria-label="Ansicht wählen">
          <option value="offen">Offene</option>
          <option value="erledigt">Erledigte</option>
          <option value="alle">Alle</option>
        </NativeSelect>
        <NativeSelect
          name="prioritaet"
          defaultValue={priority ?? ""}
          aria-label="Nach Priorität filtern"
        >
          <option value="">Alle Prioritäten</option>
          {TASK_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {TASK_PRIORITY_LABEL[value]}
            </option>
          ))}
        </NativeSelect>
        {canFilterAssignee ? (
          <NativeSelect
            name="zustaendig"
            defaultValue={assignee ?? ""}
            aria-label="Nach Zuständigkeit filtern"
          >
            <option value="">Alle Zuständigen</option>
            {ctx.memberId && <option value="me">Mir zugewiesen</option>}
            <option value="none">Niemand zugewiesen</option>
          </NativeSelect>
        ) : (
          <span className="hidden lg:block" />
        )}
        <label className="flex h-9 items-center gap-2 text-sm whitespace-nowrap">
          <input
            type="checkbox"
            name="ueberfaellig"
            value="1"
            defaultChecked={overdueOnly}
            className="size-4"
          />{" "}
          Nur überfällige
        </label>
        <div className="flex gap-2">
          <Button type="submit">Filtern</Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/aufgaben">Zurücksetzen</Link>
            </Button>
          )}
        </div>
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<ListChecksIcon />}
          title={filtered ? "Keine passenden Aufgaben" : "Keine offenen Aufgaben"}
          description={
            filtered
              ? "Passe die Suche oder die Filter an."
              : canManage
                ? "Lege eine Aufgabe an und weise sie jemandem zu."
                : "Dir sind aktuell keine Aufgaben zugewiesen."
          }
          action={
            !filtered && canManage ? (
              <TaskFormDialog defaults={emptyTask()} options={options} />
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="grid gap-3">
            {result.items.map((task) => (
              <TaskRow key={task.id} task={task} options={options} />
            ))}
          </ul>
          <Pagination basePath="/aufgaben" searchParams={params} {...result} />
        </>
      )}

      {showChecklists && (
        <section aria-labelledby="checklisten" className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="checklisten" className="text-lg font-semibold">
              Checklisten
            </h2>
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
