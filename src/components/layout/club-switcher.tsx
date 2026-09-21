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
import { switchClubAction } from "@/modules/clubs/actions";

interface ClubOption {
  id: string;
  name: string;
  roleName: string;
}

/** Zeigt den aktiven Verein; bei mehreren Mitgliedschaften kann hier gewechselt werden. */
export function ClubSwitcher({ clubs, activeId }: { clubs: ClubOption[]; activeId: string }) {
  const [pending, startTransition] = useTransition();
  const active = clubs.find((club) => club.id === activeId);

  if (clubs.length <= 1) {
    return <p className="truncate text-base font-semibold">{active?.name}</p>;
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
          size="sm"
          disabled={pending}
          className="max-w-56 justify-between gap-2"
          aria-label="Verein wechseln"
        >
          <span className="truncate">{active?.name}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Verein wechseln
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {clubs.map((club) => (
          <DropdownMenuItem key={club.id} onSelect={() => choose(club.id)} className="items-start">
            <div className="grid flex-1">
              <span className="font-medium">{club.name}</span>
              <span className="text-xs text-muted-foreground">{club.roleName}</span>
            </div>
            {club.id === activeId && <CheckIcon aria-label="aktiv" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
