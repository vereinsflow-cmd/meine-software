"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { IconButton } from "@/components/shared/icon-button";

/**
 * Kleiner Knopf „… kopieren“ (z. B. E-Mail-Adresse im Detailbereich der Mitgliederliste). Nach dem Kopieren zeigt er kurz
 * einen Haken – ohne Animation, der Wechsel des Symbols genügt als Rückmeldung. Screenreader hören „kopiert“ über die
 * Live-Region. Ohne Zwischenablage (unsicherer Ursprung, altes Gerät) passiert nichts – der Wert steht ja daneben.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <IconButton
        label={copied ? "Kopiert" : label}
        size="icon-sm"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        {copied ? <CheckIcon className="text-emerald-600 dark:text-emerald-400" /> : <CopyIcon />}
      </IconButton>
      <span aria-live="polite" className="sr-only">
        {copied ? "In die Zwischenablage kopiert" : ""}
      </span>
    </>
  );
}
