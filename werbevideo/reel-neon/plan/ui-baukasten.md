# UI-Baukasten (src/ui) – Maßstab, Positionen, API

**Maßstab – wichtig für alle, die den Baukasten nutzen:** Die Bausteine setzen ihre Maße in CSS-px der App (text-sm 15, rounded-lg 10, p-4 16) und werden mit `scale(3)` in den Bildraum gebracht.
- Grund: Mit echten ×3-Größen (45 px) wählt SF Pro eine andere Laufweite. „233 Einträge“ war dann 260 statt 273 px breit, skaliert 275 px.
- Nach außen gilt der vereinbarte Bildraum: 1170 breit, y=0 ist die Oberkante der Kopfzeile; `scrollY` und alle Positionen sind Bildpixel.
- `X3` (in `primitives.tsx`) skaliert nur einmal: Exportierte Bausteine funktionieren allein im Bildraum und auch innerhalb von `AppShell`.
- Schlichte Grundbausteine (`Button`, `Badge`, `Card` …) sind 1×; allein verwendet müssen sie in `<X3>` gesetzt werden.


**Positionen im Bildraum** (scrollY 0, sonst angegeben):
- **Kopfzeile:** y 0–192 inkl. 3 px Unterkante; der Seiteninhalt beginnt bei y 240, Inhaltsbreite x 48–1122.
- **Mitglieder:**
  - „233 Einträge“ y≈375; Knopfreihe 1 y 474–582 („Neues Mitglied“ x 48–531); „Import“ x 48–349, y 606–714.
  - Tabelle: Kopf y 954–1076, Zeile 1 1077–1328, Zeile 2 1329–1583, danach je 123 hoch ab 1584.
- **Termin:** Karte „Deine Teilnahme“ y 873–1419; Statuszeile y≈1151; „Zusagen“ x 108–456, y 1252–1358; „Absagen“ x 480–827.
- **Schichten (scrollY 1821):** Getränkestand y 228–893, Grillstand 894–1559, Kuchenbuffet 1559–2224. „Eintragen“ x 678–957, jeweils ab Zeilenoberkante +33 bis +165.
- **Nachrichten:** Chatzeilen ab y 833, je 218 hoch, Text ab x 255.
- **Chat:** Ankündigung x 236–1083, y 1237–1759; „4/5“ bei x 915, y 1693; Eingabe y 2192–2318.
- **Finanzen:** Reiter y 666–798; Karten y 870–1494, 1542–2034 und 2082–2778.
- **Dashboard:** Mitglieder-Karte x 48–886, y 1050–1985.


## Komponenten-API
Animationswerte sind 0..1, wenn nicht anders genannt. Der Bildraum ist 1170 breit, y = 0 ist die Oberkante der Kopfzeile. Die Bausteine rechnen intern in CSS-px; die Seiten setzt man in `AppShell`. Einzelbausteine stehen allein im Bildraum (×3 über `X3`); schlichte Grundbausteine wie `Button`, `Badge`, `Card` muss man dafür in `<X3 width={…}>` setzen.

**`AppShell.tsx`**
- `AppShell {children, scrollY (Bildpixel), height=2532, flush, background, hideHeader, style}` plus alle Eigenschaften der Kopfzeile.
- `AppHeader {clubName, clubInitials, userInitials, bellCount, bellPop, headerAppear, surface, glass}`
- `CONTENT_TOP = 240`

**`primitives.tsx`**
- `X3 {width, height?, style}`, `ScaledScope`, `ROOT_STYLE`, `text(size, weight)`
- `Button {variant: default|outline|ghost|link|success, size: default|sm|lg|icon|icon-sm, icon, iconSize, pressed, block, textColor, style}`
- `Badge {tone: green|blue|gray|orange|red|outline, icon, appear, style}`
- `Card {frame: ring|border|border-sm, size: default|sm|none}`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `PageTitle {title, description, actions, marginBottom, appear, titleStyle, descriptionStyle}`, `BackLink`
- `SearchField {placeholder, value, caret, focus, cancelSpace}`
- `Tabs {items (string | {label, count}), activeIndex (Kommazahl gleitet), size: lg|md, width, scrollX}`
- `ProgressBar {fill, tone: auto|full|partial|empty|primary, height}`
- `Avatar {icon|initials, tone, bg, fg, size, iconSize}`, `Checkbox {checked, size}`

**`members.tsx`**
- `MembersPage {count, members, rowAppear[], rowHighlight[], importPressed, newPressed, search, headAppear}`
- `MemberTable {members, rowAppear[], rowHighlight[]}`, `MemberRow {…Member, appear, highlight, last}`, `MEMBERS`
- `ImportFileChip {name, sub, appear, check}`, `ImportStepCard {fileName, pressed, fileAppear}`, `ImportSummary {valid, dupes, errors, appear}`
- **neu:** `ImportPreviewTable {rows, rowAppear[], rowHighlight[], scrollX}`, `IMPORT_ROWS`
- `ImportPage {fileAppear, pressed, summaryAppear, rowAppear[], rowHighlight[], importPressed}` (die letzten drei sind neu)

**`events.tsx`**
- `EventDetailPage {title, date, rsvp, rsvpPressed, headAppear, cardAppear}`
- `RsvpCard {progress, pressed, title, description}`, `EventDetailsCard`
- `CalendarEntryRow {…CalendarEntry, appear, highlight, pressed}`, `CalendarDayItem {date, entries, entryAppear[], entryHighlight[], entryPressed[]}`
- `CalendarAgenda {days, dayAppear[]}`, `CALENDAR_DAYS` (jetzt mit Dienstag), `CALENDAR_THURSDAY`

**`shifts.tsx`**
- `ShiftsPage {shifts, overrides[] (je Schicht), headAppear}`
- `ShiftCard {…Shift, filled, me, meAppear, pressed, highlight, signedUp, appear, divider, note}`
- `OpenShiftItem {title, sub, filled, capacity, fill, pressed, showButton}`, `ShiftTotalsBar {filled, required, width}`
- `staffing()`, `SHIFTS`, `OVERLAP_NOTE`

**`messages.tsx`**
- `MessagesListPage {chats, rowAppear[], rowHighlight[], newPressed, drafts, headAppear}`, `ChatListRow {…ChatSummary, appear, highlight, pressed}`, `CHATS`
- `ChatView {read, readPulse, announcementAppear, replyAppear, composerText, composerCaret, sendPressed, streamShift}`
- `Bubble {mine, author, authorColor, announcement, title, body, time, read, total, email, firstOfRun, menu, appear, readPulse, style}`, `AnnouncementBubble`
- `ChatHeader {title, subtitle, icon, tone}`, `Composer {text, caret, sendPressed, announce, email}`, `DayChip {label}`, `MESSAGES_H`

**`finance.tsx`**
- `FinancePage {balance, invoices, surplus, balanceDraw, surplusDraw, cardAppear[], cardLift[], tab, addPressed, headAppear}`
- `StatCard {label, accent, icon, value, signed, lines, points, draw, width, appear, lift}`, `KontostandCard`, `OffeneRechnungenCard`, `UeberschussCard`
- `FinanceHeader {description, button, buttonIcon, tab, addPressed, headAppear}`
- `LedgerTable {entries, total, rowAppear[], rowHighlight[]}`, `LedgerRow`
- `LEDGER`, `FINANCE_TABS`, `BALANCE_POINTS`, `SURPLUS_POINTS`

**`kpi.tsx`**
- `KpiShell {label, accent, icon, arrow, width, padBottom, extra, lift}`, `KpiValue {fontSize}`
- `Sparkline {points, width, height, draw, ink}`

**`dashboard.tsx`**
- `Greeting {name, role, appear, actions, newMemberPressed}`, `DashboardTabs {active}`
- `MembersKpiCard {value, change, percent, vsLastMonth, points, draw, chipAppear, showCompare, width, height, appear, lift}`
- **neu:**
  - `QuoteKpiCard {label, accent, icon, value (Text), direction, amount, percent, since, compare {text, tone}, points, periods, activePeriod, range, draw, chipAppear, width, height, appear, lift}`
  - `EventsKpiCard {value, nextInDays, …}`
  - `KpiCarousel {children, scrollX (CSS-px, eine Karte weiter = KPI_CARD_W + 12), dots}`, `KpiDots {count, active (Kommazahl)}`
  - `GroupHeading {title, appear}`, `TasksWidget {tasks, description, rowAppear[], appear}`, `TASKS`
  - `KPI_CARD_W`, `KPI_CARD_H`, `EVENT_POINTS`
- `DashboardTop {greetingAppear, carouselX, eventsValue, eventsDraw, forYouAppear, …MembersKpiCard-Eigenschaften}`

**Hilfsdateien**
- `icons.tsx`: `<Icon name size color strokeWidth draw fill>` mit 49 Symbolen (neu: `list-checks`, `arrow-right`).
- `motion.ts`: `appear`, `pop`, `snap`, `stagger`, `press`, `countUp`, `progress`, `easeOut`, `easeInOut`, `formatDE`, `formatEuro`, `riseIn`, `slideIn`, `pressScale`, `clamp01`, `mix`.
- `tokens.ts`: `C`, `TEXT`, `R`, `SHADOW`, `KPI_GRADIENT`, `AVATAR_TONE`, `FONT`, `NBSP`, `SCREEN_W/H`, `CONTENT_W`, `toScreen`/`toCss`.
- `measure.ts`: `textWidth`.


Showcase/reference stills already registered (folder "UI-Baukasten"): Ui-Mitglieder, Ui-Termin, Ui-Kalender, Ui-Schichten, Ui-Nachrichten, Ui-Chat, Ui-Finanzen, Ui-Kassenbuch, Ui-Dashboard, Ui-Import, Ui-Animationstest, and the 360-frame composition Ui-Demo (src/ui/Demo.tsx shows how every animation prop is driven — read it).
