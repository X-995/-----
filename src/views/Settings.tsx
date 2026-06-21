import { useState } from "react";
import {
  FolderOpen,
  FolderPlus,
  Loader2,
  Plug,
  Unplug,
  Plus,
  Trash2,
  GripVertical,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { useSettings } from "../store/settings";
import { useVault } from "../store/vault";
import { pickFolder } from "../lib/fs";
import { ensureProject } from "../lib/vault";
import { AI_PROVIDERS, chat } from "../lib/ai";
import {
  DEFAULT_EXTRACTION_TEMPLATES,
  DEFAULT_MATRIX_DIMENSIONS,
  ExtractionDimension,
  ExtractionTemplate,
  MatrixDimension,
} from "../types";
import { toast } from "../store/toast";

export default function SettingsView() {
  const s = useSettings();
  const { connected, connect, disconnect } = useVault();
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  async function choose() {
    const folder = await pickFolder();
    if (folder) s.setVaultPath(folder);
  }

  async function initAndConnect() {
    if (!s.vaultPath) {
      toast.error("请先选择一个 Obsidian vault 文件夹");
      return;
    }
    setBusy(true);
    try {
      await ensureProject(s.vaultPath, s.dirs);
      await connect(s.vaultPath, s.dirs);
      toast.success("已连接并初始化项目目录");
    } catch (e: any) {
      toast.error("连接失败: " + String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  function onProviderChange(provider: string) {
    const preset = AI_PROVIDERS[provider];
    s.setAI({ provider, baseUrl: preset?.baseUrl || s.ai.baseUrl, model: preset?.model || s.ai.model });
  }

  async function testAI() {
    setTesting(true);
    try {
      const reply = await chat(s.ai, [{ role: "user", content: "请只回复两个字：在的" }]);
      toast.success("AI 连接成功：" + reply.slice(0, 30));
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="设置" subtitle="连接 Obsidian vault 并配置 AI / 联网搜索 / 分析维度 / 素材类别" />
      <div className="flex-1 space-y-6 overflow-y-auto p-6">

        {/* Vault */}
        <section className="card max-w-3xl p-5">
          <h2 className="mb-3 font-semibold">Obsidian 联动</h2>
          <label className="label">Vault 文件夹</label>
          <div className="mt-1 flex gap-2">
            <input className="input" placeholder="选择你的 Obsidian vault 根目录…" value={s.vaultPath} onChange={(e) => s.setVaultPath(e.target.value)} />
            <button className="btn-outline shrink-0" onClick={choose}><FolderOpen size={15} /> 浏览</button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {(["root", "characters", "plotlines", "events", "chapters", "materials", "worldview"] as const).map((key) => (
              <div key={key}>
                <label className="label">
                  {{ root: "项目根目录", characters: "角色", plotlines: "剧情线", events: "事件", chapters: "章节", materials: "素材库", worldview: "世界观" }[key]}
                </label>
                <input className="input mt-1" value={s.dirs[key] ?? ""} onChange={(e) => s.setDirs({ [key]: e.target.value })} />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button className="btn-primary" onClick={initAndConnect} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <FolderPlus size={15} />} 初始化并连接
            </button>
            {connected ? (
              <button className="btn-outline" onClick={disconnect}><Unplug size={15} /> 断开</button>
            ) : (
              <span className="flex items-center gap-1 text-sm text-ink-400"><Plug size={14} /> 未连接</span>
            )}
            {connected && (
              <span className="flex items-center gap-1 text-sm text-emerald-500"><Plug size={14} /> 已连接，文件双向同步中</span>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-400">所有数据以 Markdown + frontmatter 形式存储在 vault 中，Obsidian 与本应用可同时编辑，文件改动会自动同步刷新。</p>
        </section>

        {/* Daily goal */}
        <section className="card max-w-3xl p-5">
          <h2 className="mb-3 font-semibold">写作目标</h2>
          <label className="label">每日字数目标</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={100}
              className="input max-w-[160px]"
              value={s.dailyGoal}
              onChange={(e) => { const n = parseInt(e.target.value); if (n > 0) s.setDailyGoal(n); }}
            />
            <span className="text-sm text-ink-400">字/天</span>
          </div>
          <p className="mt-2 text-xs text-ink-400">统计全部「章节」正文总字数的每日新增量，在概览页显示进度环与近7天柱状图。</p>
        </section>

        {/* AI */}
        <section className="card max-w-3xl p-5">
          <h2 className="mb-3 font-semibold">AI 助手（自带 API Key）</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">服务商</label>
              <select className="input mt-1" value={s.ai.provider} onChange={(e) => onProviderChange(e.target.value)}>
                {Object.entries(AI_PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">模型</label>
              <input className="input mt-1" value={s.ai.model} onChange={(e) => s.setAI({ model: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">Base URL</label>
              <input className="input mt-1" value={s.ai.baseUrl} onChange={(e) => s.setAI({ baseUrl: e.target.value })} placeholder="https://api.deepseek.com/v1" />
            </div>
            <div className="col-span-2">
              <label className="label">API Key</label>
              <input className="input mt-1" type="password" value={s.ai.apiKey} onChange={(e) => s.setAI({ apiKey: e.target.value })} placeholder="sk-..." />
            </div>
          </div>
          <button className="btn-outline mt-3" onClick={testAI} disabled={testing}>
            {testing ? <Loader2 size={15} className="animate-spin" /> : null} 测试连接
          </button>
        </section>

        {/* Search */}
        <section className="card max-w-3xl p-5">
          <h2 className="mb-3 font-semibold">联网搜索（自带 API Key）</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">搜索服务商</label>
              <select className="input mt-1" value={s.search.provider} onChange={(e) => s.setSearch({ provider: e.target.value as any })}>
                <option value="tavily">Tavily（推荐，AI 友好）</option>
                <option value="bing">Bing Web Search</option>
                <option value="serpapi">SerpAPI (Google)</option>
              </select>
            </div>
            <div>
              <label className="label">API Key</label>
              <input className="input mt-1" type="password" value={s.search.apiKey} onChange={(e) => s.setSearch({ apiKey: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Matrix dimensions */}
        <DimensionManager dims={s.matrixDimensions} onChange={s.setMatrixDimensions} />

        {/* Material categories */}
        <CategoryManager
          title="素材类别管理"
          desc="新建素材时选择类别，素材库按类别分板块展示。"
          categories={s.materialCategories}
          onChange={s.setMaterialCategories}
        />

        {/* Worldview categories */}
        <CategoryManager
          title="世界观类别管理"
          desc="世界观设定视图按此分类分板块。"
          categories={s.worldviewCategories}
          onChange={s.setWorldviewCategories}
        />

        {/* Extraction templates */}
        <ExtractionTemplateManager
          templates={s.extractionTemplates}
          categories={s.materialCategories}
          onChange={s.setExtractionTemplates}
        />
      </div>
    </div>
  );
}

function DimensionManager({
  dims,
  onChange,
}: {
  dims: MatrixDimension[];
  onChange: (d: MatrixDimension[]) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");

  function update(i: number, patch: Partial<MatrixDimension>) {
    onChange(dims.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function remove(i: number) {
    if (!confirm("删除此维度？已有评分数据仍保留在章节文件中，只是不再显示。")) return;
    onChange(dims.filter((_, idx) => idx !== i));
  }
  function add() {
    const key = newKey.trim().replace(/\s+/g, "_");
    if (!key || !newLabel.trim()) return;
    if (dims.find((d) => d.key === key)) { toast.error("维度 key 重复"); return; }
    onChange([...dims, { key, label: newLabel.trim(), desc: newDesc.trim() }]);
    setNewKey(""); setNewLabel(""); setNewDesc("");
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= dims.length) return;
    const arr = [...dims];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  }
  function reset() {
    if (!confirm("恢复为默认 7 个维度？")) return;
    onChange(DEFAULT_MATRIX_DIMENSIONS);
  }

  return (
    <section className="card max-w-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">剧情分析维度管理</h2>
        <button className="btn-ghost text-xs" onClick={reset}>恢复默认</button>
      </div>
      <p className="mb-3 text-xs text-ink-400">所有章节共用这套维度进行矩阵评分，删除维度不会删除已有评分，只停用展示。</p>
      <div className="space-y-2">
        {dims.map((d, i) => (
          <div key={d.key} className="flex items-center gap-2 rounded-md border border-ink-200 p-2 dark:border-ink-700">
            <div className="flex flex-col text-ink-400">
              <button onClick={() => move(i, -1)} className="hover:text-accent-500 text-xs">▲</button>
              <button onClick={() => move(i, 1)} className="hover:text-accent-500 text-xs">▼</button>
            </div>
            <GripVertical size={14} className="text-ink-300 shrink-0" />
            <input className="input w-24 py-1 text-xs font-mono" value={d.key} onChange={(e) => update(i, { key: e.target.value })} title="key (英文)" />
            <input className="input w-24 py-1 text-xs" value={d.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="显示名" />
            <input className="input flex-1 py-1 text-xs" value={d.desc} onChange={(e) => update(i, { desc: e.target.value })} placeholder="说明" />
            <button className="btn-ghost px-1 text-rose-500" onClick={() => remove(i)}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="input w-28 py-1 text-xs font-mono" placeholder="key (英文)" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <input className="input w-24 py-1 text-xs" placeholder="显示名" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <input className="input flex-1 py-1 text-xs" placeholder="说明" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
        <button className="btn-primary text-xs" onClick={add}><Plus size={13} /> 添加</button>
      </div>
    </section>
  );
}

function CategoryManager({
  title,
  desc,
  categories,
  onChange,
}: {
  title: string;
  desc: string;
  categories: string[];
  onChange: (c: string[]) => void;
}) {
  const [newCat, setNewCat] = useState("");

  function add() {
    const c = newCat.trim();
    if (!c || categories.includes(c)) return;
    onChange([...categories, c]);
    setNewCat("");
  }
  function remove(c: string) {
    onChange(categories.filter((x) => x !== c));
  }

  return (
    <section className="card max-w-3xl p-5">
      <h2 className="mb-1 font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-ink-400">{desc}</p>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <div key={c} className="flex items-center gap-1 rounded-full border border-ink-200 px-3 py-1 text-sm dark:border-ink-700">
            {c}
            <button className="ml-1 text-ink-400 hover:text-rose-500" onClick={() => remove(c)}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="input max-w-[200px] py-1 text-sm"
          placeholder="新类别名…"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn-primary text-xs" onClick={add}><Plus size={13} /> 添加</button>
      </div>
    </section>
  );
}

function ExtractionTemplateManager({
  templates,
  categories,
  onChange,
}: {
  templates: ExtractionTemplate[];
  categories: string[];
  onChange: (t: ExtractionTemplate[]) => void;
}) {
  const [activeCat, setActiveCat] = useState(categories[0] || "");
  const [newDimLabel, setNewDimLabel] = useState("");

  const allCats = Array.from(new Set([...categories, ...templates.map((t) => t.category)]));

  function getTemplate(cat: string): ExtractionTemplate {
    return templates.find((t) => t.category === cat) || { category: cat, dimensions: [] };
  }

  function updateTemplate(cat: string, dims: ExtractionDimension[]) {
    const exists = templates.find((t) => t.category === cat);
    if (exists) {
      onChange(templates.map((t) => t.category === cat ? { ...t, dimensions: dims } : t));
    } else {
      onChange([...templates, { category: cat, dimensions: dims }]);
    }
  }

  function addDim(cat: string) {
    if (!newDimLabel.trim()) return;
    const tmpl = getTemplate(cat);
    const key = newDimLabel.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 20);
    updateTemplate(cat, [...tmpl.dimensions, { key, label: newDimLabel.trim() }]);
    setNewDimLabel("");
  }

  function removeDim(cat: string, idx: number) {
    const tmpl = getTemplate(cat);
    updateTemplate(cat, tmpl.dimensions.filter((_, i) => i !== idx));
  }

  function updateDimLabel(cat: string, idx: number, label: string) {
    const tmpl = getTemplate(cat);
    updateTemplate(cat, tmpl.dimensions.map((d, i) => i === idx ? { ...d, label } : d));
  }

  function reset(cat: string) {
    const def = DEFAULT_EXTRACTION_TEMPLATES.find((t) => t.category === cat);
    if (def) updateTemplate(cat, def.dimensions);
    else updateTemplate(cat, []);
  }

  const active = activeCat || allCats[0] || "";
  const tmpl = getTemplate(active);

  return (
    <section className="card max-w-3xl p-5">
      <h2 className="mb-1 font-semibold">素材摘要提取模板</h2>
      <p className="mb-3 text-xs text-ink-400">
        不同类别的素材用不同的维度模板，AI 摘要时按模板结构化提取关键信息。
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {allCats.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCat(c)}
            className={`rounded-full border px-3 py-1 text-xs ${
              active === c
                ? "border-accent-600 bg-accent-600/15 text-accent-500 font-medium"
                : "border-ink-200 hover:border-accent-500 dark:border-ink-700"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {active && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ink-500">「{active}」的提取维度</span>
            <button className="btn-ghost text-xs" onClick={() => reset(active)}>恢复预制</button>
          </div>
          <div className="space-y-1.5 mb-3">
            {tmpl.dimensions.length === 0 && (
              <p className="text-xs text-ink-400">暂无维度，点下方添加，或「恢复预制」。</p>
            )}
            {tmpl.dimensions.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-center text-xs text-ink-400">{i + 1}</span>
                <input
                  className="input flex-1 py-1 text-sm"
                  value={d.label}
                  onChange={(e) => updateDimLabel(active, i, e.target.value)}
                  placeholder="维度名"
                />
                <button className="btn-ghost px-1 text-rose-500" onClick={() => removeDim(active, i)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1 py-1 text-sm"
              placeholder="新增维度名，如「适用场景」"
              value={newDimLabel}
              onChange={(e) => setNewDimLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDim(active)}
            />
            <button className="btn-primary text-xs" onClick={() => addDim(active)}>
              <Plus size={13} /> 添加
            </button>
          </div>
        </>
      )}
    </section>
  );
}
