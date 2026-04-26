"use client";

import React, { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type SimpleModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export function SimpleModal({ open, title, description, onClose, children }: SimpleModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <Button aria-label="Close dialog" className="absolute right-3 top-3" onClick={onClose} size="sm" type="button" variant="ghost">
          ×
        </Button>
        <h2 className="pr-10 text-lg font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
