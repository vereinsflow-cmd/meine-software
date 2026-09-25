#!/bin/zsh
# Startet VereinsFlow lokal auf dem Mac: Datenbank, Tabellen und Anwendung in einem Schritt (Doppelklick genügt).
cd "$(dirname "$0")"
# Node.js auch finden, wenn es nur im Benutzerordner installiert ist (~/.local/bin) oder über Homebrew.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
echo
echo "  VereinsFlow wird gestartet. Das dauert beim ersten Mal etwas länger."
echo "  Dieses Fenster OFFEN lassen, solange du VereinsFlow benutzt."
echo "  Beenden: Ctrl+C drücken."
echo
npm run dev:all -- --open
echo
echo "  VereinsFlow wurde beendet. Dieses Fenster kann geschlossen werden."
