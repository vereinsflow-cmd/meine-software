import {
  BellIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ChartNoAxesCombinedIcon,
  CircleUserIcon,
  ClockIcon,
  FolderOpenIcon,
  HeartHandshakeIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  ListChecksIcon,
  MessageSquareTextIcon,
  MonitorCogIcon,
  NetworkIcon,
  RotateCcwClockIcon,
  SettingsIcon,
  ShieldUserIcon,
  UserCogIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Ein Bereich, ein Symbol: Jeder Bereich der Anwendung hat genau ein Symbol – in der Seitenleiste, in der Suche (Strg/⌘+K),
 * auf dem Dashboard (Kennzahlen, Karten, Reiter), bei leeren Listen und auf Knöpfen, die in den Bereich führen. So lernt man
 * ein Symbol einmal und erkennt es überall wieder. Neue Seiten nehmen ihr Symbol von hier, statt ein eigenes zu wählen.
 *
 * Zwei Bereiche teilen sich nie ein Symbol, und die Symbole unterscheiden sich schon auf einen Blick – auch Kalender und
 * Veranstaltungen (Monatsblatt mit Tagen bzw. Kalenderblatt mit Haken). Warum welches Symbol: docs/DESIGN.md, „Symbole“.
 */
export const AREA_ICON = {
  dashboard: LayoutDashboardIcon,
  mitglieder: UsersIcon,
  kalender: CalendarDaysIcon,
  veranstaltungen: CalendarCheckIcon,
  helferplanung: HeartHandshakeIcon,
  /** „Meine Einsätze“: die eigenen Helferschichten (Helferplanung und Dashboard). */
  einsaetze: CalendarClockIcon,
  helferstunden: ClockIcon,
  abteilungen: NetworkIcon,
  aufgaben: ListChecksIcon,
  dokumente: FolderOpenIcon,
  nachrichten: MessageSquareTextIcon,
  benachrichtigungen: BellIcon,
  benutzer: UserCogIcon,
  einstellungen: SettingsIcon,
  finanzen: WalletIcon,
  protokoll: RotateCcwClockIcon,
  auswertungen: ChartNoAxesCombinedIcon,
  system: MonitorCogIcon,
  profil: CircleUserIcon,
  datenschutz: ShieldUserIcon,
  hilfe: LifeBuoyIcon,
} as const satisfies Record<string, LucideIcon>;

export type Area = keyof typeof AREA_ICON;
