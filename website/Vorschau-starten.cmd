@echo off
rem Startet die Vorschau der VereinsFlow-Website und oeffnet den Browser (Doppelklick genuegt).
title VereinsFlow-Website (Vorschau)
cd /d "%~dp0"
echo.
echo  Die Vorschau wird gestartet und im Browser geoeffnet: http://localhost:4173
echo  Dieses Fenster OFFEN lassen, solange du die Vorschau ansehen willst.
echo  Beenden: Strg+C druecken (bei der Rueckfrage "J" eingeben).
echo.
node tools\serve.mjs --open
echo.
echo  Die Vorschau wurde beendet.
pause
