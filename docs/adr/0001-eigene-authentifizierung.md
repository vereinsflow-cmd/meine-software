# ADR-0001: Eigene Authentifizierung statt Auth.js

**Status:** gültig

## Kontext

Für Anmeldung und Sitzungen bieten sich Bibliotheken wie Auth.js (NextAuth) an. VereinsFlow braucht aber Dinge, die dort nicht Standard sind:
**Mandantenkontext** in der Sitzung (aktiver Verein, Wechsel zwischen Vereinen), **Inaktivitäts- und Höchstdauer** serverseitig, **sofortiges
Beenden** aller Sitzungen bei Passwortwechsel und Löschung, **einladungsbasierte** Konten (keine offene Registrierung), gestaffelte **Rate-Limits**
je Konto und IP, und die Sitzung soll **nur als Hash** in der Datenbank liegen. Die Anmeldung ist der sicherheitskritischste Teil der Anwendung.

## Entscheidung

Eigene, kleine Implementierung (`src/server/auth/`):

- Sitzungs-Token: 256 Bit zufällig; Cookie enthält das Token, die Tabelle `Session` nur dessen **SHA-256-Hash** (ein Datenbank-Leck liefert keine nutzbaren Sitzungen).
- Cookie `HttpOnly`, `SameSite=Lax`, in Produktion `Secure` mit `__Host-`-Präfix.
- Passwörter mit **Argon2id** (`@node-rs/argon2`, 19 MiB / 2 Durchläufe), Regeln nach BSI/NIST (Länge vor Komplexität, Liste häufiger Passwörter).
- Einmal-Token (Einladung, Passwort-Reset) mit Ablauf, nur als Hash, atomar eingelöst.
- Rate-Limits und konstante Antwortzeit gegen Konto-Aufzählung.

## Folgen

- (+) Volle Kontrolle über Timeouts, Mandantenwechsel, Abmelden überall, Datenschutz-Löschung (Sitzungen werden mit dem Konto entfernt).
- (+) Wenige Abhängigkeiten in einem sicherheitskritischen Bereich; jede Regel ist testbar (`tests/integration/auth.test.ts`, E2E).
- (−) Wir pflegen den Code selbst. **Ausgleich:** kleine Oberfläche, ausführliche Tests (gleichzeitiges Einlösen, Rate-Limits, Timeouts, Enumeration).
- (−) Keine fertigen Anmeldungen über Dritte (Google, Microsoft). Wer das braucht, ergänzt sie hinter der bestehenden Sitzungsschicht (SSO) – Zwei-Faktor (TOTP) ist als nächster Schritt vorbereitet (siehe Roadmap).
