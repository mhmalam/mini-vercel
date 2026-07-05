"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Modal rendered in a portal at <body>. Rendering it inline inside a card
 * breaks: any transformed ancestor (the card hover lift) becomes the
 * containing block for position:fixed, trapping the overlay in the card.
 * Closes on Escape and on mousedown that starts on the backdrop itself —
 * not on click, so releasing a drag/text-selection outside doesn't close it.
 */
export default function Modal({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
