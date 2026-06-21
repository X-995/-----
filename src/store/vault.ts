import { create } from "zustand";
import { scanVault, VaultData } from "../lib/vault";
import { onVaultChange, startWatch, stopWatch } from "../lib/fs";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { ProjectDirs } from "../types";

interface VaultState extends VaultData {
  loading: boolean;
  connected: boolean;
  lastSync: number;
  error: string;
  unlisten?: UnlistenFn;
  watchTimer?: ReturnType<typeof setTimeout>;
  refresh: (vaultPath: string, dirs: ProjectDirs) => Promise<void>;
  connect: (vaultPath: string, dirs: ProjectDirs) => Promise<void>;
  disconnect: () => Promise<void>;
}

export const useVault = create<VaultState>((set, get) => ({
  characters: [],
  plotlines: [],
  events: [],
  chapters: [],
  materials: [],
  worldviews: [],
  loading: false,
  connected: false,
  lastSync: 0,
  error: "",

  refresh: async (vaultPath, dirs) => {
    if (!vaultPath) return;
    set({ loading: true, error: "" });
    try {
      const data = await scanVault(vaultPath, dirs);
      set({ ...data, loading: false, lastSync: Date.now() });
    } catch (e: any) {
      set({ loading: false, error: String(e?.message || e) });
    }
  },

  connect: async (vaultPath, dirs) => {
    const state = get();
    if (state.unlisten) state.unlisten();
    await state.refresh(vaultPath, dirs);
    try {
      await startWatch(vaultPath);
      const unlisten = await onVaultChange(() => {
        // debounce bursts of FS events
        const existing = get().watchTimer;
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          get().refresh(vaultPath, dirs);
        }, 600);
        set({ watchTimer: timer });
      });
      set({ unlisten, connected: true });
    } catch (e: any) {
      set({ connected: true, error: "文件监听启动失败: " + String(e) });
    }
  },

  disconnect: async () => {
    const state = get();
    if (state.unlisten) state.unlisten();
    if (state.watchTimer) clearTimeout(state.watchTimer);
    try {
      await stopWatch();
    } catch {
      /* ignore */
    }
    set({
      connected: false,
      unlisten: undefined,
      characters: [],
      plotlines: [],
      events: [],
      chapters: [],
      materials: [],
      worldviews: [],
    });
  },
}));
