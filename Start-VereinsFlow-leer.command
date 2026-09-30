#!/bin/zsh
# Startet die LEERE Version von VereinsFlow – so, wie ein neuer Verein sie bekommt: ohne Demo-Daten, mit eigener
# Datenbank auf Port 3001, neben der Vorschau (Start-VereinsFlow.command). Beim ersten Öffnen legt man Verein und
# Administrator-Konto an, danach führt ein Assistent Schritt für Schritt durch die Einrichtung.
cd "${0:A:h}"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
echo
echo "  VereinsFlow (leere Version) wird gestartet. Das dauert beim ersten Mal etwas länger."
echo "  Sie beginnt bei jedem Start wieder ganz leer – alles vom letzten Mal wird gelöscht."
echo "  Dieses Fenster OFFEN lassen, solange du die leere Version benutzt."
echo "  Beenden: Ctrl+C drücken."
echo
npm run dev:all -- --leer --open
echo
echo "  Fertig. Dieses Fenster kann geschlossen werden."
