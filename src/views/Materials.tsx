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
  Bot,
  MessageSquare,
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
import {
  chat,
  extractJSON,
  semanticSearch,
  materialQA,
  suggestSearchTerms,
  synthesizeResults,
  buildTemplatePrompt,
} from "../lib/ai";
import { toast } from "../store/toast";

type SearchMode = "keyword" | "semantic" | "qa";

// ─── Category picker ──────────────────────────────────────────────────────────
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

// ─── New material dialog ───────────────────────────────────────────────────────
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
    try { await onSave(title, body, cat); onClose(); } finally { setBusy(false); }
  }
  return (
    <Modal open title="新建素材" onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>取消</button>
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} 创建
        </button>
      </>}
    >
      <div className="space-y-3">
        <div><label className="label">标题</label>
          <input autoFocus className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="label">类别</label>
          <div className="mt-1"><CategoryPicker categories={categories} value={cat} onChange={setCat} onAddCategory={onAddCategory} /></div></div>
        <div><label className="label">内容（可选）</label>
          <textarea className="input mt-1 min-h-[80px] resize-y" value={body} onChange={(e) => setBody(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function Materials() {
  const { vaultPath, dirs, search, ai, materialCategories, setMaterialCategories, extractionTemplates } = useSettings();
  const { materials, refresh } = useVault();
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("keyword");
  const [catFilter, setCatFilter] = useState("");
  const [edit, setEdit] = useState<Material | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // AI search state
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const [semanticMatches, setSemanticMatches] = useState<{ path: string; reason: string }[]>([]);
  const [qaResult, setQaResult] = useState<{ answer: string; refs: { path: string; title: string }[] } | null>(null);

  const dirsAbs = vaultPath ? projectDirs(vaultPath, dirs) : null;

  function addCategory(c: string) {
    if (!materialCategories.includes(c)) setMaterialCategories([...materialCategories, c]);
  }

  // Keyword filter
  const keywordFiltered = useMemo(() => {
    return materials.filter((m) => {
      const okCat = !catFilter || m.category === catFilter;
      const okQ = !query || m.title.includes(query) || m.summary.includes(query) || m.body.includes(query);
      return okCat && okQ;
    });
  }, [materials, catFilter, query]);

  // For semantic mode: filtered by semanticMatches paths
  const semanticFiltered = useMemo(() => {
    if (!semanticMatches.length) return [];
    const pathSet = new Set(semanticMatches.map((m) => m.path));
    return materials.filter((m) => pathSet.has(m.path));
  }, [materials, semanticMatches]);

  const displayMaterials = searchMode === "semantic" ? semanticFiltered : keywordFiltered;

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, Material[]>();
    const cats = catFilter ? [catFilter] : materialCategories;
    for (const c of cats) map.set(c, []);
    for (const m of displayMaterials) {
      const key = m.category || "未分类";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [displayMaterials, catFilter, materialCategories]);

  async function runAISearch() {
    if (!query.trim()) return;
    setAiSearchLoading(true);
    setSemanticMatches([]);
    setQaResult(null);
    try {
      const corpus = (catFilter ? materials.filter((m) => m.category === catFilter) : materials)
        .map((m) => ({ path: m.path, title: m.title, summary: m.summary, body: m.body }));
      if (searchMode === "semantic") {
        const matches = await semanticSearch(ai, query, corpus);
        setSemanticMatches(matches);
        if (!matches.length) toast.info("未找到语义相关素材");
      } else {
        const result = await materialQA(ai, query, corpus);
        setQaResult(result);
      }
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setAiSearchLoading(false);
    }
  }

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
      await writeEntity(materialData({ title, tags: ["导入"], source: "本地文件", url: file, summary: "", category: "资料" }), content, path);
      await refresh(vaultPath, dirs);
      toast.success("已导入：" + title);
    } catch (e: any) { toast.error("导入失败：" + String(e?.message || e)); }
  }

  async function saveSearchResult(r: SearchResult, summary: string, tags: string[], category: string) {
    if (!dirsAbs) return;
    const path = joinPath(dirsAbs.materials, safeFileName(r.title) + ".md");
    const body = `${r.snippet}\n\n来源: ${r.url}`;
    await writeEntity(materialData({ title: r.title, source: "联网搜索", url: r.url, tags, summary, category }), body, path);
    await refresh(vaultPath, dirs);
    toast.success("已收藏到素材库");
  }

  async function saveSynthesized(title: string, body: string, category: string) {
    if (!dirsAbs) return;
    const path = joinPath(dirsAbs.materials, safeFileName(title + " " + Date.now()) + ".md");
    await writeEntity(materialData({ title, source: "AI综合", tags: ["联网", "AI"], summary: "", category }), body, path);
    await refresh(vaultPath, dirs);
    toast.success("已保存 AI 综合笔记");
  }

  function toggleCollapse(cat: string) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  function getSemanticReason(path: string) {
    return semanticMatches.find((m) => m.path === path)?.reason;
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
        actions={<>
          <button className="btn-outline" onClick={importFile}><Upload size={15} /> 导入文件</button>
          <button className="btn-outline" onClick={() => setSearchOpen(true)}><Globe size={15} /> 联网搜索</button>
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={15} /> 新建素材</button>
        </>}
      />

      {/* Search bar + mode tabs */}
      <div className="border-b border-ink-200 px-6 pb-3 pt-3 dark:border-ink-800">
        <div className="flex items-center gap-2 mb-2">
          {/* Mode tabs */}
          <div className="flex rounded-md border border-ink-200 p-0.5 text-xs dark:border-ink-700">
            <button
              className={`flex items-center gap-1 rounded px-2.5 py-1 ${searchMode === "keyword" ? "bg-accent-600 text-white" : "text-ink-500 hover:text-ink-700"}`}
              onClick={() => { setSearchMode("keyword"); setSemanticMatches([]); setQaResult(null); }}
            >
              <Search size={12} /> 关键词
            </button>
            <button
              className={`flex items-center gap-1 rounded px-2.5 py-1 ${searchMode === "semantic" ? "bg-accent-600 text-white" : "text-ink-500 hover:text-ink-700"}`}
              onClick={() => { setSearchMode("semantic"); setQaResult(null); }}
            >
              <Bot size={12} /> AI 语义
            </button>
            <button
              className={`flex items-center gap-1 rounded px-2.5 py-1 ${searchMode === "qa" ? "bg-accent-600 text-white" : "text-ink-500 hover:text-ink-700"}`}
              onClick={() => { setSearchMode("qa"); setSemanticMatches([]); }}
            >
              <MessageSquare size={12} /> AI 问答
            </button>
          </div>
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-2.5 top-2.5 text-ink-400" />
            <input
              className="input pl-8"
              placeholder={
                searchMode === "keyword" ? "搜索素材…" :
                searchMode === "semantic" ? "用自然语言描述，如「打斗节奏紧张的场景」…" :
                "提问，如「有哪些适合章节开头的描写素材？」…"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (searchMode !== "keyword") runAISearch();
                }
              }}
            />
          </div>
          {searchMode !== "keyword" && (
            <button className="btn-primary text-xs" onClick={runAISearch} disabled={aiSearchLoading || !query.trim()}>
              {aiSearchLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {searchMode === "semantic" ? "语义搜索" : "提问"}
            </button>
          )}
          <select className="input max-w-[160px]" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="">全部类别</option>
            {materialCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {searchMode !== "keyword" && (
          <p className="text-xs text-ink-400">
            {searchMode === "semantic"
              ? "AI 语义搜索：用自然语言描述你想找的素材内容，AI 从素材库中排序匹配（最多80条）。"
              : "AI 问答：直接提问，AI 综合素材库内容给出回答并标注引用来源。"}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Q&A result panel */}
        {searchMode === "qa" && qaResult && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Bot size={16} className="text-accent-500" />
              <h3 className="font-semibold text-accent-500">AI 回答</h3>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{qaResult.answer}</p>
            {qaResult.refs.length > 0 && (
              <div className="mt-3 border-t border-ink-200 pt-3 dark:border-ink-800">
                <p className="text-xs text-ink-400 mb-1">引用素材：</p>
                <div className="flex flex-wrap gap-2">
                  {qaResult.refs.map((r) => {
                    const m = materials.find((x) => x.path === r.path);
                    return (
                      <button
                        key={r.path}
                        className="rounded-full bg-accent-600/10 px-3 py-1 text-xs text-accent-500 hover:bg-accent-600/20"
                        onClick={() => m && setEdit({ ...m })}
                      >
                        {r.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {materials.length === 0 && (
          <Empty title="暂无素材" hint="可手动新建、导入本地文件，或通过联网搜索收藏。" />
        )}

        {/* Semantic search: flat list with reasons */}
        {searchMode === "semantic" && semanticMatches.length > 0 && (
          <div>
            <p className="mb-3 text-xs text-ink-400">找到 {semanticMatches.length} 条相关素材</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {semanticFiltered.map((m) => (
                <button key={m.path} className="card flex flex-col p-4 text-left hover:border-accent-500" onClick={() => setEdit({ ...m })}>
                  <div className="font-medium">{m.title}</div>
                  <div className="mt-1 text-xs text-accent-400 italic">{getSemanticReason(m.path)}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-ink-400">{m.summary || m.body.slice(0, 100)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Keyword / all: grouped by category */}
        {(searchMode === "keyword" || (searchMode === "semantic" && !semanticMatches.length)) &&
          grouped.map(([cat, items]) => (
            <section key={cat}>
              <button className="mb-3 flex w-full items-center gap-2 text-left" onClick={() => toggleCollapse(cat)}>
                {collapsed[cat] ? <ChevronRight size={15} className="text-ink-400" /> : <ChevronDown size={15} className="text-ink-400" />}
                <span className="h-1 w-5 rounded-full bg-accent-600" />
                <span className="text-sm font-semibold text-ink-500 dark:text-ink-300">{cat}</span>
                <span className="text-xs text-ink-400">({items.length})</span>
              </button>
              {!collapsed[cat] && (
                items.length === 0 ? <p className="pl-4 text-sm text-ink-400">暂无内容</p> : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((m) => (
                      <button key={m.path} className="card flex flex-col p-4 text-left hover:border-accent-500" onClick={() => setEdit({ ...m })}>
                        <div className="font-medium">{m.title}</div>
                        <div className="mt-1 line-clamp-3 flex-1 text-sm text-ink-400">{m.summary || m.body.slice(0, 120) || "（无内容）"}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {m.source && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-500 dark:bg-ink-800">{m.source}</span>}
                          {m.tags.map((t) => <span key={t} className="rounded bg-accent-600/10 px-1.5 py-0.5 text-[11px] text-accent-500">{t}</span>)}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </section>
          ))
        }
      </div>

      {newOpen && (
        <NewMaterialModal categories={materialCategories} onAddCategory={addCategory} onClose={() => setNewOpen(false)} onSave={createMaterial} />
      )}

      {edit && (
        <MaterialModal
          material={edit}
          ai={ai}
          categories={materialCategories}
          extractionTemplates={extractionTemplates}
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
          ai={ai}
          onSave={saveSearchResult}
          onSaveSynthesized={saveSynthesized}
        />
      )}
    </div>
  );
}

// ─── Material edit modal ───────────────────────────────────────────────────────
function MaterialModal({
  material,
  ai,
  categories,
  extractionTemplates,
  onAddCategory,
  onClose,
  onSaved,
}: {
  material: Material;
  ai: any;
  categories: string[];
  extractionTemplates: import("../types").ExtractionTemplate[];
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
      const template = extractionTemplates.find((t) => t.category === f.category);
      const prompt = buildTemplatePrompt(f.body || f.summary, template);
      const out = await chat(ai, [
        { role: "system", content: "你是小说创作助手，请按要求提取素材的关键信息。" },
        { role: "user", content: prompt },
      ]);
      // Extract tags from last line if present
      const lines = out.split("\n").filter(Boolean);
      const tagLine = lines.slice().reverse().find((l) => l.includes(",") || l.includes("，"));
      const summary = template
        ? lines.filter((l) => !l.startsWith("标签") && !(tagLine && l === tagLine)).join("\n")
        : lines[0] || out;
      setF({
        ...f,
        summary,
        tags: tagLine ? tagLine.replace(/^标签[:：]?\s*/, "").split(/[,，]/).map((s) => s.trim()).filter(Boolean) : f.tags,
      });
      toast.success("AI 已按模板提取信息");
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open title="编辑素材" width="max-w-2xl" onClose={onClose}
      footer={<>
        <button className="btn-outline mr-auto text-rose-500" onClick={del}><Trash2 size={15} /> 删除</button>
        <button className="btn-outline" onClick={aiSummary} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} AI 摘要/标签
        </button>
        <button className="btn-primary" onClick={save}><Save size={15} /> 保存</button>
      </>}
    >
      <div className="space-y-3">
        <div><label className="label">标题</label>
          <input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">类别</label>
          <div className="mt-1"><CategoryPicker categories={categories} value={f.category || ""} onChange={(c) => setF({ ...f, category: c })} onAddCategory={onAddCategory} /></div></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">来源</label>
            <input className="input mt-1" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></div>
          <div><label className="label">链接 URL</label>
            <input className="input mt-1" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></div>
        </div>
        <div><label className="label">标签（逗号分隔）</label>
          <input className="input mt-1" value={f.tags.join(", ")} onChange={(e) => setF({ ...f, tags: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })} /></div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label">摘要 / 结构化信息</label>
            {extractionTemplates.find((t) => t.category === f.category) && (
              <span className="text-[11px] text-accent-400">
                已有「{f.category}」模板，点击 AI 摘要按模板提取
              </span>
            )}
          </div>
          <textarea className="input mt-1 min-h-[80px] resize-y" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        </div>
        <div><label className="label">正文内容</label>
          <textarea className="input mt-1 min-h-[200px] resize-y font-mono text-xs" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
      </div>
    </Modal>
  );
}

// ─── Web search modal ─────────────────────────────────────────────────────────
function SearchModal({
  onClose,
  categories,
  onAddCategory,
  doSearch,
  ai,
  onSave,
  onSaveSynthesized,
}: {
  onClose: () => void;
  categories: string[];
  onAddCategory: (c: string) => void;
  doSearch: (q: string) => Promise<SearchResult[]>;
  ai: any;
  onSave: (r: SearchResult, summary: string, tags: string[], category: string) => Promise<void>;
  onSaveSynthesized: (title: string, body: string, category: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [synthBusy, setSynthBusy] = useState(false);
  const [cat, setCat] = useState(categories[0] || "事件");
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  async function run(keyword?: string) {
    const term = keyword ?? q;
    if (!term.trim()) return;
    setLoading(true);
    setSuggestions([]);
    try { setResults(await doSearch(term.trim())); }
    catch (e: any) { toast.error(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  async function aiSuggest() {
    if (!q.trim()) return;
    setSuggestBusy(true);
    try {
      const terms = await suggestSearchTerms(ai, q.trim());
      setSuggestions(terms);
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { setSuggestBusy(false); }
  }

  async function aiSynthesizeAll() {
    if (!results.length) return;
    setSynthBusy(true);
    try {
      const body = await synthesizeResults(ai, q, results);
      await onSaveSynthesized(`${q} · AI综合笔记`, body, cat);
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { setSynthBusy(false); }
  }

  async function aiSaveOne(r: SearchResult) {
    setAiBusy(r.url);
    try {
      let summary = r.snippet;
      let tags: string[] = ["联网"];
      try {
        const text = await chat(ai, [
          { role: "system", content: "你是小说创作助手，请把网页摘要整理为简洁的中文要点，并给出3-5个标签。" },
          { role: "user", content: `标题:${r.title}\n内容:${r.snippet}\n请输出 JSON: {"summary":"...","tags":["..."]}` },
        ]);
        const parsed = extractJSON<{ summary: string; tags: string[] }>(text);
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
        <div className="mt-1"><CategoryPicker categories={categories} value={cat} onChange={setCat} onAddCategory={onAddCategory} /></div>
      </div>

      <div className="flex gap-2">
        <input
          autoFocus
          className="input"
          placeholder="输入搜索词，或用自然语言描述（点「AI 优化」转为精准词）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <button className="btn-outline shrink-0 text-xs" onClick={aiSuggest} disabled={suggestBusy || !q.trim()}>
          {suggestBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} AI 优化
        </button>
        <button className="btn-primary shrink-0" onClick={() => run()} disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} 搜索
        </button>
      </div>

      {/* AI suggested terms */}
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="text-xs text-ink-400 self-center">推荐搜索词：</span>
          {suggestions.map((s) => (
            <button key={s} className="rounded-full border border-accent-500 bg-accent-600/10 px-3 py-0.5 text-xs text-accent-500 hover:bg-accent-600/20"
              onClick={() => { setQ(s); run(s); setSuggestions([]); }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Synthesize all button */}
      {results.length > 0 && (
        <div className="mt-3 flex justify-end">
          <button className="btn-outline text-xs" onClick={aiSynthesizeAll} disabled={synthBusy}>
            {synthBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} AI 综合汇总（前5条）并存入
          </button>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {results.length === 0 && !loading && (
          <p className="text-sm text-ink-400">输入关键词后回车搜索，或用「AI 优化」将自然语言转换为精准搜索词。</p>
        )}
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
