import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Upload,
  Sparkles,
  Save,
  Trash2,
  Loader2,
  Globe,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import Empty from "../components/Empty";
import Modal from "../components/Modal";
import { useSettings } from "../store/settings";
import { useVault } from "../store/vault";
import { Material } from "../types";
import {
  deleteEntity,
  materialData,
  projectDirs,
  safeFileName,
  writeEntity,
} from "../lib/vault";
import { joinPath, pickFile, readTextFile, stemName } from "../lib/fs";
import { webSearch, SearchResult } from "../lib/search";
import { chat, extractJSON } from "../lib/ai";
import { toast } from "../store/toast";

// ---- Category picker ----
function CategoryPicker({
  categories,
  value,
  onChange,
  onAddCategory,
}: {
  categories: string[];
  value: string;
  onChange: (c: string) => void;
  onAddCategory: (c: string) => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`rounded-full border px-3 py-1 text-sm ${
              value === c
                ? "border-accent-600 bg-accent-600/15 text-accent-500 font-medium"
                : "border-ink-200 hover:border-accent-500 dark:border-ink-700"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input py-1 text-xs"
          placeholder="新增类别…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              onAddCategory(custom.trim());
              onChange(custom.trim());
              setCustom("");
            }
          }}
        />
        <button
          type="button"
          className="btn-outline text-xs"
          disabled={!custom.trim()}
          onClick={() => {
            if (custom.trim()) {
              onAddCategory(custom.trim());
              onChange(custom.trim());
              setCustom("");
            }
          }}
        >
          添加
        </button>
      </div>
    </div>
  );
}

// ---- New material dialog (with category picker) ----
function NewMaterialModal({
  defaultCategory,
  categories,
  onAddCategory,
  onClose,
  onSave,
}: {
  defaultCategory?: string;
  categories: string[];
  onAddCategory: (c: string) => void;
  onClose: () => void;
  onSave: (title: string, body: string, category: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("新素材");
  const [body, setBody] = useState("");
  const [cat, setCat] = useState(defaultCategory || categories[0] || "事件");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await onSave(title, body, cat);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="新建素材"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null} 创建
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">标题</label>
          <input autoFocus className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">类别</label>
          <div className="mt-1">
            <CategoryPicker categories={categories} value={cat} onChange={setCat} onAddCategory={onAddCategory} />
          </div>
        </div>
        <div>
          <label className="label">内容（可选）</label>
          <textarea className="input mt-1 min-h-[80px] resize-y" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// ---- Main view ----
export default function Materials() {
  const { vaultPath, dirs, search, ai, materialCategories, setMaterialCategories } = useSettings();
  const { materials, refresh } = useVault();
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [edit, setEdit] = useState<Material | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const dirsAbs = vaultPath ? projectDirs(vaultPath, dirs) : null;

  function addCategory(c: string) {
    if (!materialCategories.includes(c)) setMaterialCategories([...materialCategories, c]);
  }

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      const okCat = !catFilter || m.category === catFilter;
      const okQ = !query || m.title.includes(query) || m.summary.includes(query) || m.body.includes(query);
      return okCat && okQ;
    });
  }, [materials, catFilter, query]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, Material[]>();
    const cats = catFilter ? [catFilter] : materialCategories;
    for (const c of cats) map.set(c, []);
    // accumulate
    for (const m of filtered) {
      if (!map.has(m.category || "")) map.set(m.category || "未分类", []);
      const key = m.category || "未分类";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    // fill preset cats from filtered
    for (const m of filtered) {
      const key = m.category || "未分类";
      if (map.has(key) && !map.get(key)!.includes(m)) map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [filtered, catFilter, materialCategories]);

  async function createMaterial(title: string, body: string, category: string) {
    if (!dirsAbs) return;
    const path = joinPath(dirsAbs.materials, safeFileName(title + " " + Date.now()) + ".md");
    await writeEntity(materialData({ title, tags: [], source: "手动", url: "", summary: "", category }), body, path);
    await refresh(vaultPath, dirs);
    toast.success("已新建素材");
  }

  async function importFile() {
    if (!dirsAbs) return;
    const file = await pickFile([{ name: "文本/Markdown", extensions: ["txt", "md", "markdown"] }]);
    if (!file) return;
    try {
      const content = await readTextFile(file);
      const title = stemName(file);
      const path = joinPath(dirsAbs.materials, safeFileName(title) + ".md");
      await writeEntity(
        materialData({ title, tags: ["导入"], source: "本地文件", url: file, summary: "", category: "资料" }),
        content,
        path
      );
      await refresh(vaultPath, dirs);
      toast.success("已导入：" + title);
    } catch (e: any) {
      toast.error("导入失败：" + String(e?.message || e));
    }
  }

  async function saveSearchResult(r: SearchResult, summary: string, tags: string[], category: string) {
    if (!dirsAbs) return;
    const path = joinPath(dirsAbs.materials, safeFileName(r.title) + ".md");
    const body = `${r.snippet}\n\n来源: ${r.url}`;
    await writeEntity(materialData({ title: r.title, source: "联网搜索", url: r.url, tags, summary, category }), body, path);
    await refresh(vaultPath, dirs);
    toast.success("已收藏到素材库");
  }

  function toggleCollapse(cat: string) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  if (!vaultPath) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="素材库" />
        <Empty title="请先在设置中连接 vault" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="素材库"
        subtitle={`${materials.length} 条素材`}
        actions={
          <>
            <button className="btn-outline" onClick={importFile}><Upload size={15} /> 导入文件</button>
            <button className="btn-outline" onClick={() => setSearchOpen(true)}><Globe size={15} /> 联网搜索</button>
            <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={15} /> 新建素材</button>
          </>
        }
      />

      <div className="flex items-center gap-2 border-b border-ink-200 px-6 py-3 dark:border-ink-800">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-2.5 top-2.5 text-ink-400" />
          <input className="input pl-8" placeholder="搜索素材…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input max-w-[180px]" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">全部类别</option>
          {materialCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {materials.length === 0 && (
          <Empty title="暂无素材" hint="可手动新建、导入本地文件，或通过联网搜索收藏。素材分为「事件、技巧、资料、灵感、设定」等类别，也可自定义。" />
        )}
        {grouped.map(([cat, items]) => (
          <section key={cat}>
            <button
              className="mb-3 flex w-full items-center gap-2 text-left"
              onClick={() => toggleCollapse(cat)}
            >
              {collapsed[cat] ? <ChevronRight size={15} className="text-ink-400" /> : <ChevronDown size={15} className="text-ink-400" />}
              <span className="h-1 w-5 rounded-full bg-accent-600" />
              <span className="text-sm font-semibold text-ink-500 dark:text-ink-300">{cat}</span>
              <span className="text-xs text-ink-400">({items.length})</span>
            </button>
            {!collapsed[cat] && (
              items.length === 0 ? (
                <p className="pl-4 text-sm text-ink-400">暂无内容</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((m) => (
                    <button key={m.path} className="card flex flex-col p-4 text-left hover:border-accent-500" onClick={() => setEdit({ ...m })}>
                      <div className="font-medium">{m.title}</div>
                      <div className="mt-1 line-clamp-3 flex-1 text-sm text-ink-400">
                        {m.summary || m.body.slice(0, 120) || "（无内容）"}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {m.source && (
                          <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-500 dark:bg-ink-800">{m.source}</span>
                        )}
                        {m.tags.map((t) => (
                          <span key={t} className="rounded bg-accent-600/10 px-1.5 py-0.5 text-[11px] text-accent-500">{t}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}
          </section>
        ))}
      </div>

      {newOpen && (
        <NewMaterialModal
          categories={materialCategories}
          onAddCategory={addCategory}
          onClose={() => setNewOpen(false)}
          onSave={createMaterial}
        />
      )}

      {edit && (
        <MaterialModal
          material={edit}
          ai={ai}
          categories={materialCategories}
          onAddCategory={addCategory}
          onClose={() => setEdit(null)}
          onSaved={async () => { setEdit(null); await refresh(vaultPath, dirs); }}
        />
      )}

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          categories={materialCategories}
          onAddCategory={addCategory}
          doSearch={(q) => webSearch(search, q)}
          aiSummarize={async (r) => {
            const text = await chat(ai, [
              { role: "system", content: "你是小说创作助手，请把网页摘要整理为简洁的中文要点，并给出3-5个标签。" },
              { role: "user", content: `标题:${r.title}\n内容:${r.snippet}\n请输出 JSON: {"summary":"...","tags":["..."]}` },
            ]);
            return text;
          }}
          onSave={saveSearchResult}
        />
      )}
    </div>
  );
}

function MaterialModal({
  material,
  ai,
  categories,
  onAddCategory,
  onClose,
  onSaved,
}: {
  material: Material;
  ai: any;
  categories: string[];
  onAddCategory: (c: string) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Material>(material);
  const [busy, setBusy] = useState(false);

  async function save() {
    await writeEntity(materialData(f), f.body, f.path);
    toast.success("已保存");
    onSaved();
  }
  async function del() {
    if (!confirm(`删除素材「${f.title}」？`)) return;
    await deleteEntity(f.path);
    toast.success("已删除");
    onSaved();
  }
  async function aiSummary() {
    setBusy(true);
    try {
      const out = await chat(ai, [
        { role: "system", content: "你是小说创作助手。" },
        { role: "user", content: `请用2-3句话概括以下素材，并另起一行给出3-5个逗号分隔标签：\n\n${f.body}` },
      ]);
      const lines = out.split("\n").filter(Boolean);
      const summary = lines[0] || out;
      const tagLine = lines.find((l) => l.includes(",") || l.includes("，"));
      setF({ ...f, summary, tags: tagLine ? tagLine.split(/[,，]/).map((s) => s.replace(/标签[:：]/, "").trim()).filter(Boolean) : f.tags });
      toast.success("AI 已生成摘要与标签");
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open title="编辑素材" width="max-w-2xl" onClose={onClose}
      footer={
        <>
          <button className="btn-outline mr-auto text-rose-500" onClick={del}><Trash2 size={15} /> 删除</button>
          <button className="btn-outline" onClick={aiSummary} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} AI 摘要/标签
          </button>
          <button className="btn-primary" onClick={save}><Save size={15} /> 保存</button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">标题</label>
          <input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div>
          <label className="label">类别</label>
          <div className="mt-1">
            <CategoryPicker categories={categories} value={f.category || ""} onChange={(c) => setF({ ...f, category: c })} onAddCategory={onAddCategory} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">来源</label>
            <input className="input mt-1" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} />
          </div>
          <div>
            <label className="label">链接 URL</label>
            <input className="input mt-1" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">标签（逗号分隔）</label>
          <input className="input mt-1" value={f.tags.join(", ")} onChange={(e) => setF({ ...f, tags: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })} />
        </div>
        <div>
          <label className="label">摘要</label>
          <textarea className="input mt-1 min-h-[60px] resize-y" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        </div>
        <div>
          <label className="label">正文内容</label>
          <textarea className="input mt-1 min-h-[200px] resize-y font-mono text-xs" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}

function SearchModal({
  onClose,
  categories,
  onAddCategory,
  doSearch,
  aiSummarize,
  onSave,
}: {
  onClose: () => void;
  categories: string[];
  onAddCategory: (c: string) => void;
  doSearch: (q: string) => Promise<SearchResult[]>;
  aiSummarize: (r: SearchResult) => Promise<string>;
  onSave: (r: SearchResult, summary: string, tags: string[], category: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [cat, setCat] = useState(categories[0] || "事件");

  async function run() {
    if (!q.trim()) return;
    setLoading(true);
    try { setResults(await doSearch(q.trim())); }
    catch (e: any) { toast.error(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  async function aiSaveOne(r: SearchResult) {
    setAiBusy(r.url);
    try {
      let summary = r.snippet;
      let tags: string[] = ["联网"];
      try {
        const raw = await aiSummarize(r);
        const parsed = extractJSON<{ summary: string; tags: string[] }>(raw);
        summary = parsed.summary || summary;
        tags = parsed.tags?.length ? parsed.tags : tags;
      } catch { /* fall back */ }
      await onSave(r, summary, tags, cat);
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { setAiBusy(null); }
  }

  return (
    <Modal open title="联网搜索素材" width="max-w-2xl" onClose={onClose}>
      <div className="mb-3">
        <label className="label">存入类别</label>
        <div className="mt-1">
          <CategoryPicker categories={categories} value={cat} onChange={setCat} onAddCategory={onAddCategory} />
        </div>
      </div>
      <div className="flex gap-2">
        <input autoFocus className="input" placeholder="输入关键词，例如：宋代城市夜市 描写" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <button className="btn-primary shrink-0" onClick={run} disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} 搜索
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {results.length === 0 && !loading && <p className="text-sm text-ink-400">输入关键词后回车开始搜索。</p>}
        {results.map((r) => (
          <div key={r.url} className="rounded-md border border-ink-200 p-3 dark:border-ink-700">
            <div className="flex items-start justify-between gap-2">
              <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-accent-500 hover:underline">{r.title}</a>
              <button className="btn-outline shrink-0 px-2 py-1 text-xs" onClick={() => aiSaveOne(r)} disabled={aiBusy === r.url}>
                {aiBusy === r.url ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} AI 整理并收藏
              </button>
            </div>
            <p className="mt-1 text-sm text-ink-400">{r.snippet}</p>
            <div className="mt-1 truncate text-[11px] text-ink-400">{r.url}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
