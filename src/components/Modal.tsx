import { X } from "lucide-react";
import { ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export default function Modal({ open, title, onClose, children, footer, width = "max-w-lg" }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <div
        className={`card flex max-h-[88vh] w-full ${width} flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-800">
          <h3 className="font-semibold">{title}</h3>
          <button className="btn-ghost px-1.5 py-1.5" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-ink-200 px-4 py-3 dark:border-ink-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
