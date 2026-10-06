"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FieldValues, Path, PathValue } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { type BaseProps, errorOf, FieldShell, initialText } from "./form-fields";

/** Ein Vorschlag: `label` (fett) und `detail` (zweite Zeile) stehen in der Liste, `value` kommt ins Feld. */
export interface Suggestion {
  /** Stabil und eindeutig – Schlüssel der Zeile und Teil ihrer Element-ID. */
  id: string;
  label: string;
  detail?: string;
  value: string;
}

/**
 * Lädt Vorschläge zum Suchtext. `null` heißt „gerade keine“ (Fehler, offline, zu viele Anfragen): Das Feld bleibt dann ein
 * normales Textfeld. Muss eine feste Funktion sein (auf Modulebene) – sie ist zugleich der Schlüssel des Zwischenspeichers.
 */
export type SuggestionLoader = (
  query: string,
  signal: AbortSignal,
) => Promise<readonly Suggestion[] | null>;

/** Wartezeit nach dem letzten Tastendruck – wie die Suche oben (search-provider). */
const DEBOUNCE_MS = 150;
const CACHE_LIMIT = 200;
const NO_SUGGESTIONS: readonly Suggestion[] = [];

/** Einmal geladene Vorschläge bleiben für die Sitzung im Browser (auch über Formulare hinweg) – je Ladefunktion. */
const caches = new WeakMap<SuggestionLoader, Map<string, readonly Suggestion[]>>();

function cacheOf(load: SuggestionLoader): Map<string, readonly Suggestion[]> {
  let cache = caches.get(load);
  if (!cache) {
    cache = new Map();
    caches.set(load, cache);
  }
  return cache;
}

function remember(load: SuggestionLoader, key: string, items: readonly Suggestion[]) {
  const cache = cacheOf(load);
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, items);
}

/** Suchtext ohne Leerzeichen am Rand und ohne doppelte Leerzeichen. */
const searchText = (text: string) => text.trim().replace(/\s+/g, " ");
const cacheKey = (query: string) => query.toLocaleLowerCase("de-DE");
const countText = (count: number) => (count === 1 ? "1 Vorschlag" : `${count} Vorschläge`);
const stopPropagation = (event: Event) => event.stopPropagation();

/**
 * In einem Fenster sperrt Radix das Scrollen außerhalb des Fensters (react-remove-scroll verwirft Mausrad und Wischen am
 * Dokument) – die Liste liegt aber in einem Portal außerhalb. Passt sie nicht ganz auf den Bildschirm (schmales Handy,
 * offene Tastatur), wären die unteren Vorschläge sonst nicht erreichbar. Deshalb enden diese Ereignisse an der Liste: Sie
 * scrollt selbst, `overscroll-contain` hält das Fenster dahinter still.
 */
function scrollableInDialog(list: HTMLElement): () => void {
  list.addEventListener("wheel", stopPropagation, { passive: true });
  list.addEventListener("touchmove", stopPropagation, { passive: true });
  return () => {
    list.removeEventListener("wheel", stopPropagation);
    list.removeEventListener("touchmove", stopPropagation);
  };
}
const optionIdOf = (listId: string, item: Suggestion) =>
  `${listId}-${item.id.replace(/[^\w-]/g, "_")}`;

/**
 * Textfeld mit Vorschlägen beim Tippen (Muster „Combobox mit Liste“, WAI-ARIA 1.2): Freitext bleibt immer erlaubt, ein
 * Vorschlag füllt das Feld nur. Eingebunden in React Hook Form wie `TextField` (Beschriftung, Hilfe- und Fehlertext,
 * gespeicherter Wert schon im Server-HTML).
 *
 * - Nichts ist vorausgewählt: Enter speichert das Formular wie bisher. Erst ↓/↑ markieren einen Vorschlag, Enter übernimmt
 *   ihn. Escape schließt nur die Liste (in einem Fenster schließt erst das zweite Escape das Fenster), Tab und Wegklicken
 *   schließen sie ohne Übernahme. Die Leertaste tippt ein Leerzeichen.
 * - Gesucht wird erst, wenn jemand tippt – nie für den Wert, der beim Öffnen schon im Feld steht.
 * - Ohne Treffer, bei Fehlern oder offline bleibt die Liste zu; Screenreader hören die Zahl der Vorschläge bzw. `noMatchMessage`.
 * - Die Liste liegt über dem Fenster (Portal) und erscheint ohne Animation – sie geht beim Tippen auf.
 */
export function SuggestField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  disabled,
  className,
  inputClassName,
  placeholder,
  maxLength,
  enterKeyHint,
  enabled = true,
  minLength = 2,
  load,
  footer,
  noMatchMessage = "Kein passender Vorschlag – du kannst trotzdem etwas Eigenes eintragen.",
}: BaseProps<T> & {
  /** Nur für das Eingabefeld (wie bei `TextField`). */
  inputClassName?: string;
  placeholder?: string;
  maxLength?: number;
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  /** Vorschläge an oder aus (z. B. nur für Bankkonten) – aus: ein normales Textfeld. */
  enabled?: boolean;
  /** Erst ab so vielen Zeichen wird gesucht. */
  minLength?: number;
  load: SuggestionLoader;
  /** Kleine graue Zeile unter den Vorschlägen, z. B. die Quelle der Daten. */
  footer?: React.ReactNode;
  /** Für Screenreader, wenn das Getippte nichts findet. */
  noMatchMessage?: string;
}) {
  const id = useId();
  const listId = `${id}-vorschlaege`;
  const error = errorOf(form, name);
  const registered = form.register(name);
  const suggest = enabled && !disabled;

  /** Liste gewünscht (nach dem Tippen) – Escape, Wegklicken, Übernahme und Verlassen des Feldes nehmen den Wunsch zurück. */
  const [expanded, setExpanded] = useState(false);
  /** Zuletzt geladene Vorschläge – sie bleiben stehen, bis die Antwort zum neuen Suchtext da ist. */
  const [result, setResult] = useState<{ key: string; items: readonly Suggestion[] } | null>(null);
  /** Mit ↓/↑ markierter Vorschlag; `null`: keiner (dann gehört Enter dem Formular). */
  const [activeId, setActiveId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  /** Liste merken (für `reveal`) und in einem Fenster scrollbar halten – React 19 räumt über die zurückgegebene Funktion auf. */
  const setList = useCallback((list: HTMLDivElement | null) => {
    listRef.current = list;
    if (!list) return;
    const release = scrollableInDialog(list);
    return () => {
      release();
      listRef.current = null;
    };
  }, []);
  /** Laufende Suche: Wartezeit nach dem Tippen, Anfrage und Suchtext der letzten Eingabe (ältere Antworten zählen nicht). */
  const pending = useRef<{
    timer?: ReturnType<typeof setTimeout>;
    request?: AbortController;
    key?: string;
  }>({});

  useEffect(() => {
    const current = pending.current;
    return () => {
      clearTimeout(current.timer);
      current.request?.abort();
    };
  }, []);

  // Abgeleitet statt gespeichert: Vorschläge aus (Art „Barkasse“) oder ohne Treffer → Liste zu.
  const items = suggest && expanded && result ? result.items : NO_SUGGESTIONS;
  const open = items.length > 0;
  const activeIndex = activeId === null ? -1 : items.findIndex((item) => item.id === activeId);
  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;

  function stopSearch() {
    const current = pending.current;
    clearTimeout(current.timer);
    current.request?.abort();
    current.timer = undefined;
    current.request = undefined;
    current.key = undefined;
  }

  function closeList() {
    setExpanded(false);
    setActiveId(null);
  }

  function showResult(key: string, found: readonly Suggestion[] | null) {
    setResult({ key, items: found ?? NO_SUGGESTIONS });
    // Fehler bleiben still – das Feld nimmt weiter Freitext.
    setAnnouncement(
      found === null ? "" : found.length > 0 ? countText(found.length) : noMatchMessage,
    );
  }

  async function fetchSuggestions(query: string, key: string) {
    const current = pending.current;
    const request = new AbortController();
    current.request = request;
    let found: readonly Suggestion[] | null;
    try {
      found = await load(query, request.signal);
    } catch {
      found = null; // abgebrochen, offline, keine gültige Antwort
    }
    if (request.signal.aborted || current.key !== key) return;
    current.request = undefined;
    if (found) remember(load, key, found);
    showResult(key, found);
  }

  function search(text: string) {
    setActiveId(null);
    const query = searchText(text);
    if (!suggest || query.length < minLength) {
      stopSearch();
      setExpanded(false);
      setResult(null);
      setAnnouncement("");
      return;
    }
    setExpanded(true);
    const key = cacheKey(query);
    // Gleicher Suchtext (z. B. nur ein Leerzeichen mehr): Die laufende Suche bzw. ihr Ergebnis gilt weiter.
    if (key === pending.current.key) return;
    stopSearch();
    pending.current.key = key;
    const cached = cacheOf(load).get(key);
    if (cached) showResult(key, cached);
    else pending.current.timer = setTimeout(() => void fetchSuggestions(query, key), DEBOUNCE_MS);
  }

  function choose(item: Suggestion) {
    stopSearch();
    closeList();
    setResult(null);
    form.setValue(name, item.value as PathValue<T, Path<T>>, {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
    setAnnouncement(`Übernommen: ${item.value}`);
    // Weiter im Feld, Schreibmarke am Ende – man kann direkt weitertippen oder zum nächsten Feld.
    const input = inputRef.current;
    if (input) {
      if (document.activeElement !== input) input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  /** Markierten Vorschlag sichtbar halten, falls die Liste doch einmal scrollen muss (kleiner Bildschirm). */
  function reveal(item: Suggestion) {
    const list = listRef.current;
    const option = list ? document.getElementById(optionIdOf(listId, item)) : null;
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }

  /** Reihum: (keiner) → erster … letzter → (keiner) – „keiner“ ist der getippte Text. */
  function move(step: 1 | -1) {
    const next = activeIndex === -1 ? (step === 1 ? 0 : items.length - 1) : activeIndex + step;
    const item = items[next];
    setActiveId(item ? item.id : null);
    if (item) reveal(item);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggest || event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        if (open) {
          event.preventDefault();
          move(event.key === "ArrowDown" ? 1 : -1);
        } else if (
          event.key === "ArrowDown" &&
          searchText(event.currentTarget.value).length >= minLength
        ) {
          // Liste ausdrücklich gewünscht – auch für einen Wert, der schon im Feld stand.
          event.preventDefault();
          search(event.currentTarget.value);
        }
        break;
      case "Enter":
        if (activeItem) {
          event.preventDefault();
          choose(activeItem);
        } else {
          closeList(); // Formular wird gespeichert – die Liste soll dabei nichts verdecken
        }
        break;
      case "Escape":
        // Ist die Liste offen, schließt Radix sie selbst (es lauscht vorher am Dokument) und lässt das Fenster offen.
        // Kein preventDefault hier: Bei geschlossener Liste gehört Escape dem Fenster.
        stopSearch();
        closeList();
        break;
    }
  }

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      required={required}
      error={error}
      className={className}
    >
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) closeList();
        }}
      >
        <PopoverAnchor>
          <Input
            id={id}
            type="text"
            className={inputClassName}
            role={suggest ? "combobox" : undefined}
            aria-autocomplete={suggest ? "list" : undefined}
            aria-expanded={suggest ? open : undefined}
            aria-controls={suggest ? listId : undefined}
            aria-activedescendant={activeItem ? optionIdOf(listId, activeItem) : undefined}
            // Keine Liste alter Eingaben und keine Autokorrektur über bzw. in Banknamen („Vest“ → „Best“).
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint={enterKeyHint}
            maxLength={maxLength}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-required={required}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            defaultValue={initialText(form, name)}
            name={registered.name}
            ref={(element) => {
              registered.ref(element);
              inputRef.current = element;
            }}
            onChange={(event) => {
              void registered.onChange(event);
              search(event.target.value);
            }}
            onBlur={(event) => {
              void registered.onBlur(event);
              stopSearch();
              closeList();
            }}
            onKeyDown={onKeyDown}
          />
        </PopoverAnchor>
        <PopoverContent
          // Ohne die Rolle „dialog“ von Radix: Die Liste darin ist ein Teil des Feldes, kein eigenes Fenster.
          role={undefined}
          animated={false}
          side="bottom"
          align="start"
          collisionPadding={16}
          hideWhenDetached
          // Der Fokus bleibt im Feld – beim Öffnen, beim Schließen und beim Tippen auf einen Vorschlag.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target instanceof Node && inputRef.current?.contains(event.target))
              event.preventDefault();
          }}
          // Mindestens so breit wie das Feld (im schmalen Feld der Kassenbuch-Einrichtung sonst dreizeilige Namen), höchstens
          // 28rem und nie breiter als der Bildschirm. Höchstens 8 Zeilen – meist ohne Scrollen; fehlt der Platz (offene
          // Tastatur), scrollt die Liste in sich (auch in einem Fenster, siehe `scrollableInDialog`).
          className="max-h-[min(var(--radix-popover-content-available-height),70dvh)] w-max max-w-[min(28rem,calc(100vw-2rem))] min-w-(--radix-popover-trigger-width) gap-0 p-1"
        >
          <div
            ref={setList}
            id={listId}
            role="listbox"
            // Nicht „Bank…“: Tests und Screenreader finden das Feld über die Beschriftung „Bank“.
            aria-label="Vorschläge"
            className="relative min-h-0 overflow-y-auto overscroll-contain"
          >
            {items.map((item) => (
              <div
                key={item.id}
                id={optionIdOf(listId, item)}
                role="option"
                aria-selected={item.id === activeItem?.id}
                onClick={() => choose(item)}
                className="flex min-w-0 cursor-default touch-manipulation flex-col justify-center rounded-md px-2.5 py-1.5 select-none hover:bg-accent/60 active:bg-accent aria-selected:bg-accent aria-selected:text-accent-foreground pointer-coarse:min-h-11"
              >
                <span className="font-medium wrap-anywhere">{item.label}</span>
                {item.detail ? (
                  <span className="wrap-anywhere text-muted-foreground">{item.detail}</span>
                ) : null}
              </div>
            ))}
          </div>
          {footer ? (
            <p className="mt-1 shrink-0 border-t px-2.5 pt-1.5 pb-0.5 text-xs text-muted-foreground select-none">
              {footer}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
    </FieldShell>
  );
}
