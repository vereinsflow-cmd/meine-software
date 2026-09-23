import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { clubInitials } from "@/lib/club-logo";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { root: "size-6 rounded-md after:rounded-md", image: "rounded-md p-px", text: "text-xs" },
  md: { root: "size-8 rounded-md after:rounded-md", image: "rounded-md p-0.5", text: "text-xs" },
  lg: { root: "size-16 rounded-xl after:rounded-xl", image: "rounded-xl p-1", text: "text-xl" },
} as const;

/**
 * Vereinslogo als kleine, abgerundete Kachel – oder die Anfangsbuchstaben des Vereins, solange keins hinterlegt ist
 * oder das Bild nicht geladen werden kann (die Kachel fällt dann von selbst darauf zurück).
 *
 * Rein schmückend: Der Vereinsname steht immer daneben, deshalb `aria-hidden` und leerer Alternativtext (kein doppeltes
 * Vorlesen; bestehende Namen wie „Verein wechseln“ bleiben unverändert). Das Logo liegt auf einer hellen Kachel, damit
 * auch dunkle Logos mit durchsichtigem Hintergrund in der dunklen Darstellung sichtbar bleiben; `object-contain`
 * schneidet nichts ab. Bewusst kein `next/image`: Dessen Bildoptimierer ruft das Bild ohne Anmeldung ab und bekäme
 * nur „nicht angemeldet“.
 */
export function ClubLogo({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  logoUrl: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const style = SIZES[size];
  return (
    <Avatar aria-hidden="true" data-slot="club-logo" className={cn(style.root, className)}>
      {logoUrl && (
        <AvatarImage
          src={logoUrl}
          alt=""
          className={cn("bg-(--club-logo-bg) object-contain", style.image)}
        />
      )}
      {/* Mit Logo erscheinen die Buchstaben erst nach kurzer Wartezeit – sonst blitzen sie beim Laden kurz auf. */}
      <AvatarFallback
        delayMs={logoUrl ? 600 : undefined}
        className={cn("rounded-[inherit] bg-muted font-semibold text-muted-foreground", style.text)}
      >
        {clubInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
