# ADR-0002: Mandantentrennung – Kontext, gefilterter Client, zusammengesetzte Fremdschlüssel

**Status:** gültig

## Kontext

Ein Verein darf niemals Daten eines anderen sehen. Übliche Ansätze: (a) eine Datenbank oder ein Schema je Mandant, (b) gemeinsame Tabellen mit
`clubId` und Filter im Anwendungscode, (c) PostgreSQL Row-Level-Security (RLS). Erwartet werden viele kleine Vereine – ein Schema je Verein würde
Migrationen, Verbindungen und Betrieb vervielfachen.

## Entscheidung

Gemeinsame Datenbank und Tabellen (b), aber der Filter darf **nicht** von der Sorgfalt einzelner Abfragen abhängen. Drei unabhängige Schichten:

1. **Kontext:** Der Verein kommt aus der Sitzung (`TenantContext`), nie aus URL oder Formular.
2. **Gefilterter Client:** `createTenantDb(clubId)` (Prisma-Erweiterung) setzt `clubId` bei jeder Operation, verbietet Umziehen, verschachtelte Schreibzugriffe, Roh-SQL
   und unbekannte Operationen. `MODEL_SCOPE` ordnet **jedes** Modell einer Klasse zu (per Typ erzwungen; ein Test gleicht mit den Datenbankspalten ab).
   Der ungefilterte Client ist nur in `src/server/**` erlaubt (ESLint und Architekturtest).
3. **Datenbank:** zusammengesetzte Fremdschlüssel `(clubId, id)` – die Datenbank verhindert vereinsübergreifende Verknüpfungen.

Fremde Datensätze sind „nicht gefunden“ (404), nicht „verboten“.

## Folgen

- (+) Ein vergessener Filter in einem Fachdienst kann keine fremden Daten preisgeben; ein Fehler müsste zugleich in drei Schichten stecken.
- (+) Einfacher Betrieb: eine Datenbank, ein Migrationsstand.
- (−) Prisma-Erweiterungen sind kein Sicherheitsrand gegen jemanden mit Datenbankzugriff; wer den ungefilterten Client oder SQL erreicht, ist außerhalb des Schutzes.
  Der Rand ist der Anwendungscode plus die Regeln oben.
- (−) **RLS wurde bewusst nicht eingesetzt** (Komplexität mit Verbindungspools und Prisma, zusätzliche Fehlerquellen). Es bleibt als vierte Schicht auf der Roadmap; die Datenmodell-Konventionen (`clubId` überall, keine vereinsübergreifenden Beziehungen) sind dafür schon die Voraussetzung.
- Neue Modelle brauchen einen Eintrag in `MODEL_SCOPE` – sonst kompiliert der Code nicht.
