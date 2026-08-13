"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, X, TriangleAlert } from "lucide-react";
import { cn } from "./cn";

type Tone = "success" | "error";

interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: Tone, message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, tone, message }]);
      // Auto-dismiss. Timer is owned by the event that created the toast,
      // so no effect is needed to manage it.
      setTimeout(() => dismiss(id), DISMISS_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m: string) => push("success", m),
      error: (m: string) => push("error", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-lg",
              "text-sm max-w-sm toast-enter",
              t.tone === "success"
                ? "bg-accent-dim border-accent-border text-accent"
                : "bg-critical/10 border-critical/30 text-critical",
            )}
          >
            {t.tone === "success" ? (
              <Check size={16} className="shrink-0 mt-px" />
            ) : (
              <TriangleAlert size={16} className="shrink-0 mt-px" />
            )}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
