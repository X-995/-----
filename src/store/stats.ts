import { create } from "zustand";
import { readTextFile, writeTextFile, ensureDir, joinPath } from "../lib/fs";
import { totalChapterWords, todayKey, lastNDays } from "../lib/words";
import type { Chapter } from "../types";

interface DayRecord {
  start: number;
  end: number;
}

interface StatsState {
  days: Record<string, DayRecord>;
  /** Update stats for today based on current chapter bodies. */
  update: (vaultRoot: string, projectRoot: string, chapters: Chapter[]) => Promise<void>;
  /** Today's new words (end - start). */
  todayWords: () => number;
  /** Words written each day for the last N days. */
  recentDays: (n: number) => { date: string; words: number }[];
  /** Number of consecutive days goal was met. */
  streak: (goal: number) => number;
}

function statsPath(vaultRoot: string, projectRoot: string) {
  return joinPath(vaultRoot, projectRoot, ".novel-app", "writing-stats.json");
}

export const useStats = create<StatsState>((set, get) => ({
  days: {},

  update: async (vaultRoot, projectRoot, chapters) => {
    if (!vaultRoot) return;
    const path = statsPath(vaultRoot, projectRoot);
    const dir = joinPath(vaultRoot, projectRoot, ".novel-app");

    // Load existing stats
    let days: Record<string, DayRecord> = {};
    try {
      await ensureDir(dir);
      const raw = await readTextFile(path);
      const parsed = JSON.parse(raw);
      if (parsed?.days) days = parsed.days;
    } catch {
      /* file may not exist yet */
    }

    const total = totalChapterWords(chapters.map((c) => c.body));
    const key = todayKey();

    if (!days[key]) {
      days[key] = { start: total, end: total };
    } else {
      days[key] = { ...days[key], end: total };
    }

    try {
      await writeTextFile(path, JSON.stringify({ days }, null, 2));
    } catch {
      /* ignore write errors */
    }
    set({ days: { ...days } });
  },

  todayWords: () => {
    const rec = get().days[todayKey()];
    if (!rec) return 0;
    return Math.max(0, rec.end - rec.start);
  },

  recentDays: (n) => {
    const days = get().days;
    return lastNDays(n).map((date) => {
      const rec = days[date];
      return { date, words: rec ? Math.max(0, rec.end - rec.start) : 0 };
    });
  },

  streak: (goal) => {
    const days = get().days;
    let count = 0;
    const sorted = lastNDays(365).reverse(); // today first
    for (const date of sorted) {
      const rec = days[date];
      const words = rec ? Math.max(0, rec.end - rec.start) : 0;
      if (words >= goal) count++;
      else break;
    }
    return count;
  },
}));
