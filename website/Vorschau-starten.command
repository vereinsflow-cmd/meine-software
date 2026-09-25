#!/bin/zsh
# Startet die Vorschau der VereinsFlow-Website auf dem Mac und öffnet den Browser (Doppelklick genügt).
cd "$(dirname "$0")"
# Node.js auch finden, wenn es nur im Benutzerordner installiert ist (~/.local/bin) oder über Homebrew.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
echo
echo "  Die Vorschau wird gestartet und im Browser geöffnet: http://localhost:4173"
echo "  Dieses Fenster OFFEN lassen, solange du die Vorschau ansehen willst."
echo "  Beenden: Ctrl+C drücken."
echo
node tools/serve.mjs --open
echo
echo "  Die Vorschau wurde beendet. Dieses Fenster kann geschlossen werden."
