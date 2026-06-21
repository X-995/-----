import { useState } from "react";
import { BookUp, Loader2, FileDown, CheckSquare, Square } from "lucide-react";
import PageHeader from "../components/PageHeader";
import Empty from "../components/Empty";
import { useSettings } from "../store/settings";
import { useVault } from "../store/vault";
import { EpubBook, parseEpub } from "../lib/epub";
import { pickFile, joinPath } from "../lib/fs";
import {
  chapterData,
  materialData,
  projectDirs,
  safeFileName,
  writeEntity,
} from "../lib/vault";
import { toast } from "../store/toast";

export default function EpubImport() {
  const { vaultPath, dirs } = useSettings();
  const { chapters, refresh } = useVault();
  const [book, setBook] = useState<EpubBook | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const dirsAbs = vaultPath ? projectDirs(vaultPath, dirs) : null;

  async function choose() {
    const file = await pickFile([{ name: "EPUB", extensions: ["epub"] }]);
    if (!file) return;
    setLoading(true);
    setBook(null);
    try {
      const parsed = await parseEpub(file);
      setBook(parsed);
      setSelected(new Set(parsed.chapters.map((_, i) => i)));
      toast.success(`已解析《${parsed.title}》，共 ${parsed.chapters.length} 章`);
    } catch (e: any) {
      toast.error("解析失败：" + String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function toggle(i: number) {
    const s = new Set(selected);
    s.has(i) ? s.delete(i) : s.add(i);
    setSelected(s);
  }
  function toggleAll() {
    if (!book) return;
    if (selected.size === book.chapters.length) setSelected(new Set());
    else setSelected(new Set(book.chapters.map((_, i) => i)));
  }

  async function importAs(kind: "chapter" | "material") {
    if (!book || !dirsAbs || selected.size === 0) return;
    setImporting(true);
    try {
      const picked = book.chapters.filter((_, i) => selected.has(i));
      let baseIndex = chapters.reduce((m, c) => Math.max(m, c.index), 0);
      for (const ch of picked) {
        if (kind === "chapter") {
          baseIndex++;
          const path = joinPath(dirsAbs.chapters, safeFileName(`${baseIndex}. ${ch.title}`) + ".md");
          await writeEntity(
            chapterData({
              title: ch.title,
              index: baseIndex,
              summary: "",
              characters: [],
              matrix: {},
              matrixNotes: {},
              beats: [],
            }),
            ch.text,
            path
          );
        } else {
          const path = joinPath(dirsAbs.materials, safeFileName(`${book.title} - ${ch.title}`) + ".md");
          await writeEntity(
            materialData({
              title: `${ch.title}`,
              source: book.title,
              url: "",
              tags: [book.title, "EPUB"],
              summary: "",
            }),
            ch.text,
            path
          );
        }
      }
      await refresh(vaultPath, dirs);
      toast.success(`已导入 ${picked.length} 项为${kind === "chapter" ? "章节" : "素材"}`);
    } catch (e: any) {
      toast.error("导入失败：" + String(e?.message || e));
    } finally {
      setImporting(false);
    }
  }

  if (!vaultPath) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="EPUB 导入" />
        <Empty title="请先在设置中连接 vault" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="EPUB 导入"
        subtitle="解析电子书，按章导入为章节或参考素材"
        actions={
          <button className="btn-primary" onClick={choose} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <BookUp size={15} />} 选择 EPUB
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {!book ? (
          <Empty
            icon={<BookUp size={48} className="opacity-40" />}
            title="尚未导入电子书"
            hint="点击右上角选择一个 .epub 文件，应用会解析其目录、章节、元数据与封面。"
          />
        ) : (
          <div className="mx-auto max-w-4xl">
            <div className="card flex gap-4 p-5">
              {book.coverDataUrl ? (
                <img src={book.coverDataUrl} alt="cover" className="h-40 w-28 rounded object-cover shadow" />
              ) : (
                <div className="flex h-40 w-28 items-center justify-center rounded bg-ink-100 text-ink-400 dark:bg-ink-800">
                  无封面
                </div>
              )}
              <div className="flex-1">
                <h2 className="text-xl font-bold">{book.title}</h2>
                {book.creator && <p className="text-sm text-ink-400">作者：{book.creator}</p>}
                {book.publisher && <p className="text-sm text-ink-400">出版：{book.publisher}</p>}
                <p className="text-sm text-ink-400">章节数：{book.chapters.length}</p>
                {book.description && (
                  <p className="mt-2 line-clamp-3 text-sm text-ink-500 dark:text-ink-300">{book.description}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button className="btn-primary" onClick={() => importAs("chapter")} disabled={importing || selected.size === 0}>
                    {importing ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} 导入为章节
                  </button>
                  <button className="btn-outline" onClick={() => importAs("material")} disabled={importing || selected.size === 0}>
                    <FileDown size={15} /> 导入为素材
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <h3 className="font-semibold">章节列表（已选 {selected.size}）</h3>
              <button className="btn-ghost text-xs" onClick={toggleAll}>
                {selected.size === book.chapters.length ? "取消全选" : "全选"}
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              {book.chapters.map((ch, i) => (
                <button
                  key={i}
                  className="flex w-full items-start gap-2 rounded-md border border-ink-200 p-2.5 text-left hover:border-accent-500 dark:border-ink-700"
                  onClick={() => toggle(i)}
                >
                  {selected.has(i) ? (
                    <CheckSquare size={16} className="mt-0.5 shrink-0 text-accent-500" />
                  ) : (
                    <Square size={16} className="mt-0.5 shrink-0 text-ink-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{ch.title}</div>
                    <div className="line-clamp-2 text-xs text-ink-400">{ch.text.slice(0, 160)}</div>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-400">{ch.text.length} 字</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
