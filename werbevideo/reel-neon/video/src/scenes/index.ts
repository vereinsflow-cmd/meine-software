/** Alle Szenen in Filmreihenfolge (Grenzen: film.ts → S, Vertrag: scenes/types.ts). */
import type { NeonScene } from "./types";
import { endkarte } from "./endkarte";
import { feierabend } from "./feierabend";
import { finanzen } from "./finanzen";
import { frage } from "./frage";
import { helfer } from "./helfer";
import { hook } from "./hook";
import { leitsatz } from "./leitsatz";
import { logo } from "./logo";
import { mitglieder } from "./mitglieder";
import { nachrichten } from "./nachrichten";
import { problem } from "./problem";
import { termine } from "./termine";

export const SCENES: NeonScene[] = [hook, problem, frage, mitglieder, termine, helfer, nachrichten, finanzen, feierabend, leitsatz, logo, endkarte];
