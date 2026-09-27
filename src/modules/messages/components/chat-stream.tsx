"use client";

import { useEffect, useRef } from "react";

/**
 * Verlauf eines Chats. Er steht wie bei WhatsApp am Ende – bei der neuesten Nachricht, auch nachdem man selbst geschrieben
 * hat. Führt ein Link auf eine bestimmte Nachricht (`#nachricht-<id>`, z. B. aus einer Benachrichtigung), steht beim
 * Öffnen sie im Blick und ist kurz umrandet.
 */
export function ChatStream({
  lastId,
  className,
  children,
}: {
  lastId: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const hash = window.location.hash;
    const target =
      !opened.current && hash.startsWith("#nachricht-")
        ? document.getElementById(hash.slice(1))
        : null;
    opened.current = true;
    if (target && box.contains(target)) {
      target.scrollIntoView({ block: "center" });
      target.setAttribute("data-highlight", "true");
    } else {
      box.scrollTop = box.scrollHeight;
    }
  }, [lastId]);

  return (
    // Tastatur: Der Verlauf lässt sich anwählen und mit den Pfeiltasten scrollen.
    <div ref={ref} role="log" aria-label="Verlauf" tabIndex={0} className={className}>
      {children}
    </div>
  );
}
