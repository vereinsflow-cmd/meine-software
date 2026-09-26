import {
  ActivityIcon,
  FileIcon,
  InboxIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  UploadIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";

/**
 * Symbole der Suchergebnisse (StaticRegistryEntry.iconKey / SearchResultItem.iconKey). Seiten tragen das Symbol ihres
 * Bereichs – dasselbe wie in der Seitenleiste (`area-icons.ts`); Aktionen und Treffer das ihrer Tätigkeit bzw. Art.
 */
export const ICON_MAP = {
  ...AREA_ICON,
  // Aktionen (wie auf den Knöpfen der Seiten: „Neues Mitglied“, „Import“, „Bearbeiten“, „Helferplan drucken“)
  plus: PlusIcon,
  upload: UploadIcon,
  pencil: PencilIcon,
  drucken: PrinterIcon,
  // Unterseiten und Treffer
  aktivitaet: ActivityIcon,
  meldungen: InboxIcon,
  mitglied: UserIcon,
  dokument: FileIcon,
} as const satisfies Record<string, LucideIcon>;

export type SearchIconKey = keyof typeof ICON_MAP;

export function ResultIcon({ iconKey, className }: { iconKey: SearchIconKey; className?: string }) {
  const Icon = ICON_MAP[iconKey] ?? FileIcon;
  return <Icon className={className} aria-hidden="true" />;
}
