"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, SlidersHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/shared/icon-button";
import { cn } from "@/lib/utils";
import { saveDashboardLayoutAction } from "../actions";
import { DASHBOARD_BLOCKS, type DashboardLayout } from "../layout-prefs";
import type { DashboardTabId } from "../tabs";

export interface CustomizeTab {
  id: DashboardTabId;
  label: string;
  /** Karten des Reiters in der aktuellen Reihenfolge – nur die, die die Rolle sehen darf. */
  blocks: { id: string; label: string; visible: boolean }[];
}

/** Standard-Ansicht: alle erlaubten Karten sichtbar, in der vorgesehenen Reihenfolge. */
function defaults(tabs: CustomizeTab[]): CustomizeTab[] {
  return tabs.map((tab) => {
    const byId = new Map(tab.blocks.map((block) => [block.id, block]));
    return {
      ...tab,
      blocks: DASHBOARD_BLOCKS[tab.id]
        .filter((block) => byId.has(block.id))
        .map((block) => ({ ...byId.get(block.id)!, visible: true })),
    };
  });
}

const sameAs = (a: CustomizeTab[], b: CustomizeTab[]) =>
  JSON.stringify(a.map((tab) => tab.blocks)) === JSON.stringify(b.map((tab) => tab.blocks));

/**
 * „Dashboard anpassen“: Jede Person blendet Karten ein und aus und ändert ihre Reihenfolge – je Reiter, gespeichert im
 * Konto (je Verein), also auf allen Geräten gleich. Verschieben mit „nach oben“/„nach unten“ statt nur Ziehen: so geht es
 * auch mit Tastatur und Screenreader. Entspricht die Auswahl der Standard-Ansicht, wird nichts Eigenes gespeichert.
 */
export function CustomizeDashboard({ tabs }: { tabs: CustomizeTab[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(tabs);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();
  const baseId = useId();

  function update(
    tabId: DashboardTabId,
    change: (blocks: CustomizeTab["blocks"]) => CustomizeTab["blocks"],
  ) {
    setState((current) =>
      current.map((tab) => (tab.id === tabId ? { ...tab, blocks: change(tab.blocks) } : tab)),
    );
  }

  function move(tabId: DashboardTabId, index: number, by: -1 | 1) {
    const tab = state.find((entry) => entry.id === tabId)!;
    const target = index + by;
    if (target < 0 || target >= tab.blocks.length) return;
    const block = tab.blocks[index]!;
    update(tabId, (blocks) => {
      const next = [...blocks];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setAnnouncement(
      `„${block.label}“ steht jetzt an Stelle ${target + 1} von ${tab.blocks.length}.`,
    );
  }

  function save() {
    const layout: DashboardLayout | null = sameAs(state, defaults(state))
      ? null
      : {
          v: 1,
          tabs: Object.fromEntries(
            state.map((tab) => [
              tab.id,
              {
                order: tab.blocks.map((block) => block.id),
                hidden: tab.blocks.filter((block) => !block.visible).map((block) => block.id),
              },
            ]),
          ),
        };
    startTransition(async () => {
      const result = await saveDashboardLayoutAction(layout);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(layout ? "Dashboard gespeichert." : "Standard-Ansicht wiederhergestellt.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) setState(tabs); // immer vom gespeicherten Stand aus beginnen
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontalIcon /> Anpassen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dashboard anpassen</DialogTitle>
          <DialogDescription>
            Wähle, welche Karten du siehst und in welcher Reihenfolge. Das gilt nur für dich – auf
            allen Geräten.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          {state.map((tab) => (
            <section key={tab.id} aria-labelledby={`${baseId}-${tab.id}`} className="grid gap-2">
              <h3 id={`${baseId}-${tab.id}`} className="text-sm font-semibold">
                {tab.label}
              </h3>
              <ol className="grid gap-1.5">
                {tab.blocks.map((block, index) => {
                  const checkboxId = `${baseId}-${tab.id}-${block.id}`;
                  const first = index === 0;
                  const last = index === tab.blocks.length - 1;
                  return (
                    <li
                      key={block.id}
                      aria-label={block.label}
                      className="flex items-center gap-2 rounded-lg border px-3 py-1.5"
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={block.visible}
                        onChange={(event) => {
                          const visible = event.target.checked;
                          update(tab.id, (blocks) =>
                            blocks.map((entry) =>
                              entry.id === block.id ? { ...entry, visible } : entry,
                            ),
                          );
                        }}
                        className="size-4 shrink-0 accent-primary"
                      />
                      <label
                        htmlFor={checkboxId}
                        className={cn(
                          "min-w-0 flex-1 cursor-pointer py-1 text-sm",
                          !block.visible && "text-muted-foreground",
                        )}
                      >
                        {block.label}
                        {!block.visible && <span className="sr-only"> (ausgeblendet)</span>}
                      </label>
                      {/* `aria-disabled` statt `disabled`: Der Fokus bleibt auf dem Knopf, auch wenn die Karte oben ankommt. */}
                      <IconButton
                        label={`„${block.label}“ nach oben`}
                        aria-disabled={first}
                        className="size-8 aria-disabled:opacity-40"
                        onClick={() => move(tab.id, index, -1)}
                      >
                        <ArrowUpIcon />
                      </IconButton>
                      <IconButton
                        label={`„${block.label}“ nach unten`}
                        aria-disabled={last}
                        className="size-8 aria-disabled:opacity-40"
                        onClick={() => move(tab.id, index, 1)}
                      >
                        <ArrowDownIcon />
                      </IconButton>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setState(defaults(state));
              setAnnouncement("Standard-Ansicht ausgewählt – mit „Speichern“ übernehmen.");
            }}
          >
            Standard wiederherstellen
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Abbrechen
              </Button>
            </DialogClose>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Einen Moment …" : "Speichern"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
