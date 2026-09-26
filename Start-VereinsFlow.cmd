@echo off
rem Startet VereinsFlow lokal: Datenbank, Tabellen und Anwendung in einem Schritt (Doppelklick genuegt).
title VereinsFlow (lokal)
cd /d "%~dp0"
echo.
echo  VereinsFlow wird gestartet. Das dauert beim ersten Mal etwas laenger.
echo  Dieses Fenster OFFEN lassen, solange du VereinsFlow benutzt.
echo  Beenden: Strg+C druecken (bei der Rueckfrage "J" eingeben).
echo.
call npm run dev:all -- --open
echo.
echo  Fertig. Dieses Fenster kann geschlossen werden.
pause
