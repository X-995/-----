import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  AISettings,
  DEFAULT_DIRS,
  DEFAULT_MATERIAL_CATEGORIES,
  DEFAULT_MATRIX_DIMENSIONS,
  DEFAULT_WORLDVIEW_CATEGORIES,
  MatrixDimension,
  ProjectDirs,
  SearchSettings,
} from "../types";
import { AI_PROVIDERS } from "../lib/ai";

interface SettingsState {
  vaultPath: string;
  dirs: ProjectDirs;
  ai: AISettings;
  search: SearchSettings;
  theme: "light" | "dark";
  dailyGoal: number;
  matrixDimensions: MatrixDimension[];
  materialCategories: string[];
  worldviewCategories: string[];
  setVaultPath: (p: string) => void;
  setDirs: (d: Partial<ProjectDirs>) => void;
  setAI: (a: Partial<AISettings>) => void;
  setSearch: (s: Partial<SearchSettings>) => void;
  toggleTheme: () => void;
  setDailyGoal: (n: number) => void;
  setMatrixDimensions: (dims: MatrixDimension[]) => void;
  setMaterialCategories: (cats: string[]) => void;
  setWorldviewCategories: (cats: string[]) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      vaultPath: "",
      dirs: DEFAULT_DIRS,
      ai: {
        provider: "deepseek",
        baseUrl: AI_PROVIDERS.deepseek.baseUrl,
        apiKey: "",
        model: AI_PROVIDERS.deepseek.model,
      },
      search: { provider: "tavily", apiKey: "" },
      theme: "dark",
      dailyGoal: 2000,
      matrixDimensions: DEFAULT_MATRIX_DIMENSIONS,
      materialCategories: DEFAULT_MATERIAL_CATEGORIES,
      worldviewCategories: DEFAULT_WORLDVIEW_CATEGORIES,
      setVaultPath: (p) => set({ vaultPath: p }),
      setDirs: (d) => set((s) => ({ dirs: { ...s.dirs, ...d } })),
      setAI: (a) => set((s) => ({ ai: { ...s.ai, ...a } })),
      setSearch: (sr) => set((s) => ({ search: { ...s.search, ...sr } })),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setDailyGoal: (n) => set({ dailyGoal: n }),
      setMatrixDimensions: (dims) => set({ matrixDimensions: dims }),
      setMaterialCategories: (cats) => set({ materialCategories: cats }),
      setWorldviewCategories: (cats) => set({ worldviewCategories: cats }),
    }),
    { name: "novel-app-settings" }
  )
);
