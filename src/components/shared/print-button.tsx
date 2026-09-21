"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Drucken" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()}>
      <PrinterIcon /> {label}
    </Button>
  );
}
