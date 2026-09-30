"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { hideDashboardBlockAction } from "../actions";
import type { DashboardTabId } from "../tabs";

/** Blendet eine Karte über die eigene Dashboard-Einstellung aus – „Anpassen“ holt sie zurück. */
export function HideBlockButton({ tab, block }: { tab: DashboardTabId; block: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await hideDashboardBlockAction({ tab, block });
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          toast.success("Ausgeblendet – über „Anpassen“ holst du die Karte zurück.");
          router.refresh();
        })
      }
    >
      <EyeOffIcon /> Ausblenden
    </Button>
  );
}
