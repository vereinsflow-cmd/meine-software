# Architekturentscheidungen (ADR)

Kurze Protokolle wichtiger Entscheidungen: **Was** wurde entschieden, **warum** und **was folgt daraus**. Sie erklären vor allem die
Abweichungen von den üblichen Standardlösungen. Eine Entscheidung wird nicht gelöscht, sondern durch eine neue ersetzt (Status „ersetzt durch …“).

| Nr.  | Entscheidung                                                                                                  | Status |
| ---- | ------------------------------------------------------------------------------------------------------------- | ------ |
| 0001 | [Eigene Authentifizierung statt Auth.js](0001-eigene-authentifizierung.md)                                    | gültig |
| 0002 | [Mandantentrennung: Kontext, gefilterter Client, zusammengesetzte Fremdschlüssel](0002-mandantentrennung.md)  | gültig |
| 0003 | [Zeit: UTC speichern, Berlin anzeigen, Kalendertage als Datum](0003-zeit-und-zeitzone.md)                     | gültig |
| 0004 | [Rate-Limits, Sperren und Jobs in PostgreSQL – kein Redis, kein Worker](0004-postgres-statt-zusatzdienste.md) | gültig |
| 0005 | [Dateiablage im Dateisystem hinter geprüfter Route](0005-dateiablage.md)                                      | gültig |
| 0006 | [Aufbewahrungsfristen und Anonymisierung statt hartem Löschen](0006-aufbewahrung-und-anonymisierung.md)       | gültig |
| 0007 | [Versionen: Next.js 16, TypeScript 5.9, `proxy.ts`, CSP mit Nonce](0007-versionen-und-csp.md)                 | gültig |
| 0008 | [UTF-8 überall (Windows-Falle bei der Datenbank)](0008-utf8-ueberall.md)                                      | gültig |

Vorlage für neue Einträge: Titel, Status, Kontext, Entscheidung, Folgen (Vor- und Nachteile, was nun zu beachten ist).
