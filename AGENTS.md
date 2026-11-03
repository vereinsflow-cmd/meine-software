<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# E2E-Tests parallel zu anderen Sitzungen

`npx playwright test` nutzt Port 3100 und die Datenbank `vf_e2e` und baut sie zu Beginn per `DROP DATABASE … WITH (FORCE)` neu auf – ein gleichzeitiger Lauf einer anderen Sitzung mit denselben Werten bricht dabei ab. Wer testet, während eine andere Sitzung testen könnte, nimmt einen eigenen Port und eine eigene Datenbank:

```bash
E2E_PORT=3400 E2E_DATABASE=vf_e2e_zwei npx playwright test cron.spec.ts
```

- Port frei wählen, am besten 3400–3499 (belegt: 3000/3001 Entwicklung, 3100 Standard-E2E, 3200 Website-Bilder, 3300 Rauchtest). Ein schon belegter Port wird nicht mitbenutzt – der Lauf bricht dann mit einer Meldung ab.
- Der Datenbankname muss mit `vf_e2e` beginnen (Kleinbuchstaben, Ziffern, `_`). Die Extra-Datenbank wird nach dem Lauf automatisch gelöscht; nach einem abgebrochenen Lauf räumt der nächste Lauf mit demselben Namen sie mit auf.
- Screenshots und Spuren eines solchen Laufs liegen in `.local/test-results-<Datenbank>` statt in `test-results`.
- Jeder parallele Lauf braucht seinen eigenen Ordner (Worktree): Im selben Ordner teilen sich die Läufe `.next-e2e`, und Next.js verweigert den zweiten Testserver.

# Tagesangaben in E2E-Tests

Die Demo-Daten liegen relativ zum Tag des Seeds, und ein Lauf kann über Mitternacht gehen – danach ist die Demo-Rechnung „seit 4 Tagen“ statt „seit 3 Tagen“ überfällig. Erwartete Texte wie „fällig in 5 Tagen“ deshalb nie fest hinschreiben, sondern mit `tests/e2e/dates.ts` berechnen: `seedDay(5)` für Demo-Daten, `fromToday(5)` für selbst Angelegtes, `dueText`/`dueBadge`/`inDaysText` für den Text. Nie in 24-Stunden-Schritten rechnen (`Date.now() + 5 * 86_400_000`) – um die Zeitumstellung verrutscht dann der Tag.

Einen Lauf nachstellen, der vor Mitternacht begann (Seed von gestern):

```bash
E2E_SEED_DAY=2026-11-02 E2E_PORT=3400 E2E_DATABASE=vf_e2e_zwei npx playwright test rechnungen.spec.ts
```
