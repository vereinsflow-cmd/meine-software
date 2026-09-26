import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Knopf, der nur ein Symbol zeigt (Löschen, Bearbeiten, Entfernen …). `label` ist zugleich sein Name für Screenreader und
 * der Hinweis, der beim Überfahren oder Fokussieren erscheint – wer sieht, muss das Symbol so nicht erraten.
 * Taugt wie ein Button als Auslöser von Dialogen (`DialogTrigger asChild`, `ConfirmAction trigger`): Weitergereichte
 * Eigenschaften und die Referenz landen am Knopf selbst. Nicht für Knöpfe, die ein Menü öffnen (`…`): Der Hinweis bliebe
 * über dem geöffneten Menü stehen – dort genügt `aria-label`.
 */
export function IconButton({
  label,
  variant = "ghost",
  size = "icon",
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size={size} aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
