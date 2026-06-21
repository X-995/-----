import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { useToast } from "../store/toast";

export default function Toaster() {
  const { toasts, remove } = useToast();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-2 rounded-lg border border-ink-200 bg-white p-3 text-sm shadow-lg dark:border-ink-700 dark:bg-ink-800"
        >
          {t.type === "success" && (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
          )}
          {t.type === "error" && (
            <XCircle size={18} className="mt-0.5 shrink-0 text-rose-500" />
          )}
          {t.type === "info" && (
            <Info size={18} className="mt-0.5 shrink-0 text-accent-500" />
          )}
          <span className="flex-1 break-words leading-snug">{t.message}</span>
          <button
            onClick={() => remove(t.id)}
            className="shrink-0 text-ink-400 hover:text-ink-600"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
