import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Kombiniert Tailwind-Klassen und löst Konflikte auf.
 * (Bewusst clsx + tailwind-merge statt des Pakets "cn", das die aktuelle shadcn-Vorlage nutzt:
 * weniger unbekannte Abhängigkeiten in der Lieferkette.)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
