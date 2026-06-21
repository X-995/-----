import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  type: "info" | "success" | "error";
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, type?: Toast["type"]) => void;
  remove: (id: number) => void;
}

let seq = 1;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (message, type = "info") => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (m: string) => useToast.getState().push(m, "info"),
  success: (m: string) => useToast.getState().push(m, "success"),
  error: (m: string) => useToast.getState().push(m, "error"),
};
