/**
 * Nachrichten wie /nachrichten am Handy: Chatliste (nachrichten-liste.png) und geöffneter Chat „Alle Mitglieder“
 * (nachrichten.png) – Farben wie WhatsApp dunkel (chat-thread.tsx der App, --chat-* in .dark).
 *
 * Bildraum (scrollY 0): Liste – Titel y≈240, „+ Neue Nachricht“ y≈549–657, Karte y≈705–2484, „Entwürfe“-Zeile
 * y 708–831, Chatzeilen ab y 833 je 218 hoch (Text ab x 255).
 * Chat – Karte y 240–2484: Kopf y 243–426, Verlauf bis y≈2163, Eingabe „Nachricht schreiben“ y 2192–2318.
 */
import React from "react";
import { type AvatarTone, C, CONTENT_W, CSS_H, HEADER_H, PAGE_PAD, R, SHADOW, TEXT, W, withAlpha } from "./tokens";
import { Icon, type IconName } from "./icons";
import { Avatar, Button, Checkbox, PageTitle, X3 } from "./primitives";
import { clamp01 } from "./motion";

/** Höhe des Nachrichtenbereichs am Handy: 100dvh − Kopfzeile − 2 rem (CSS-px). */
export const MESSAGES_H = CSS_H - HEADER_H - 2 * PAGE_PAD;

/* ------------------------------------------------------------------ Chatliste */

export type ChatSummary = {
  icon: IconName;
  tone: AvatarTone;
  title: string;
  time: string;
  preview: string;
  unread?: number;
};

export const CHATS: ChatSummary[] = [
  { icon: "users", tone: "emerald", title: "Alle Mitglieder", time: "Gestern", preview: "Bernd: Super Sache! Farbrollen und Abdeckfolie liegen schon im Lager." },
  {
    icon: "heart-handshake",
    tone: "amber",
    title: "Helfer · Sommerfest 2027",
    time: "Montag",
    preview: "Du: Danke an alle, die sich schon eingetragen haben! Treffpunkt und Uhrzeit stehen bei jeder Schicht im Helferplan.",
  },
  {
    icon: "calendar-check",
    tone: "violet",
    title: "Teilnehmer · Sommerfest 2027",
    time: "Sonntag",
    preview: "Du: Schön, dass ihr zugesagt habt! Wer doch nicht kann, sagt bitte kurz ab – dann rückt jemand von der Warteliste nach.",
  },
  {
    icon: "network",
    tone: "sky",
    title: "Abteilung Fußball",
    time: "Freitag",
    preview: "Claudia: Die neuen Trainingsanzüge sind da! Wer noch keinen hat, kann ihn beim nächsten Training anprobieren.",
  },
];

export type ChatListRowProps = ChatSummary & {
  /** 0..1 – Zeile gleitet herein */
  appear?: number;
  /** 0..1 – Zeile hinterlegt (bg-accent, aktiv/getippt) */
  highlight?: number;
  /** 0..1 – Zeile gedrückt */
  pressed?: number;
};

/** Eine Zeile der Chatliste: rundes Bild, Name, Uhrzeit, Vorschau (eine Zeile, „…“). Breite 356 CSS-px. */
export const ChatListRow: React.FC<ChatListRowProps> = ({ icon, tone, title, time, preview, unread = 0, appear = 1, highlight = 0, pressed = 0 }) => {
  const a = clamp01(appear);
  const hl = Math.max(clamp01(highlight), clamp01(pressed));
  return (
    <X3 width={CONTENT_W - 2}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 12px",
          // aktiv bg-accent (Überfahren accent/60)
          background: hl > 0 ? withAlpha(C.accent, hl) : undefined,
          opacity: a,
          transform: a < 1 || pressed > 0 ? `translateX(${(1 - appear) * 30}px) scale(${1 - 0.015 * clamp01(pressed)})` : undefined,
        }}
      >
        <Avatar icon={icon} tone={tone} />
        <span style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", minWidth: 0, flex: 1, gap: 2, borderBottom: `1px solid ${C.border}`, padding: "12px 0" }}>
          <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: W.medium, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
            <span style={{ flexShrink: 0, ...TEXT.xs, color: unread > 0 ? C.green : C.muted, fontWeight: unread > 0 ? W.semibold : W.normal }}>{time}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ ...TEXT.sm, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview}</span>
            {unread > 0 ? (
              <span
                style={{
                  minWidth: 20,
                  flexShrink: 0,
                  boxSizing: "border-box",
                  borderRadius: 999,
                  background: C.unread,
                  padding: "0 6px",
                  textAlign: "center",
                  fontSize: 13,
                  lineHeight: "20px",
                  fontWeight: W.semibold,
                  color: "#fff",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {unread}
              </span>
            ) : null}
          </span>
        </span>
      </div>
    </X3>
  );
};

export type MessagesListPageProps = {
  chats?: ChatSummary[];
  /** Auftritt je Zeile */
  rowAppear?: number[];
  /** Hinterlegung je Zeile (z. B. Tipp auf „Alle Mitglieder“) */
  rowHighlight?: number[];
  /** 0..1 – „Neue Nachricht“ gedrückt */
  newPressed?: number;
  /** Zahl der Entwürfe (0 = Zeile fehlt) */
  drafts?: number;
  headAppear?: number;
};

/** Ganze Seite „Nachrichten“ mit Chatliste (Inhalt unter der Kopfzeile – in AppShell setzen). */
export const MessagesListPage: React.FC<MessagesListPageProps> = ({ chats = CHATS, rowAppear, rowHighlight, newPressed = 0, drafts = 1, headAppear = 1 }) => (
  <X3 width={CONTENT_W} height={MESSAGES_H}>
    <div style={{ display: "flex", flexDirection: "column", height: MESSAGES_H }}>
      <PageTitle
        title="Nachrichten"
        appear={headAppear}
        marginBottom={16}
        description="Mitteilungen und Ankündigungen deines Vereins – ein Chat je Gruppe."
        actions={
          <Button icon="plus" pressed={newPressed}>
            Neue Nachricht
          </Button>
        }
      />
      <div style={{ display: "flex", minHeight: 0, flex: 1, overflow: "hidden", borderRadius: R.xl, border: `1px solid ${C.border}`, background: C.card, boxShadow: SHADOW.sm }}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", minHeight: 0 }}>
          {drafts > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.border}`, padding: "10px 16px", ...TEXT.sm, color: C.muted }}>
              <Icon name="file-pen-line" size={16} />
              Entwürfe
              <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{drafts}</span>
            </div>
          ) : null}
          <div>
            {chats.map((c, i) => (
              <ChatListRow key={c.title} {...c} appear={rowAppear?.[i] ?? 1} highlight={rowHighlight?.[i] ?? 0} />
            ))}
          </div>
        </div>
      </div>
    </div>
  </X3>
);

/* ------------------------------------------------------------------ Chat */

export type BubbleProps = {
  /** eigene Nachricht (rechts, dunkelgrün) oder fremde (links, dunkelgrau) */
  mine?: boolean;
  /** Name über fremden Nachrichten */
  author?: string;
  authorColor?: string;
  /** „ANKÜNDIGUNG“ über der Nachricht */
  announcement?: boolean;
  /** fette Betreffzeile */
  title?: string;
  body: string;
  time: string;
  /** gelesen (darf hochzählen, wird gerundet); undefined = ohne Häkchen */
  read?: number;
  total?: number;
  /** Briefsymbol: auch per E-Mail gesendet */
  email?: boolean;
  /** erste Nachricht einer Folge: Ecke oben spitz */
  firstOfRun?: boolean;
  /** Pfeil „⌄“ oben rechts (darf löschen) */
  menu?: boolean;
  /** 0..1 – Blase ploppt herein (von unten, leicht skaliert) */
  appear?: number;
  /** 0..1 – kurzer Puls der Lesezahl (z. B. beim Hochzählen) */
  readPulse?: number;
  style?: React.CSSProperties;
};

/** Sprechblase wie Bubble in chat-thread.tsx (rounded-lg, px-2.5, text-sm leading-snug, Uhrzeit + Doppelhaken). */
export const Bubble: React.FC<BubbleProps> = ({
  mine = true,
  author,
  // Namensfarbe der App text-emerald-800 dark:text-emerald-300
  authorColor = "#5EE9B5",
  announcement,
  title,
  body,
  time,
  read,
  total = 5,
  email,
  firstOfRun = true,
  menu = true,
  appear = 1,
  readPulse = 0,
  style,
}) => {
  const a = clamp01(appear);
  const r = read === undefined ? undefined : Math.round(read);
  const all = r !== undefined && total > 0 && r >= total;
  return (
    <div
      style={{
        position: "relative",
        maxWidth: "85%",
        boxSizing: "border-box",
        borderRadius: R.lg,
        ...(firstOfRun ? (mine ? { borderTopRightRadius: 0 } : { borderTopLeftRadius: 0 }) : {}),
        padding: `6px ${menu ? 36 : 10}px 4px 10px`,
        fontSize: 15,
        lineHeight: 1.375,
        boxShadow: SHADOW.sm,
        background: mine ? C.chatOwn : C.chatOther,
        color: C.chatFg,
        opacity: a,
        transform: a < 1 ? `translateY(${(1 - appear) * 24}px) scale(${0.92 + 0.08 * appear})` : undefined,
        transformOrigin: mine ? "right bottom" : "left bottom",
        ...style,
      }}
    >
      {author && !mine ? <div style={{ marginBottom: 2, ...TEXT.xs, fontWeight: W.semibold, color: authorColor }}>{author}</div> : null}
      {announcement ? (
        <div style={{ marginBottom: 2, ...TEXT.xs, fontWeight: W.semibold, letterSpacing: "0.025em", color: C.chatMeta, textTransform: "uppercase" }}>Ankündigung</div>
      ) : null}
      {title ? <div style={{ fontWeight: W.semibold }}>{title}</div> : null}
      <div style={{ overflowWrap: "break-word", whiteSpace: "pre-wrap" }}>{body}</div>
      <div style={{ marginTop: 2, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, ...TEXT.xs, color: C.chatMeta }}>
        {email ? <Icon name="mail" size={14} /> : null}
        <span>{time}</span>
        {r !== undefined ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <Icon name="check-check" size={16} color={all ? C.sky700 : "currentColor"} />
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                display: "inline-block",
                transform: readPulse > 0 ? `scale(${1 + 0.25 * clamp01(readPulse)})` : undefined,
                color: readPulse > 0 ? C.chatFg : undefined,
              }}
            >
              {r}/{total}
            </span>
          </span>
        ) : null}
      </div>
      {menu ? (
        <div style={{ position: "absolute", top: 4, right: 4, width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: withAlpha(C.chatFg, 0.7) }}>
          <Icon name="chevron-down" size={16} />
        </div>
      ) : null}
    </div>
  );
};

/** Ankündigung als grüne eigene Blase („ANKÜNDIGUNG“, fetter Titel, Text, Uhrzeit, ✓✓ 4/5). */
export const AnnouncementBubble: React.FC<Omit<BubbleProps, "announcement" | "mine" | "time"> & { time?: string }> = ({ time = "18:30", ...props }) => (
  <X3 width={CONTENT_W - 2 - 24}>
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <Bubble mine announcement total={5} read={4} email time={time} {...props} />
    </div>
  </X3>
);

/** Datumstrenner im Verlauf („Gestern“). */
export const DayChip: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ margin: "8px 0", textAlign: "center" }}>
    <span style={{ borderRadius: R.lg, background: C.chatDay, padding: "4px 10px", ...TEXT.xs, fontWeight: W.medium, color: C.muted, boxShadow: SHADOW.sm }}>{label}</span>
  </div>
);

/** Kopf des geöffneten Chats: ←, grünes Bild, „Alle Mitglieder“, „Erreicht 5 Personen“. */
export const ChatHeader: React.FC<{ title?: string; subtitle?: string; icon?: IconName; tone?: AvatarTone }> = ({
  title = "Alle Mitglieder",
  subtitle = "Erreicht 5 Personen",
  icon = "users",
  tone = "emerald",
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${C.border}`, background: C.card, padding: "10px 12px" }}>
    <div style={{ marginLeft: -4, width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}>
      <Icon name="arrow-left" size={20} />
    </div>
    <Avatar icon={icon} tone={tone} size={40} />
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: W.semibold, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      <div style={{ ...TEXT.xs, color: C.muted, whiteSpace: "nowrap" }}>{subtitle}</div>
    </div>
  </div>
);

/** Eingabe unten: „Nachricht schreiben“, grüner Senden-Knopf, Kästchen „Als Ankündigung“ / „Auch per E-Mail“. */
export const Composer: React.FC<{
  /** getippter Text (leer = Platzhalter, Senden blass) */
  text?: string;
  caret?: boolean;
  /** 0..1 – Senden gedrückt */
  sendPressed?: number;
  /** 0..1 – Häkchen „Als Ankündigung“ */
  announce?: number;
  /** 0..1 – Häkchen „Auch per E-Mail“ */
  email?: number;
}> = ({ text, caret, sendPressed = 0, announce = 0, email = 0 }) => {
  const has = !!text && text.length > 0;
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, background: C.card, padding: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <div
          style={{
            flex: 1,
            minHeight: 40,
            boxSizing: "border-box",
            borderRadius: 24,
            border: `1px solid ${C.field}`,
            background: C.page,
            padding: "8px 16px",
            fontSize: 16,
            lineHeight: "24px",
            color: has ? C.fg : C.muted,
            whiteSpace: "pre-wrap",
          }}
        >
          {has ? text : "Nachricht schreiben"}
          {caret ? <span style={{ display: "inline-block", width: 1.5, height: 20, background: C.fg, marginLeft: 1, verticalAlign: "-4px" }} /> : null}
        </div>
        {/* Button der App: 1 px Rand durchsichtig, Fläche nur im Innenraum (bg-clip-padding → 38 px Kreis), shadow-sm */}
        <div
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
            boxSizing: "border-box",
            border: "1px solid transparent",
            borderRadius: "50%",
            background: C.send,
            backgroundClip: "padding-box",
            boxShadow: SHADOW.sm,
            color: "#fff",
            opacity: has ? 1 : 0.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: sendPressed > 0 ? `scale(${1 - 0.08 * clamp01(sendPressed)})` : undefined,
          }}
        >
          <Icon name="send-horizontal" size={20} />
        </div>
      </div>
      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 4, padding: "0 8px", ...TEXT.xs, color: C.muted }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Checkbox checked={announce} />
          Als Ankündigung
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Checkbox checked={email} />
          Auch per E-Mail
        </span>
        <span style={{ marginLeft: "auto" }}>Mit Betreff schreiben</span>
      </div>
    </div>
  );
};

export type ChatViewProps = {
  /** Lesezahl der Ankündigung „Arbeitseinsatz“ (darf hochzählen) */
  read?: number;
  readPulse?: number;
  /** 0..1 – Ankündigung ploppt herein */
  announcementAppear?: number;
  /** 0..1 – Antwort von Bernd erscheint */
  replyAppear?: number;
  /** Text im Eingabefeld */
  composerText?: string;
  composerCaret?: boolean;
  sendPressed?: number;
  /** Verlauf um diese CSS-px nach unten verschieben (ältere Nachrichten oben, z. B. beim Senden) */
  streamShift?: number;
};

/**
 * Geöffneter Chat „Alle Mitglieder“ (nachrichten.png). Der Verlauf ist unten angeschlagen (wie nach dem Öffnen
 * gescrollt) – oben schneidet die ältere Ankündigung „Willkommen bei VereinsFlow!“ ab.
 */
export const ChatView: React.FC<ChatViewProps> = ({
  read = 4,
  readPulse = 0,
  announcementAppear = 1,
  replyAppear = 1,
  composerText,
  composerCaret,
  sendPressed = 0,
  streamShift = 0,
}) => (
  <X3 width={CONTENT_W} height={MESSAGES_H}>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: MESSAGES_H,
        overflow: "hidden",
        borderRadius: R.xl,
        border: `1px solid ${C.border}`,
        background: C.card,
        boxShadow: SHADOW.sm,
      }}
    >
      <ChatHeader />
      <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", background: C.chatWall }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, transform: streamShift ? `translateY(${streamShift}px)` : undefined }}>
          <div style={{ display: "grid", gap: 4 }}>
            <DayChip label="Dienstag, 29. September 2026" />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Bubble
                mine
                announcement
                title="Willkommen bei VereinsFlow!"
                body={"Liebe Mitglieder,\n\nab sofort organisieren wir Veranstaltungen und Helferschichten mit VereinsFlow. Bitte tragt euch für das Sommerfest in freie Schichten ein.\n\nViele Grüße\nAnna"}
                time="21:08"
                read={5}
                total={5}
              />
            </div>
            <DayChip label="Gestern" />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Bubble
                mine
                announcement
                title="Arbeitseinsatz am Vereinsheim"
                body="Wir streichen den Gastraum und räumen das Lager auf. Wer mit anpackt, trägt sich bitte im Helferplan bei „Malerarbeiten“ ein – für Verpflegung ist gesorgt!"
                time="18:30"
                email
                read={read}
                total={5}
                readPulse={readPulse}
                appear={announcementAppear}
                // 1 px mehr unten: in der Aufnahme rundet diese Blase auf 524 statt 521 Bildpixel
                style={{ paddingBottom: 5 }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 6 }}>
              <Bubble
                mine={false}
                author="Bernd Vogt"
                body="Super Sache! Farbrollen und Abdeckfolie liegen schon im Lager."
                time="19:05"
                read={3}
                total={5}
                appear={replyAppear}
              />
            </div>
          </div>
        </div>
      </div>
      <Composer text={composerText} caret={composerCaret} sendPressed={sendPressed} />
    </div>
  </X3>
);
