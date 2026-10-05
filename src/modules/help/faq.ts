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
  /**
   * Nur mit Reichweite „ganzer Verein“ für `requires` – z. B. Beitrittsanträge: Die entscheiden Vereinsadministrator und
   * Vorstand, nicht die Abteilungsleitung (die Mitglieder nur für ihre Abteilung anlegen darf).
   */
  clubWide?: boolean;
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
          "Öffne „Helferplanung“. Unter jeder Veranstaltung stehen die Schichten mit freien Plätzen.",
          "Klicke bei der gewünschten Schicht auf „Eintragen“ – dort oder im Helferplan der Veranstaltung.",
        ],
        tip: "Du siehst sofort eine Bestätigung, und die Schicht erscheint unter „Meine Einsätze“ (in der Helferplanung und auf dem Dashboard). Vor der Schicht bekommst du eine Erinnerung.",
        link: { href: "/helferplanung", label: "Zur Helferplanung" },
        keywords: "helfen einsatz schicht anmelden",
      },
      {
        id: "eintragen-nicht-moeglich",
        question: "Warum kann ich mich nicht in eine Schicht eintragen?",
        answer: ["Bei der Schicht steht der Grund. Häufig ist es einer dieser:"],
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
        steps: [
          "Öffne „Helferplanung“ – unter „Meine Einsätze“ stehen deine Schichten.",
          "Klicke bei der Schicht auf „Austragen“.",
        ],
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
          "Unter „Aufgaben“ stehen deine Aufgaben, geordnet nach Frist: überfällig, in den nächsten 7 Tagen, später und ohne Datum. Oben wählst du, welche du sehen willst – z. B. „Mir zugewiesen“, „Überfällig“ oder „Erledigt“.",
          "Erledigtes hakst du mit dem Kästchen vor der Aufgabe ab; ein Klick auf „Rückgängig“ in der Meldung macht es rückgängig. Andere Status wie „In Bearbeitung“ oder „Blockiert“ findest du hinter den drei Punkten (⋯) an der Aufgabe.",
        ],
        link: { href: "/aufgaben", label: "Zu den Aufgaben" },
        keywords: "to-do checkliste fällig frist abhaken erledigt status überfällig",
      },
    ],
  },
  {
    id: "nachrichten",
    title: "Nachrichten",
    description: "Mitteilungen deines Vereins lesen und selbst schreiben.",
    requires: "messages:read",
    items: [
      {
        id: "nachrichten-lesen",
        question: "Wo lese ich Nachrichten meines Vereins?",
        answer: [
          "Unter „Nachrichten“ – aufgebaut wie WhatsApp: Jede Gruppe hat ihren eigenen Chat (alle Mitglieder, deine Abteilung, die Helfer oder Teilnehmer einer Veranstaltung). Die grüne Zahl zeigt, wie viele Nachrichten du noch nicht gelesen hast; sobald du den Chat öffnest, gelten sie als gelesen.",
          "Schreiben kannst du in jedem Chat einer Gruppe, zu der du gehörst – wie in einer WhatsApp-Gruppe. Neue Nachrichten bekommst du zusätzlich als Benachrichtigung.",
        ],
        link: { href: "/nachrichten", label: "Zu den Nachrichten" },
        keywords: "mitteilung ankündigung rundmail posteingang chat whatsapp gruppe",
      },
      {
        id: "nachricht-senden",
        question: "Wie schreibe ich eine Nachricht?",
        steps: [
          "Öffne „Nachrichten“ und den Chat der Gruppe, schreibe unten deine Nachricht und tippe auf den grünen Pfeil – nach einer kurzen Rückfrage ist sie verschickt.",
          "Für eine Gruppe ohne Chat oder mit eigenem Betreff: Klicke auf „Neue Nachricht“, wähle unter „An wen?“ die Zielgruppe, schreibe Betreff und Text und klicke auf „Jetzt senden …“.",
          "Zurückrufen: Tippe in deiner Nachricht oben rechts auf den kleinen Pfeil und wähle „Zurückrufen“.",
        ],
        tip: "Schreiben kannst du in jede Gruppe, zu der du gehörst: alle Mitglieder, deine Abteilungen und die Veranstaltungen, bei denen du zugesagt hast oder als Helfer eingetragen bist. Vorstand und Abteilungsleitung schreiben auch an andere Gruppen und können eine Nachricht als Ankündigung oder zusätzlich per E-Mail senden. Die Häkchen an deiner Nachricht zeigen, wie viele sie schon gelesen haben (blau = alle). Eine gesendete Nachricht lässt sich nicht mehr ändern, aber zurückrufen. Der Text ist reiner Text – Formatierungen werden nicht dargestellt.",
        link: { href: "/nachrichten/neu", label: "Neue Nachricht" },
        keywords: "rundmail ankündigung mitteilung schreiben email versenden antworten chat gruppe",
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
    id: "verwaltung-beitritt",
    title: "Für Vorstand: Beitritt per QR-Code",
    description: "Neue Mitglieder über einen Aushang gewinnen – mit Antrag und Bestätigung.",
    requires: "members:create",
    clubWide: true,
    items: [
      {
        id: "beitritt-qr-code",
        question: "Wie können neue Mitglieder per QR-Code beitreten?",
        answer: [
          "Mit einem QR-Code – zum Beispiel auf einem Aushang im Vereinsheim – stellen Interessierte am Handy einen Antrag. Du entscheidest, wer Mitglied wird.",
        ],
        steps: [
          "Öffne „Mitglieder“ und klicke auf „Anträge“.",
          "Klicke in der Karte „QR-Code zum Beitritt“ auf „QR-Code einrichten“ und gib ein, wie viele neue Mitglieder sich darüber anmelden können (z. B. 50). Klicke danach auf „Aushang drucken“. Häng das Blatt im Verein auf oder teile den Link („Kopieren“).",
          "Wer den Code scannt, füllt am Handy einen kurzen Antrag aus. Du bekommst dazu eine Benachrichtigung.",
          "Prüfe den Antrag unter „Offene Anträge“ und klicke auf „Annehmen“ oder „Ablehnen“.",
        ],
        tip: "Erst beim Annehmen wird die Person als Mitglied angelegt und bekommt eine Einladung per E-Mail (Rolle „Mitglied“) – vorher hat sie keinen Zugang, Chats, Termine und Dokumente bleiben geschützt. Beim Ablehnen bekommt sie keine E-Mail. Ist die Einladung abgelaufen, schick sie unter „Zuletzt entschieden“ mit „Einladung erneut senden“ noch einmal. Sind alle Plätze vergeben, nimmt der QR-Code keine Anträge mehr an – mit „Anzahl ändern“ lässt du weitere zu; abgelehnte Anträge geben ihren Platz zurück. „Neuen Code erzeugen“ macht den alten QR-Code ungültig (gedruckte Aushänge ersetzen) und beginnt wieder bei 0, „Beitritt schließen“ stoppt neue Anträge. Entschiedene Anträge werden nach 30 Tagen gelöscht, offene nach 180 Tagen.",
        link: { href: "/mitglieder/antraege", label: "Zu den Beitrittsanträgen" },
        keywords:
          "qr code aushang beitritt antrag mitgliedsantrag aufnahme neu werben scannen einladung erneut",
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
          "Vereinsadministrator: alles im Verein. Vorstandsmitglied: Mitglieder, Veranstaltungen, Helferplanung, Aufgaben, Nachrichten, Dokumente und die offenen Zahlungen (Rechnungen). Abteilungsleiter: dasselbe (ohne die offenen Zahlungen), aber nur für die eigene Abteilung. Helfer und Mitglied: Veranstaltungen ansehen, zu- und absagen, sich in Schichten eintragen, Nachrichten lesen und in den eigenen Gruppen schreiben.",
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
      {
        id: "termin-im-kalender",
        question: "Wie trage ich direkt im Kalender einen Termin ein?",
        steps: [
          "Öffne den „Kalender“ und doppelklicke auf den gewünschten Tag – oder klicke oben auf „Neuer Termin“.",
          "Trage Titel, Zeit und Ort ein und klicke auf „Als Entwurf speichern“. Der Termin steht sofort am Tag im Kalender, zunächst als Entwurf.",
          "Klicke den Termin an und wähle „Veröffentlichen“, damit ihn alle Mitglieder sehen.",
        ],
        tip: "Schneller geht es mit dem Häkchen „Gleich veröffentlichen“ im Fenster: Dann sehen die Mitglieder den Termin sofort und werden benachrichtigt – bei einer Serie nur einmal. Auf dem Smartphone nimmst du den Knopf „Neuer Termin“. Beschreibung, Anmeldung und Ansprechpartner ergänzt du auf der Seite des Termins mit „Bearbeiten“.",
        link: { href: "/kalender", label: "Zum Kalender" },
        keywords: "doppelklick schnell eintragen termin anlegen neuer termin datum",
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
          "Öffne die Veranstaltung und klicke im Kasten „Helfer“ auf „Helferplanung öffnen“ (hat sie schon Schichten, geht es auch über „Helferplanung“ und „Helferplan“). Klicke dann auf „Neue Schicht“.",
          "Gib Bezeichnung, Datum, Beginn, Ende und die Zahl der benötigten Helfer an (optional Mindestalter, Treffpunkt, Verantwortliche).",
          "Klicke auf „Schicht anlegen“.",
        ],
        tip: "Endet die Schicht nach Mitternacht, wähle eine Endzeit vor dem Beginn (z. B. 22:00 – 02:00 Uhr). Überbuchung und Doppelbelegung schließt das System aus – auch wenn sich mehrere gleichzeitig eintragen. Auf größeren Bildschirmen zeigt der „Tagesablauf“ oben im Helferplan die Schichten auf einer Zeitachse – vorbeie Schichten blass, am Tag der Veranstaltung mit einer Linie für „jetzt“; rot heißt dringend (Beginn in weniger als 48 Stunden), orange beginnt bald oder noch niemand eingetragen. Am Handy und wenn die Schichten an verschiedenen Tagen beginnen (z. B. Aufbau am Vortag), gibt es nur die Liste – dann mit dem Tag bei jeder Schicht.",
        link: { href: "/helferplanung", label: "Zur Helferplanung" },
        keywords: "schicht einteilen dienstplan helferplan erstellen",
      },
      {
        id: "helfer-zuweisen",
        question: "Wie weise ich einen Helfer selbst zu?",
        steps: [
          "Öffne im Helferplan bei der Schicht das Menü „⋯“ und wähle „Helfer zuweisen“ (oder klicke bei den freien Plätzen einer aufgeklappten Schicht auf „Zuweisen“ – in der Übersicht steht „Zuweisen“ dort, wo du dich nicht selbst eintragen kannst).",
          "Suche die Person und wähle sie aus. Nicht wählbare Personen sind mit dem Grund gekennzeichnet (z. B. Überschneidung oder Mindestalter).",
          "Bestätige mit „… zuweisen“. Die Person wird benachrichtigt.",
        ],
        keywords: "einteilen eintragen manuell zuteilen",
      },
      {
        id: "stunden-erfassen",
        question: "Wie erfasse ich die geleisteten Stunden und drucke den Plan?",
        steps: [
          "Nach Beginn der Schicht wähle im Menü „⋯“ der Schicht „Stunden erfassen“ – bei jedem Helfer erscheint die Schaltfläche „Stunden“.",
          "Trage die tatsächlich geleistete Zeit ein (z. B. 2,5) und speichere.",
        ],
        tip: "Der Helferplan lässt sich mit „Drucken“ ausdrucken und mit „CSV-Export“ in eine Tabelle übernehmen. Die Auswertung aller Stunden erreichst du über „Helferstunden“ oben auf der Seite Helferplanung. Eine Schicht, die schon begonnen hat und Helfer hat, lässt sich nicht mehr löschen – sonst gingen ihre Stunden verloren.",
        keywords: "arbeitsstunden nachweis auswertung export drucken csv",
      },
    ],
  },
  {
    id: "verwaltung-dokumente",
    title: "Für Vorstand: Dokumente",
    description: "Unterlagen bereitstellen.",
    // Nachrichten schreibt inzwischen jeder (Anleitung unter „Nachrichten“); Dokumente hochladen nur Vorstand und Leitung.
    requires: "documents:upload",
    items: [
      {
        id: "dokument-hochladen",
        question: "Wie stelle ich ein Dokument bereit?",
        steps: [
          "Öffne „Dokumente“ und ziehe die Dateien einfach auf die Seite – oder klicke auf „Dokument hochladen“ und wähle sie aus. Mehrere auf einmal gehen auch.",
          "Wähle ggf. eine Kategorie und lege fest, wer die Dokumente sehen darf.",
          "Klicke auf „Hochladen“. Klappt eine Datei nicht, bleibt sie mit dem Grund in der Liste stehen.",
        ],
        tip: "Erlaubt sind PDF, Bilder, Word-, Excel- und PowerPoint-Dateien, OpenDocument, TXT und CSV bis zur eingestellten Größe (Standard 10 MB). Ausführbare Dateien werden abgelehnt. Abteilungsleiter laden Dokumente zu einer Veranstaltung ihrer Abteilung hoch.",
        link: { href: "/dokumente", label: "Zu den Dokumenten" },
        keywords: "upload datei pdf satzung freigeben zugriff ziehen ablegen drag drop mehrere",
      },
    ],
  },
  {
    id: "verwaltung-finanzen",
    title: "Für Vorstand: Finanzen",
    description: "Kassenbuch führen, Rechnungen ablegen und bezahlen, Zahlen im Blick behalten.",
    requires: "finance:read",
    items: [
      {
        id: "kassenbuch-einrichten",
        question: "Wie fange ich mit dem Kassenbuch an?",
        steps: [
          "Öffne „Finanzen“ und dort „Kassenbuch“.",
          "Gib an, ab wann du in VereinsFlow buchst (meist der 1. Januar), den Namen des Girokontos und seinen Anfangsbestand. Hat der Verein eine Barkasse, trage auch ihren Anfangsbestand ein.",
          "Klicke auf „Kassenbuch einrichten“. Kategorien in Alltagssprache (Mitgliedsbeiträge, Hallenmiete, Spenden …) kommen als Vorschlag dazu.",
        ],
        tip: "Den Anfangsbestand findest du auf dem Kontoauszug vom Vortag bzw. durch Zählen der Kasse. Vertippt? In der Zeile des Anfangsbestands im Kassenbuch kannst du ihn über den Stift korrigieren.",
        link: { href: "/finanzen/kassenbuch", label: "Zum Kassenbuch" },
        keywords: "kasse konto anfangsbestand einrichten kassenwart girokonto barkasse",
      },
      {
        id: "buchen",
        question: "Wie buche ich eine Einnahme oder Ausgabe – und was, wenn ich mich vertan habe?",
        steps: [
          "Klicke im Kassenbuch auf „Neue Buchung“, wähle „Einnahme“ oder „Ausgabe“ und trage Betrag, Datum, Konto, Beschreibung und Kategorie ein. Auf Wunsch ordnest du sie einer Abteilung oder Veranstaltung zu oder teilst sie auf mehrere Kategorien auf.",
          "Vertippt? Öffne bei der Buchung das Menü „⋯“ und wähle „Korrigieren“ (die alte Buchung wird storniert, die richtige neu angelegt) oder „Stornieren“ (mit Grund).",
        ],
        tip: "Buchungen werden nie geändert oder gelöscht, sondern storniert – so bleibt alles nachvollziehbar, wie es die Regeln für eine ordentliche Buchführung verlangen. Die Barkasse kann nicht ins Minus rutschen; Bargeld zur Bank bringen ist eine „Umbuchung“.",
        link: { href: "/finanzen/kassenbuch", label: "Zum Kassenbuch" },
        keywords: "buchung einnahme ausgabe storno korrektur fehler umbuchung kasse bank",
      },
      {
        id: "belege",
        question: "Wohin mit Quittungen und Rechnungen zu einer Buchung?",
        steps: [
          "Beim Buchen wählst du unter „Beleg“ ein Foto der Quittung oder ein PDF aus – es hängt dann an der Buchung.",
          "Später geht es über „⋯“ → „Beleg anhängen“. Gibt es keinen Beleg (z. B. Parkautomat), schreibst du dort einen Eigenbeleg: was bezahlt wurde und warum es keinen Beleg gibt.",
          "Bezahlte Rechnungen übernimmst du unter „Finanzen“ → „Rechnungen“ → „Bezahlt“ mit „Ins Kassenbuch“ – die Rechnung ist dann gleich der Beleg.",
        ],
        tip: "Belege werden 8 Jahre aufbewahrt und lassen sich bis dahin nicht löschen. Der Filter „Ohne Beleg“ im Kassenbuch zeigt, was noch fehlt.",
        link: { href: "/finanzen/kassenbuch", label: "Zum Kassenbuch" },
        keywords: "beleg quittung kassenbon rechnung foto eigenbeleg aufbewahrung nachreichen",
      },
      {
        id: "monatsabschluss",
        question: "Was ist der Monatsabschluss und wann mache ich ihn?",
        steps: [
          "Ist ein Monat vorbei, öffne „Finanzen“ → „Abschluss“. Dort steht der nächste offene Monat mit einer kurzen Checkliste: Fehlen Belege, wurde die Barkasse gezählt, sind bezahlte Rechnungen gebucht?",
          "Klicke auf „… abschließen“ und bestätige. Danach ist der Monat festgeschrieben: Neue Buchungen und das Entfernen von Belegen gehen dort nicht mehr; ein Storno landet automatisch im nächsten offenen Monat.",
        ],
        tip: "Monate werden der Reihe nach abgeschlossen, am besten bis zum 10. des Folgemonats – die Übersicht erinnert daran. Jeder Abschluss bekommt eine Prüfsumme, mit der sich später zeigen lässt, dass nichts verändert wurde.",
        link: { href: "/finanzen/abschluss", label: "Zum Monatsabschluss" },
        keywords: "abschluss monat jahresabschluss festschreiben prüfsumme",
      },
      {
        id: "kassensturz",
        question: "Wie mache ich einen Kassensturz?",
        steps: [
          "Im Kassenbuch: „Weitere Aktionen“ → „Kassensturz“.",
          "Zähl das Bargeld und trag den Betrag ein – oder nutze die Zählhilfe und tipp nur die Anzahl je Schein und Münze ein.",
          "Weicht der Betrag vom Kassenbuch ab, schreib kurz, woran es liegen könnte. Die Differenz wird als Buchung „Kassendifferenz“ festgehalten.",
        ],
        tip: "Einmal im Monat zählen genügt – vor dem Monatsabschluss ist ein guter Zeitpunkt.",
        link: { href: "/finanzen/kassenbuch", label: "Zum Kassenbuch" },
        keywords: "kassensturz barkasse zählen bargeld differenz kassendifferenz",
      },
      {
        id: "konten-kategorien",
        question: "Wie lege ich ein weiteres Konto oder eine eigene Kategorie an?",
        steps: [
          "Öffne im Kassenbuch „Weitere Aktionen“ → „Konten und Kategorien“.",
          "„Konto hinzufügen“ für z. B. ein Tagesgeldkonto oder eine zweite Kasse; „Kategorie hinzufügen“ für eigene Einnahmen oder Ausgaben mit ihrem Bereich.",
        ],
        tip: "Konten lassen sich archivieren, sobald ihr Kontostand 0,00 € ist. Ändert sich der Bereich einer Kategorie, gilt das für neue Buchungen – frühere behalten ihren.",
        link: { href: "/finanzen/einstellungen", label: "Zu Konten und Kategorien" },
        keywords: "konto kategorie anlegen bereich zweckbetrieb ideeller bereich archivieren",
      },
      {
        id: "rechnung-erfassen",
        question: "Wie lege ich eine Rechnung ab, die noch bezahlt werden muss?",
        steps: [
          "Öffne „Finanzen“ › „Rechnungen“ und klicke auf „Rechnung hochladen“ (oder bei „Dokumente“ hochladen und „Das ist eine Rechnung“ anhaken).",
          "Sie heißt automatisch nach dem heutigen Tag, z. B. „Rechnung vom 27.09.2026“.",
          "„Muss noch bezahlt werden“ ist schon ausgewählt: Trage den Betrag ein (z. B. 149,90) und, wenn bekannt, das Fälligkeitsdatum. Klicke auf „Hochladen“.",
        ],
        tip: "Rechnungen sind zunächst „Nur Vorstand“. Ist eine Rechnung schon bezahlt, wähle „Ist schon bezahlt“ – dann wird sie nur abgelegt. Rechnungen lädst du einzeln hoch, damit jede ihren eigenen Betrag bekommt.",
        link: { href: "/finanzen/rechnungen", label: "Zu den Rechnungen" },
        keywords: "rechnung beleg quittung kosten betrag zahlung kassenwart",
      },
      {
        id: "offene-zahlungen",
        question: "Wo sehe ich, wie viel Geld noch offen ist?",
        answer: [
          "Auf dem Dashboard unter „Finanzen“: Die Karte „Offene Zahlungen“ zeigt die Summe aller offenen Rechnungen und die dringendsten einzeln – überfällige rot, bald fällige gelb. Ist eine Rechnung bezahlt, klicke daneben auf „Bezahlt“; ein Klick auf „Rückgängig“ in der Meldung macht das rückgängig.",
          "In „Finanzen“ siehst du Kontostand, offene Rechnungen, Überschuss und Spenden des Jahres auf einen Blick, dazu „Das steht an“. Alle Rechnungen stehen unter „Finanzen“ › „Rechnungen“ (offen, bezahlt, alle). Betrag, Fälligkeit und Zahlungsstand änderst du bei „Dokumente“ mit dem Stift („Dokument bearbeiten“).",
        ],
        link: { href: "/finanzen", label: "Zu den Finanzen" },
        keywords: "offene posten schulden ausgaben kasse finanzen überfällig bezahlt",
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
        id: "verein-einrichten",
        question: "Wie richte ich unseren Verein Schritt für Schritt ein?",
        steps: [
          "Bei einem neuen Verein öffnet sich der Assistent „Verein einrichten“ nach der Anmeldung von selbst. Die übrigen Bereiche von VereinsFlow sind bis zum Abschluss noch gesperrt.",
          "Zuerst die Pflichtangaben: Vereinsname, Kontakt-E-Mail und Anschrift – dann „Speichern und weiter“.",
          "Danach Logo, Abteilungen, Mitglieder sowie Vorstand & Zugänge. Diese Schritte kannst du überspringen; erledigte bekommen einen Haken.",
          "Zum Schluss klickst du auf „Einrichtung abschließen“ – jetzt öffnet sich VereinsFlow mit allen Bereichen.",
        ],
        tip: "Später findest du den Assistenten unter „Vereinseinstellungen“ → „Einrichtungs-Assistent“. Was du auf den normalen Seiten anlegst (z. B. einen Mitglieder-Import), zählt im Assistenten genauso.",
        link: { href: "/einrichtung", label: "Zum Assistenten" },
        keywords: "assistent einrichtung neu start anfang schritt wizard",
      },
      {
        id: "einstellungen",
        question: "Wo ändere ich Vereinsdaten und Aufbewahrungsfristen?",
        answer: [
          "Unter „Vereinseinstellungen“ pflegst du Name, Logo, Kontaktdaten, den Datenschutz-Ansprechpartner und die Aufbewahrungsfristen (Papierkorb, Ausgetretene, Änderungsprotokoll).",
        ],
        link: { href: "/einstellungen", label: "Zu den Vereinseinstellungen" },
        keywords: "verein name adresse frist datenschutz löschen",
      },
      {
        id: "vereinslogo",
        question: "Wie ändere ich das Logo unseres Vereins?",
        steps: [
          "Öffne „Vereinseinstellungen“ und wähle im Bereich „Vereinslogo“ eine Bilddatei aus – die Vorschau zeigt, wie es aussieht.",
          "Klicke auf „Logo hochladen“ (bzw. „Logo ersetzen“). Das Logo erscheint sofort neben dem Vereinsnamen in der Kopfzeile, im Vereinswechsler und auf gedruckten Helferplänen.",
          "Mit „Logo entfernen“ erscheinen wieder die Anfangsbuchstaben des Vereinsnamens.",
        ],
        tip: "Erlaubt sind PNG, JPEG und WebP bis 1 MB (kein SVG, keine bewegten Bilder). Am besten eignet sich ein quadratisches Bild ab 128 × 128 Pixeln mit durchsichtigem oder weißem Hintergrund. Alle Mitglieder deines Vereins sehen das Logo – zeige darauf keine Personen.",
        link: { href: "/einstellungen", label: "Zu den Vereinseinstellungen" },
        keywords: "logo wappen bild emblem vereinslogo hochladen ändern",
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

/**
 * Die Abschnitte, die für den Benutzer passen (nach Berechtigung), ohne leere. `can(key, clubWide)` beantwortet, ob der
 * Benutzer das Recht hat – mit `clubWide` nur in der Reichweite „ganzer Verein“.
 */
export function visibleFaq(can: (key: PermissionKey, clubWide: boolean) => boolean): FaqSection[] {
  return FAQ.filter(
    (section) => !section.requires || can(section.requires, section.clubWide === true),
  );
}
