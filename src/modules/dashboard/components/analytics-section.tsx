"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ACCENT } from "@/components/shared/accent";
import { AREA_ICON } from "@/components/shared/area-icons";
import { cn } from "@/lib/utils";
import type { AnalyticsData } from "@/lib/charts/types";
import { AnalyticsPanel } from "./analytics-panel";

/**
 * Der Auswertungsbereich als einklappbare Karte: Wer nur die Kennzahlen und Aufgaben braucht, klappt ihn zu und hat Ruhe.
 * Der Knopf ist ein echter Button mit `aria-expanded` (Radix); das Ein- und Ausklappen läuft weich und entfällt bei
 * „Bewegung reduzieren“.
 */
export function AnalyticsSection({
  data,
  description,
}: {
  data: AnalyticsData;
  /** Untertitel der Karte – nennt, worum es im jeweiligen Dashboard-Reiter geht. */
  description: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section aria-labelledby="w-auswertungen">
      <Card>
        <Collapsible open={open} onOpenChange={setOpen} className="grid gap-5">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
                    ACCENT.blue.tile,
                  )}
                  aria-hidden="true"
                >
                  <AREA_ICON.auswertungen />
                </span>
                <div className="min-w-0">
                  <CardTitle id="w-auswertungen" role="heading" aria-level={2}>
                    Auswertungen
                  </CardTitle>
                  <CardDescription className="mt-0.5">{description}</CardDescription>
                </div>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="shrink-0">
                  {open ? "Einklappen" : "Ausklappen"}
                  <span className="sr-only"> Auswertungen</span>
                  <ChevronDownIcon
                    className={cn(
                      "transition-transform duration-200 motion-reduce:transition-none",
                      open && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <AnalyticsPanel data={data} />
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </section>
  );
}
