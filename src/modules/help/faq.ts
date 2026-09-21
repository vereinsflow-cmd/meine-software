import type { PermissionKey } from "@/server/permissions/catalog";

/**
 * Bedienungsanleitung: die häufigsten Fragen mit Schritt-für-Schritt-Antworten.
 *
 * Die Texte beschreiben die Oberfläche genau so, wie sie beschriftet ist („Zusagen“, „Eintragen“, „Person einladen“ …) – ändert
 * sich eine Beschriftung, muss die Anleitung mit (ein Test prüft, dass die verlinkten Seiten existieren). Abschnitte, die eine
 * Berechtigung voraussetzen (`requires`), sieht nur, wer sie hat: Ein Helfer bekommt keine Anleitung für die Mitgliederverwaltung.
 */
export interface FaqItem {
  /** Eindeutig innerhalb der Anleitung; dient als Anker (#faq-<id>). */
  id: string;
  question: string;
  /** Erklärender Text (Absätze). */
  answer?: string[];
  /** Schritt für Schritt. */
  steps?: string[];
  /** Zusätzlicher Hinweis. */
  tip?: string;
  /** Sprung zur passenden Seite der Anwendung (interner Pfad). */
  link?: { href: string; label: string };
  /** Weitere Suchbegriffe (Alltagswörter, die in der Frage nicht vorkommen). */
  keywords?: string;
}

export interface FaqSection {
  id: string;
  title: string;
  description: string;
  /** Nur sichtbar, wenn der Benutzer diese Berechtigung hat (irgendeine Reichweite). */
  requires?: PermissionKey;
  items: FaqItem[];
}

export const FAQ: readonly FaqSection[] = [
  {
    id: "erste-schritte",
    title: "Erste Schritte",
    description: "Anmelden, Passwort, Profil und Grundbedienung.",
    items: [
      {
        id: "erste-anmeldung",
        question: "Wie melde ich mich zum ersten Mal an?",
        steps: [
          "Öffne den Link in der Einladungs-E-Mail deines Vereins.",
          "Lege dein Passwort fest (mindestens 10 Zeichen – ein längerer Satz ist sicherer als ein kurzes Wort).",
          "Danach meldest du dich immer mit deiner E-Mail-Adresse und diesem Passwort an.",
        ],
        tip: "Ohne Einladung gibt es keinen Zugang. Bitte den Vorstand oder den Vereinsadministrator, dich einzuladen.",
        keywords: "registrieren konto einladung einloggen login",
      },
      {
        id: "passwort-vergessen",
        question: "Ich habe mein Passwort vergessen – was tun?",
        steps: [
          "Klicke auf der Anmeldeseite auf „Passwort vergessen?“.",
          "Gib deine E-Mail-Adresse ein und bestätige.",
          "Öffne den Link in der E-Mail (er gilt 60 Minuten) und lege ein neues Passwort fest.",
        ],
        tip: "Aus Sicherheitsgründen antwortet die Seite immer gleich, auch wenn die Adresse nicht bekannt ist. Kommt nach einigen Minuten keine E-Mail, schau im Spam-Ordner nach oder frage deinen Verein.",
        keywords: "zurücksetzen kennwort einloggen geht nicht",
      },
      {
        id: "passwort-aendern",
        question: "Wie ändere ich mein Passwort?",
        steps: [
          "Öffne im Menü unter „Persönlich“ den Punkt „Mein Profil“.",
          "Gib im Abschnitt „Passwort ändern“ dein aktuelles Passwort und zweimal das neue ein.",
        ],
        tip: "Dabei wirst du auf allen anderen Geräten abgemeldet.",
        link: { href: "/profil", label: "Zu „Mein Profil“" },
        keywords: "kennwort sicherheit",
      },
      {
        id: "profil-aendern",
        question: "Wie ändere ich meinen Namen oder meine E-Mail-Benachrichtigungen?",
        steps: [
          "Öffne „Mein Profil“.",
          "Im Abschnitt „Persönliche Angaben“ änderst du deinen Namen, im Abschnitt „Benachrichtigungen“ schaltest du E-Mails ein oder aus.",
        ],
        tip: "Die E-Mail-Adresse (dein Anmeldename) kannst du nicht selbst ändern. Wende dich dafür an den Vorstand oder Vereinsadministrator.",
        link: { href: "/profil", label: "Zu „Mein Profil“" },
        keywords: "name adresse e-mail mail benachrichtigung ausschalten",
      },
      {
        id: "abmelden",
        question: "Wie melde ich mich ab?",
        steps: ["Klicke oben rechts auf deinen Namen.", "Wähle „Abmelden“."],
        tip: "Nach längerer Inaktivität (Standard: 60 Minuten) wirst du aus Sicherheitsgründen automatisch abgemeldet. Auf einem fremden Gerät solltest du dich immer selbst abmelden.",
        keywords: "ausloggen logout",
      },
      {
        id: "verein-wechseln",
        question: "Ich bin in mehreren Vereinen – wie wechsle ich?",
        steps: [
          "Klicke oben links neben dem Menü auf den Vereinsnamen („Verein wechseln“).",
          "Wähle den Verein aus.",
        ],
        tip: "Dieses Feld erscheint nur, wenn du in mindestens zwei Vereinen Mitglied bist. Jeder Verein zeigt dir ausschließlich seine eigenen Daten.",
        keywords: "mehrere vereine zweiter verein",
      },
      {
        id: "dunkle-darstellung",
        question: "Kann ich die Darstellung ändern (z. B. dunkel)?",
        steps: [
          "Klicke oben rechts auf deinen Namen.",
          "Wähle unter „Darstellung“ zwischen „Hell“, „Dunkel“ und „System“ (folgt der Einstellung deines Geräts).",
        ],
        keywords: "dark mode nachtmodus theme farbe",
      },
      {
        id: "benachrichtigungen",
        question: "Wo sehe ich meine Benachrichtigungen?",
        answer: [
          "Die Glocke oben rechts zeigt, wie viele ungelesene Benachrichtigungen du hast. Dort stehen z. B. neue Schichten, Erinnerungen, Aufgaben und Nachrichten deines Vereins.",
          "Ein Klick auf einen Eintrag führt direkt zur passenden Seite. Auf Wunsch bekommst du sie zusätzlich per E-Mail (einstellbar unter „Mein Profil“).",
        ],
        link: { href: "/benachrichtigungen", label: "Zu den Benachrichtigungen" },
        keywords: "glocke meldung erinnerung",
      },
    ],
  },
  {
    id: "veranstaltungen",
    title: "Veranstaltungen",
    description: "Termine ansehen, zu- und absagen.",
    requires: "events:read",
    items: [
      {
        id: "zusagen",
        question: "Wie sage ich für eine Veranstaltung zu oder ab?",
        steps: [
          "Öffne „Veranstaltungen“ und wähle den Termin.",
          "Klicke auf „Zusagen“ oder „Absagen“.",
        ],
        tip: "Deine Antwort kannst du später ändern. Ist die Veranstaltung ausgebucht, kannst du dich mit „Auf die Warteliste“ vormerken lassen – du rückst automatisch nach, sobald ein Platz frei wird.",
        link: { href: "/veranstaltungen", label: "Zu den Veranstaltungen" },
        keywords: "anmelden teilnehmen anmeldung warteliste ausgebucht",
      },
      {
        id: "termin-finden",
        question: "Wie finde ich einen bestimmten Termin?",
        answer: [
          "Auf der Seite „Veranstaltungen“ gibt es Suche und Filter (z. B. nach Art, Abteilung und Status). Eine Übersicht nach Tagen bietet der „Kalender“.",
        ],
        link: { href: "/kalender", label: "Zum Kalender" },
        keywords: "suchen filter",
      },
    ],
  },
  {
    id: "helferschichten",
    title: "Helferschichten",
    description: "Sich als Helfer eintragen, austragen und Stunden.",
    requires: "shifts:read",
    items: [
      {
        id: "als-helfer-eintragen",
        question: "Wie trage ich mich als Helfer in eine Schicht ein?",
        steps: [
          "Öffne „Helferplanung“ und wähle die Veranstaltung.",
          "Klicke bei der gewünschten Schicht auf „Eintragen“.",
        ],
        tip: "Du siehst sofort eine Bestätigung, und die Schicht erscheint im Dashboard unter „Meine Einsätze“. Vor der Schicht bekommst du eine Erinnerung.",
        link: { href: "/helferplanung", label: "Zur Helferplanung" },
        keywords: "helfen einsatz schicht anmelden",
      },
      {
        id: "eintragen-nicht-moeglich",
        question: "Warum kann ich mich nicht in eine Schicht eintragen?",
        answer: ["Unter der Schicht steht der Grund. Häufig ist es einer dieser:"],
        steps: [
          "Die Schicht ist bereits voll besetzt.",
          "Die Anmeldung ist geschlossen – dann teilt der Veranstalter die Helfer selbst zu.",
          "Du bist zur selben Zeit schon in einer anderen Schicht eingetragen (Doppelbelegung ist ausgeschlossen).",
          "Für die Schicht gilt ein Mindestalter, das noch nicht erreicht ist.",
          "Die Schicht hat bereits begonnen oder ist abgesagt.",
        ],
        keywords: "geht nicht gesperrt grau voll ausgebucht mindestalter",
      },
      {
        id: "aus-schicht-austragen",
        question: "Wie trage ich mich wieder aus einer Schicht aus?",
        steps: ["Öffne die Schicht in der Helferplanung.", "Klicke auf „Austragen“."],
        tip: "Nach Beginn der Schicht ist das nicht mehr möglich – wende dich dann an die verantwortliche Person, die in der Schicht steht.",
        keywords: "abmelden absagen krank verhindert",
      },
      {
        id: "meine-stunden",
        question: "Wo sehe ich meine Einsätze und geleisteten Stunden?",
        answer: [
          "Auf dem Dashboard zeigt „Meine Einsätze“ deine nächsten Schichten und „Meine Helferstunden“ die Stunden des laufenden Jahres. Die tatsächlich geleistete Zeit trägt nach dem Einsatz die verantwortliche Person ein.",
        ],
        link: { href: "/dashboard", label: "Zum Dashboard" },
        keywords: "arbeitsstunden nachweis stundenzettel",
      },
    ],
  },
  {
    id: "kalender",
    title: "Kalender",
    description: "Ansichten, Filter und der eigene Kalender im Handy.",
    requires: "events:read",
    items: [
      {
        id: "kalender-ansichten",
        question: "Wie wechsle ich zwischen Monat, Woche, Tag und Liste?",
        answer: [
          "Im „Kalender“ wählst du oben die Ansicht. „Heute“ springt zum aktuellen Tag. Mit den Filtern grenzt du Art und Abteilung ein; „Nur meine Termine“ zeigt deine Zusagen und Helferschichten.",
        ],
        link: { href: "/kalender", label: "Zum Kalender" },
      },
      {
        id: "kalender-abo",
        question: "Wie bekomme ich die Termine in den Kalender auf meinem Handy oder in Outlook?",
        steps: [
          "Öffne den „Kalender“ und klicke auf „Abonnieren“.",
          "Kopiere den persönlichen Link.",
          "Füge ihn in deiner Kalender-App als Abonnement (Internetkalender) hinzu.",
        ],
        tip: "Der Link ist persönlich und geheim – gib ihn nicht weiter. Im selben Dialog kannst du ihn erneuern oder widerrufen. Einen einzelnen Termin lädst du auf der Veranstaltungsseite mit „Zum Kalender hinzufügen (.ics)“.",
        link: { href: "/kalender", label: "Zum Kalender" },
        keywords: "ical ics google apple outlook synchronisieren smartphone abonnement",
      },
    ],
  },
  {
    id: "aufgaben",
    title: "Aufgaben",
    description: "Eigene Aufgaben ansehen und abhaken.",
    requires: "tasks:read",
    items: [
      {
        id: "aufgaben-erledigen",
        question: "Wo sehe ich meine Aufgaben und wie melde ich Erledigtes?",
        answer: [
          "Unter „Aufgaben“ stehen deine Aufgaben mit Frist und Priorität. Den Status änderst du direkt in der Zeile, z. B. auf „In Bearbeitung“ oder „Erledigt“. Erledigtes ist über die Ansicht weiterhin erreichbar.",
        ],
        link: { href: "/aufgaben", label: "Zu den Aufgaben" },
        keywords: "to-do checkliste fällig frist",
      },
    ],
  },
  {
    id: "nachrichten",
    title: "Nachrichten",
    description: "Mitteilungen und Ankündigungen deines Vereins lesen.",
    requires: "messages:read",
    items: [
      {
        id: "nachrichten-lesen",
        question: "Wo lese ich Nachrichten meines Vereins?",
        answer: [
          "Unter „Nachrichten“ im Posteingang. Ungelesenes ist markiert und wird beim Öffnen als gelesen vermerkt. Ankündigungen bekommst du zusätzlich als Benachrichtigung.",
        ],
        link: { href: "/nachrichten", label: "Zu den Nachrichten" },
        keywords: "mitteilung ankündigung rundmail posteingang",
      },
    ],
  },
  {
    id: "dokumente",
    title: "Dokumente",
    description: "Satzung, Formulare und weitere Unterlagen.",
    requires: "documents:read",
    items: [
      {
        id: "dokument-herunterladen",
        question: "Wie lade ich ein Dokument herunter?",
        answer: [
          "Öffne „Dokumente“ und klicke auf den Namen des Dokuments. Mit der Suche und dem Kategorie-Filter findest du es schneller. Du siehst nur Dokumente, für die du freigegeben bist.",
        ],
        link: { href: "/dokumente", label: "Zu den Dokumenten" },
        keywords: "pdf satzung formular datei download",
      },
    ],
  },
  {
    id: "datenschutz",
    title: "Datenschutz und Konto",
    description: "Deine Daten, Einwilligungen und das Löschen deines Kontos.",
    items: [
      {
        id: "daten-herunterladen",
        question: "Welche Daten sind über mich gespeichert – kann ich sie herunterladen?",
        steps: [
          "Öffne im Menü unter „Persönlich“ den Punkt „Datenschutz“.",
          "Klicke im Abschnitt „Meine Daten herunterladen“ auf „Daten herunterladen (JSON)“.",
        ],
        tip: "Du bekommst eine Datei mit allen Angaben, die zu dir gespeichert sind (Auskunft und Datenübertragbarkeit).",
        link: { href: "/datenschutz", label: "Zu „Datenschutz“" },
        keywords: "auskunft dsgvo export",
      },
      {
        id: "einwilligungen",
        question: "Wie ändere ich meine Einwilligungen (z. B. Newsletter oder Fotos)?",
        answer: [
          "Unter „Datenschutz“ findest du deine Einwilligungen. Freiwillige – etwa Newsletter und Fotoveröffentlichung – kannst du dort jederzeit erteilen oder widerrufen.",
        ],
        link: { href: "/datenschutz", label: "Zu „Datenschutz“" },
        keywords: "widerrufen foto newsletter zustimmung",
      },
      {
        id: "konto-loeschen",
        question: "Wie lösche ich mein Konto?",
        steps: [
          "Öffne „Datenschutz“ und klicke auf „Konto löschen …“.",
          "Bestätige mit deinem Passwort („Löschung beantragen“).",
        ],
        tip: "Nach einer Bedenkzeit von 14 Tagen werden dein Konto gelöscht und deine Mitgliedsdaten anonymisiert. Bis dahin kannst du den Antrag mit „Antrag zurückziehen“ stoppen. Wer als letzter Administrator eines Vereins eingetragen ist, muss die Verantwortung vorher übergeben.",
        link: { href: "/datenschutz", label: "Zu „Datenschutz“" },
        keywords: "austreten abmelden entfernen daten löschen",
      },
    ],
  },
  {
    id: "melden",
    title: "Hilfe und Fehler melden",
    description: "Wenn etwas nicht funktioniert oder du nicht weiterkommst.",
    items: [
      {
        id: "problem-melden",
        question: "Etwas funktioniert nicht oder ich komme nicht weiter – was tun?",
        steps: [
          "Klicke oben auf dieser Seite auf „Problem melden“.",
          "Wähle die Art (Fehler, Frage oder Vorschlag), gib eine kurze Überschrift an und beschreibe, was passiert ist.",
          "Klicke auf „Meldung senden“ – die Vereinsverwaltung wird benachrichtigt.",
        ],
        tip: "Beschreibe möglichst genau, was du getan hast und was du erwartet hast. Die Antwort erscheint hier unter „Meine Meldungen“ – und du bekommst eine Benachrichtigung.",
        keywords: "fehler bug support hilfe kontakt problem",
      },
    ],
  },
  {
    id: "verwaltung-mitglieder",
    title: "Für Vorstand: Mitglieder",
    description: "Mitglieder anlegen, importieren und verwalten.",
    requires: "members:create",
    items: [
      {
        id: "mitglied-anlegen",
        question: "Wie lege ich ein neues Mitglied an?",
        steps: [
          "Öffne „Mitglieder“ und klicke auf „Neues Mitglied“.",
          "Fülle die Pflichtfelder aus und speichere.",
        ],
        tip: "Ein angelegtes Mitglied hat noch keinen Zugang zur Anwendung. Dafür lädst du die Person unter „Benutzer und Rollen“ ein.",
        link: { href: "/mitglieder", label: "Zu den Mitgliedern" },
        keywords: "neu eintrag erfassen aufnehmen",
      },
      {
        id: "mitglieder-import",
        question: "Wie importiere ich viele Mitglieder auf einmal (z. B. aus Excel)?",
        steps: [
          "Speichere deine Tabelle als CSV-Datei.",
          "Öffne „Mitglieder“ und klicke auf „Import“. Über „Vorlage herunterladen“ bekommst du eine Beispieldatei mit den richtigen Spalten.",
          "Lade die Datei hoch. Du siehst zuerst eine Vorschau – erst danach wird etwas gespeichert.",
        ],
        link: { href: "/mitglieder/import", label: "Zum Import" },
        keywords: "csv excel tabelle liste hochladen übernehmen",
      },
      {
        id: "mitglied-austritt",
        question: "Was passiert, wenn ein Mitglied austritt oder gelöscht wird?",
        answer: [
          "Auf der Mitgliederseite kannst du ein Mitglied archivieren (es bleibt für Auswertungen erhalten) oder löschen (Papierkorb, wiederherstellbar).",
          "Aus dem Papierkorb werden Datensätze nach der eingestellten Frist (Standard 30 Tage) endgültig anonymisiert; Daten ausgetretener Mitglieder nach der dort festgelegten Frist (Standard 24 Monate). Beides stellst du unter „Vereinseinstellungen“ ein.",
        ],
        keywords: "archivieren papierkorb kündigen austritt anonymisieren",
      },
    ],
  },
  {
    id: "verwaltung-benutzer",
    title: "Für Verwaltung: Benutzer und Rollen",
    description: "Personen einladen und Rechte verstehen.",
    requires: "users:invite",
    items: [
      {
        id: "person-einladen",
        question: "Wie lade ich eine Person ein?",
        steps: [
          "Öffne „Benutzer und Rollen“ und klicke auf „Person einladen“.",
          "Gib die E-Mail-Adresse an und wähle die Rolle.",
          "Klicke auf „Einladung senden“.",
        ],
        tip: "Die Person bekommt einen Link, legt ein Passwort fest und ist danach im Verein. Nicht angenommene Einladungen kannst du in derselben Liste erneut senden oder zurückziehen.",
        link: { href: "/benutzer", label: "Zu „Benutzer und Rollen“" },
        keywords: "zugang konto anlegen einladung",
      },
      {
        id: "rollen",
        question: "Welche Rollen gibt es und was dürfen sie?",
        answer: [
          "Vereinsadministrator: alles im Verein. Vorstandsmitglied: Mitglieder, Veranstaltungen, Helferplanung, Aufgaben, Nachrichten und Dokumente. Abteilungsleiter: dasselbe, aber nur für die eigene Abteilung. Helfer und Mitglied: Veranstaltungen ansehen, zu- und absagen, sich in Schichten eintragen, Nachrichten lesen.",
          "Die Rolle jeder Person steht unter „Benutzer und Rollen“. Der letzte Vereinsadministrator kann nicht entfernt oder herabgestuft werden.",
        ],
        keywords: "rechte berechtigung zugriff admin vorstand",
      },
    ],
  },
  {
    id: "verwaltung-veranstaltungen",
    title: "Für Vorstand: Veranstaltungen",
    description: "Veranstaltungen anlegen und veröffentlichen.",
    requires: "events:create",
    items: [
      {
        id: "veranstaltung-anlegen",
        question: "Wie lege ich eine Veranstaltung an und veröffentliche sie?",
        steps: [
          "Öffne „Veranstaltungen“ und klicke auf „Neue Veranstaltung“.",
          "Trage Titel, Zeit, Ort und – falls nötig – Teilnehmerlimit ein und speichere. Die Veranstaltung ist zunächst ein Entwurf, den nur Berechtigte sehen.",
          "Öffne sie und klicke auf „Veröffentlichen“. Dann sehen sie alle Mitglieder und werden benachrichtigt.",
        ],
        tip: "Mit „Duplizieren“ legst du regelmäßige Termine schnell neu an. Änderungen an veröffentlichten Terminen benachrichtigen Teilnehmer und Helfer automatisch.",
        link: { href: "/veranstaltungen/neu", label: "Neue Veranstaltung" },
        keywords: "termin erstellen event planen absagen kopieren serie",
      },
    ],
  },
  {
    id: "verwaltung-schichten",
    title: "Für Vorstand: Helferplanung",
    description: "Schichten planen, Helfer zuweisen, Stunden erfassen.",
    requires: "shifts:manage",
    items: [
      {
        id: "schichten-planen",
        question: "Wie plane ich Helferschichten?",
        steps: [
          "Öffne „Helferplanung“, wähle die Veranstaltung und klicke auf „Neue Schicht“.",
          "Gib Bezeichnung, Datum, Beginn, Ende und die Zahl der benötigten Helfer an (optional Mindestalter, Treffpunkt, Verantwortliche).",
          "Klicke auf „Schicht anlegen“.",
        ],
        tip: "Endet die Schicht nach Mitternacht, wähle eine Endzeit vor dem Beginn (z. B. 22:00 – 02:00 Uhr). Überbuchung und Doppelbelegung schließt das System aus – auch wenn sich mehrere gleichzeitig eintragen. Farben und Hinweise zeigen, wo noch Helfer fehlen.",
        link: { href: "/helferplanung", label: "Zur Helferplanung" },
        keywords: "schicht einteilen dienstplan helferplan erstellen",
      },
      {
        id: "helfer-zuweisen",
        question: "Wie weise ich einen Helfer selbst zu?",
        steps: [
          "Klicke bei der Schicht auf „Zuweisen“.",
          "Suche die Person und wähle sie aus. Nicht wählbare Personen sind mit dem Grund gekennzeichnet (z. B. Überschneidung oder Mindestalter).",
          "Bestätige mit „… zuweisen“. Die Person wird benachrichtigt.",
        ],
        keywords: "einteilen eintragen manuell zuteilen",
      },
      {
        id: "stunden-erfassen",
        question: "Wie erfasse ich die geleisteten Stunden und drucke den Plan?",
        steps: [
          "Nach Beginn der Schicht erscheint bei jedem Helfer die Schaltfläche „Stunden“.",
          "Trage die tatsächlich geleistete Zeit ein (z. B. 2,5) und speichere.",
        ],
        tip: "Der Helferplan lässt sich mit „Drucken“ ausdrucken und mit „CSV-Export“ in eine Tabelle übernehmen. Die Auswertung aller Stunden erreichst du über „Helferstunden“ oben auf der Seite Helferplanung.",
        keywords: "arbeitsstunden nachweis auswertung export drucken csv",
      },
    ],
  },
  {
    id: "verwaltung-nachrichten",
    title: "Für Vorstand: Nachrichten und Dokumente",
    description: "Mitteilungen senden und Unterlagen bereitstellen.",
    requires: "messages:send",
    items: [
      {
        id: "nachricht-senden",
        question: "Wie sende ich eine Nachricht an alle oder eine Gruppe?",
        steps: [
          "Öffne „Nachrichten“ und klicke auf „Neue Nachricht“.",
          "Wähle unter „An wen?“ die Zielgruppe (z. B. alle Mitglieder, eine Abteilung oder die Helfer einer Veranstaltung).",
          "Schreibe Betreff und Text und klicke auf „Jetzt senden …“, dann bestätige die Sicherheitsabfrage.",
        ],
        tip: "Vorher siehst du, wie viele Personen die Nachricht erreicht. Eine gesendete Nachricht lässt sich nicht mehr ändern, aber zurückrufen. Mit „Als Entwurf speichern“ machst du später weiter. Der Text ist reiner Text – Formatierungen werden nicht dargestellt.",
        link: { href: "/nachrichten/neu", label: "Neue Nachricht" },
        keywords: "rundmail ankündigung mitteilung schreiben email versenden",
      },
      {
        id: "dokument-hochladen",
        question: "Wie stelle ich ein Dokument bereit?",
        steps: [
          "Öffne „Dokumente“ und klicke auf „Dokument hochladen“.",
          "Wähle die Datei, ggf. eine Kategorie, und lege fest, wer das Dokument sehen darf.",
          "Klicke auf „Hochladen“.",
        ],
        tip: "Erlaubt sind PDF, Bilder, Word-, Excel- und PowerPoint-Dateien, OpenDocument, TXT und CSV bis zur eingestellten Größe (Standard 10 MB). Ausführbare Dateien werden abgelehnt. Abteilungsleiter laden Dokumente zu einer Veranstaltung ihrer Abteilung hoch.",
        link: { href: "/dokumente", label: "Zu den Dokumenten" },
        keywords: "upload datei pdf satzung freigeben zugriff",
      },
    ],
  },
  {
    id: "verwaltung-verein",
    title: "Für Verwaltung: Verein und Protokoll",
    description: "Einstellungen, Ansprechpartner und Änderungsprotokoll.",
    requires: "club:update",
    items: [
      {
        id: "einstellungen",
        question: "Wo ändere ich Vereinsdaten und Aufbewahrungsfristen?",
        answer: [
          "Unter „Vereinseinstellungen“ pflegst du Name, Kontaktdaten, den Datenschutz-Ansprechpartner und die Aufbewahrungsfristen (Papierkorb, Ausgetretene, Änderungsprotokoll).",
        ],
        link: { href: "/einstellungen", label: "Zu den Vereinseinstellungen" },
        keywords: "verein name adresse frist datenschutz löschen",
      },
      {
        id: "ansprechpartner-pflegen",
        question: "Wie pflege ich die Ansprechpartner dieser Hilfeseite?",
        steps: [
          "Öffne „Hilfe & Support“ und klicke im Bereich „Ansprechpartner“ auf „Ansprechpartner bearbeiten“.",
          "Trage Name, Zuständigkeit sowie E-Mail-Adresse oder Telefonnummer ein und speichere.",
        ],
        tip: "Alle Mitglieder deines Vereins sehen diese Angaben. Trage deshalb nur Kontaktdaten ein, die veröffentlicht werden dürfen (z. B. Vereinsadresse statt privater Handynummer).",
        keywords: "kontakt hilfe support zuständig",
      },
      {
        id: "meldungen-bearbeiten",
        question: "Wie bearbeite ich Meldungen aus dem Verein?",
        steps: [
          "Öffne „Hilfe & Support“ und klicke auf „Eingegangene Meldungen“ (oder folge der Benachrichtigung).",
          "Öffne eine Meldung, setze den Status („Neu“, „In Bearbeitung“, „Erledigt“) und schreibe bei Bedarf eine Antwort.",
        ],
        tip: "Die meldende Person sieht deine Antwort unter „Meine Meldungen“ und wird benachrichtigt. Erledigte Meldungen werden nach 12 Monaten automatisch gelöscht.",
        link: { href: "/hilfe/meldungen", label: "Zu den Meldungen" },
        keywords: "support ticket fehler bearbeiten antworten",
      },
      {
        id: "aenderungsprotokoll",
        question: "Wo sehe ich, wer was geändert hat?",
        answer: [
          "Das „Änderungsprotokoll“ (Menü „Verwaltung“) zeigt Anmeldungen, Änderungen an Mitgliedern, Veranstaltungen, Schichten und mehr – filterbar nach Bereich, Person, Zeitraum und Text. Einträge lassen sich nicht nachträglich verändern; sensible Angaben stehen dort nur als „geändert“.",
        ],
        keywords: "log verlauf historie nachvollziehen",
      },
    ],
  },
];

/** Die Abschnitte, die für den Benutzer passen (nach Berechtigung), ohne leere. */
export function visibleFaq(can: (key: PermissionKey) => boolean): FaqSection[] {
  return FAQ.filter((section) => !section.requires || can(section.requires));
}
