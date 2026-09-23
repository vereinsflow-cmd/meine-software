"use client";

import { useTransition } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClubLogo } from "@/components/shared/club-logo";
import { switchClubAction } from "@/modules/clubs/actions";

interface ClubOption {
  id: string;
  name: string;
  roleName: string;
  logoUrl: string | null;
}

/**
 * Zeigt den aktiven Verein mit Logo (oder Anfangsbuchstaben); bei mehreren Mitgliedschaften kann hier gewechselt
 * werden. Der Name kürzt sich bei wenig Platz, das Logo behält seine Größe.
 */
export function ClubSwitcher({ clubs, activeId }: { clubs: ClubOption[]; activeId: string }) {
  const [pending, startTransition] = useTransition();
  const active = clubs.find((club) => club.id === activeId);

  if (clubs.length <= 1) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        {active && <ClubLogo name={active.name} logoUrl={active.logoUrl} />}
        <p className="truncate text-base font-semibold">{active?.name}</p>
      </div>
    );
  }

  function choose(clubId: string) {
    if (clubId === activeId) return;
    startTransition(async () => {
      const result = await switchClubAction({ clubId });
      if (result && !result.ok) toast.error(result.error.message);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={pending}
          className="h-10 max-w-[45vw] min-w-0 shrink justify-between gap-2 px-1.5 sm:max-w-64 sm:px-2"
          aria-label="Verein wechseln"
        >
          {active && <ClubLogo name={active.name} logoUrl={active.logoUrl} size="sm" />}
          <span className="truncate">{active?.name}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Verein wechseln
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {clubs.map((club) => (
          <DropdownMenuItem
            key={club.id}
            onSelect={() => choose(club.id)}
            className="items-center gap-2.5"
          >
            <ClubLogo name={club.name} logoUrl={club.logoUrl} />
            <div className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{club.name}</span>
              <span className="text-xs text-muted-foreground">{club.roleName}</span>
            </div>
            {club.id === activeId && <CheckIcon aria-label="aktiv" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
