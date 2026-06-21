/** Count CJK + ASCII word characters — good enough for Chinese novel word count. */
export function countWords(text: string): number {
  if (!text) return 0;
  // Count Chinese/Japanese/Korean characters as 1 each
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef\u3000-\u303f]/g) || []).length;
  // Count English words
  const eng = (text.match(/\b[a-zA-Z]+\b/g) || []).length;
  return cjk + eng;
}

/** Estimate total words across all chapter bodies. */
export function totalChapterWords(bodies: string[]): number {
  return bodies.reduce((acc, b) => acc + countWords(b), 0);
}

/** Return today's date as YYYY-MM-DD in local time. */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Return the last N days as YYYY-MM-DD strings, oldest first. */
export function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }
  return days;
}
