"use client";

import { useTransition } from "react";
import { PartyPopperIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeSetupAction } from "../actions";

export function CompleteSetupButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await completeSetupAction();
          if (!result.ok) toast.error(result.error.message);
        })
      }
    >
      <PartyPopperIcon /> {pending ? "Einen Moment …" : "Einrichtung abschließen"}
    </Button>
  );
}
