import { useMemo, useState } from "react";
import * as echarts from "echarts";
import {
  Plus,
  Save,
  Trash2,
  Sparkles,
  Loader2,
  BarChart3,
  ListTree,
  Grid3x3,
  BookmarkPlus,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import Empty from "../components/Empty";
import EChart from "../components/EChart";
import Modal from "../components/Modal";
import { useSettings } from "../store/settings";
import { useVault } from "../store/vault";
import { Chapter, DEFAULT_BEATS, Beat } from "../types";
import {
  chapterData,
  deleteEntity,
  materialData,
  projectDirs,
  safeFileName,
  writeEntity,
} from "../lib/vault";
import { joinPath } from "../lib/fs";
import { chat, chatJSON } from "../lib/ai";
import { toast } from "../store/toast";

type ViewMode = "overview" | "chapter";

// ---- Save-to-material dialog ----
interface SaveMatPayload {
  title: string;
  content: string;
  source: string;
  defaultCategory?: string;
}

function SaveToMaterialModal({
  payload,
  onClose,
  onSave,
}: {
  payload: SaveMatPayload;
  onClose: () => void;
  onSave: (title: string, body: string, category: string) => Promise<void>;
}) {
  const { materialCategories } = useSettings();
  const [title, setTitle] = useState(payload.title);
  const [body, setBody] = useState(payload.content);
  const [cat, setCat] = useState(payload.defaultCategory || materialCategories[0] || "事件");
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
      title="存入素材库"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <BookmarkPlus size={15} />} 确认存入
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">标题</label>
          <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">类别</label>
          <select className="input mt-1" value={cat} onChange={(e) => setCat(e.target.value)}>
            {materialCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">内容</label>
          <textarea className="input mt-1 min-h-[120px] resize-y text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// ---- Main view ----
export default function Matrix() {
  const { vaultPath, dirs, ai } = useSettings();
  const { chapters, refresh } = useVault();
  const [mode, setMode] = useState<ViewMode>("overview");
  const [selPath, setSelPath] = useState<string | null>(null);

  const dirsAbs = vaultPath ? projectDirs(vaultPath, dirs) : null;
  const selected = chapters.find((c) => c.path === selPath) || null;

  async function addChapter() {
    if (!dirsAbs) return;
    const idx = chapters.reduce((m, c) => Math.max(m, c.index), 0) + 1;
    const title = `第${idx}章`;
    const path = joinPath(dirsAbs.chapters, safeFileName(`${idx}. ${title}`) + ".md");
    await writeEntity(
      chapterData({ title, index: idx, summary: "", characters: [], matrix: {}, matrixNotes: {}, beats: [] }),
      "",
      path
    );
    await refresh(vaultPath, dirs);
    setSelPath(path);
    setMode("chapter");
    toast.success("已新建章节");
  }

  async function saveMaterial(
    title: string,
    body: string,
    category: string,
    source: string
  ) {
    if (!dirsAbs) return;
    const path = joinPath(dirsAbs.materials, safeFileName(title + " " + Date.now()) + ".md");
    await writeEntity(
      materialData({ title, source, url: "", tags: [], summary: "", category }),
      body,
      path
    );
    await refresh(vaultPath, dirs);
    toast.success("已存入素材库：" + title);
  }

  if (!vaultPath) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="剧情矩阵" />
        <Empty title="请先在设置中连接 vault" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="剧情矩阵 / 线性分析"
        subtitle="单章多维评分与构思拆解，全书节奏一目了然"
        actions={
          <button className="btn-primary" onClick={addChapter}>
            <Plus size={15} /> 新建章节
          </button>
        }
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-60 shrink-0 overflow-y-auto border-r border-ink-200 p-2 dark:border-ink-800">
          <button
            className={`mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${
              mode === "overview" ? "bg-accent-600/10 font-medium text-accent-500" : "hover:bg-ink-100 dark:hover:bg-ink-800"
            }`}
            onClick={() => setMode("overview")}
          >
            <BarChart3 size={16} /> 全书概览
          </button>
          <div className="px-3 py-1 text-[11px] uppercase text-ink-400">章节</div>
          {chapters.map((c) => (
            <button
              key={c.path}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                mode === "chapter" && selPath === c.path
                  ? "bg-accent-600/10 font-medium text-accent-500"
                  : "hover:bg-ink-100 dark:hover:bg-ink-800"
              }`}
              onClick={() => { setSelPath(c.path); setMode("chapter"); }}
            >
              <span className="text-ink-400">#{c.index}</span>
              <span className="truncate">{c.title}</span>
            </button>
          ))}
          {chapters.length === 0 && <p className="px-3 py-2 text-xs text-ink-400">暂无章节</p>}
        </div>

        <div className="flex-1 overflow-y-auto">
          {mode === "overview" ? (
            <Overview chapters={chapters} />
          ) : selected ? (
            <ChapterAnalysis
              key={selected.path}
              chapter={selected}
              ai={ai}
              onSaved={() => refresh(vaultPath, dirs)}
              onDeleted={() => { setSelPath(null); setMode("overview"); refresh(vaultPath, dirs); }}
              onSaveMaterial={saveMaterial}
            />
          ) : (
            <Empty title="请选择一个章节" />
          )}
        </div>
      </div>
    </div>
  );
}

function Overview({ chapters }: { chapters: Chapter[] }) {
  const { matrixDimensions } = useSettings();

  const heatOption = useMemo<echarts.EChartsOption>(() => {
    const dims = matrixDimensions;
    const data: [number, number, number][] = [];
    chapters.forEach((c, ci) => {
      dims.forEach((d, di) => {
        const v = c.matrix?.[d.key];
        if (typeof v === "number") data.push([ci, di, v]);
      });
    });
    return {
      tooltip: { position: "top" },
      grid: { left: 60, right: 20, top: 10, bottom: 80 },
      xAxis: { type: "category", data: chapters.map((c) => `#${c.index}`), axisLabel: { interval: 0, rotate: 45 } },
      yAxis: { type: "category", data: dims.map((d) => d.label) },
      visualMap: { min: 0, max: 5, calculable: true, orient: "horizontal", left: "center", bottom: 10, inRange: { color: ["#1e293b", "#7c3aed", "#f59e0b"] } },
      series: [{ type: "heatmap", data, label: { show: true }, emphasis: { itemStyle: { shadowBlur: 8 } } }],
    };
  }, [chapters, matrixDimensions]);

  const curveOption = useMemo<echarts.EChartsOption>(() => {
    const topDims = matrixDimensions.slice(0, 3);
    return {
      tooltip: { trigger: "axis" },
      legend: { data: topDims.map((d) => d.label), top: 0 },
      grid: { left: 40, right: 20, top: 40, bottom: 30 },
      xAxis: { type: "category", data: chapters.map((c) => `#${c.index}`) },
      yAxis: { type: "value", min: 0, max: 5 },
      series: topDims.map((d) => ({
        name: d.label,
        type: "line",
        smooth: true,
        connectNulls: true,
        data: chapters.map((c) => (typeof c.matrix?.[d.key] === "number" ? c.matrix[d.key] : null)),
      })),
    };
  }, [chapters, matrixDimensions]);

  if (chapters.length === 0) {
    return <Empty title="还没有章节" hint="新建章节并完成矩阵评分后，这里会显示全书节奏热力图与曲线。" />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="card p-5">
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><Grid3x3 size={16} /> 章节 × 维度 矩阵热力图</h3>
        <EChart option={heatOption} height={60 + matrixDimensions.length * 40} />
      </div>
      <div className="card p-5">
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><BarChart3 size={16} /> 全书节奏曲线（前三维）</h3>
        <EChart option={curveOption} height={300} />
      </div>
    </div>
  );
}

function ChapterAnalysis({
  chapter,
  ai,
  onSaved,
  onDeleted,
  onSaveMaterial,
}: {
  chapter: Chapter;
  ai: any;
  onSaved: () => void;
  onDeleted: () => void;
  onSaveMaterial: (title: string, body: string, category: string, source: string) => Promise<void>;
}) {
  const { matrixDimensions } = useSettings();
  const [f, setF] = useState<Chapter>({ ...chapter });
  const [tab, setTab] = useState<"matrix" | "linear">("matrix");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTechBusy, setAiTechBusy] = useState(false);
  const [techniques, setTechniques] = useState<{ name: string; desc: string }[]>([]);
  const [savePayload, setSavePayload] = useState<SaveMatPayload | null>(null);

  const radarOption = useMemo<echarts.EChartsOption>(
    () => ({
      tooltip: {},
      radar: { indicator: matrixDimensions.map((d) => ({ name: d.label, max: 5 })), radius: "65%" },
      series: [{ type: "radar", data: [{ value: matrixDimensions.map((d) => f.matrix?.[d.key] ?? 0), name: "本章评分", areaStyle: { opacity: 0.2 } }] }],
    }),
    [f.matrix, matrixDimensions]
  );

  function setScore(key: string, val: number) { setF({ ...f, matrix: { ...f.matrix, [key]: val } }); }
  function setNote(key: string, val: string) { setF({ ...f, matrixNotes: { ...f.matrixNotes, [key]: val } }); }

  async function save() {
    await writeEntity(chapterData(f), f.body, f.path);
    toast.success("已保存章节分析");
    onSaved();
  }
  async function del() {
    if (!confirm(`删除章节「${f.title}」？`)) return;
    await deleteEntity(f.path);
    toast.success("已删除");
    onDeleted();
  }

  async function aiMatrix() {
    setAiBusy(true);
    try {
      const dimList = matrixDimensions.map((d) => `${d.key}(${d.label}): ${d.desc}`).join("\n");
      const res = await chatJSON<{ matrix: Record<string, number>; notes: Record<string, string> }>(ai, [
        { role: "system", content: "你是资深小说编辑，请对章节做多维度分析评分(1-5整数)。" },
        { role: "user", content: `维度说明:\n${dimList}\n\n章节标题:${f.title}\n章节正文:\n${f.body.slice(0, 4000)}\n\n请仅输出JSON: {"matrix":{"维度key":分数},"notes":{"维度key":"简短点评"}}` },
      ]);
      setF({ ...f, matrix: { ...f.matrix, ...res.matrix }, matrixNotes: { ...f.matrixNotes, ...(res.notes || {}) } });
      toast.success("AI 已完成矩阵评分");
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { setAiBusy(false); }
  }

  async function aiBeats() {
    setAiBusy(true);
    try {
      const res = await chatJSON<{ beats: Beat[]; summary?: string }>(ai, [
        { role: "system", content: "你是小说结构分析师，请把章节拆解为线性节拍，说明这一章是如何一步步构思推进的。" },
        { role: "user", content: `章节标题:${f.title}\n正文:\n${f.body.slice(0, 4000)}\n\n请输出JSON: {"summary":"一句话本章梗概","beats":[{"name":"节拍名(如:开头钩子)","content":"该节拍发生了什么及作用"}]}` },
      ]);
      setF({ ...f, beats: res.beats || f.beats, summary: res.summary || f.summary });
      toast.success("AI 已拆解本章构思");
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { setAiBusy(false); }
  }

  async function aiTechniques() {
    setAiTechBusy(true);
    try {
      const res = await chatJSON<{ techniques: { name: string; desc: string }[] }>(ai, [
        { role: "system", content: "你是资深小说写作教练，请从章节中提炼可复用的写作技巧，供作者学习积累。" },
        { role: "user", content: `章节标题:${f.title}\n正文:\n${f.body.slice(0, 4000)}\n\n请输出JSON: {"techniques":[{"name":"技巧名(简短)","desc":"这个技巧是什么、怎么用、例句/效果"}]}` },
      ]);
      setTechniques(res.techniques || []);
      toast.success(`AI 提炼了 ${res.techniques?.length ?? 0} 条写作技巧`);
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { setAiTechBusy(false); }
  }

  function addBeat() {
    const used = f.beats.length;
    const name = DEFAULT_BEATS[used] || `节拍 ${used + 1}`;
    setF({ ...f, beats: [...f.beats, { name, content: "" }] });
  }
  function updateBeat(i: number, patch: Partial<Beat>) { setF({ ...f, beats: f.beats.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) }); }
  function removeBeat(i: number) { setF({ ...f, beats: f.beats.filter((_, idx) => idx !== i) }); }
  function moveBeat(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= f.beats.length) return;
    const arr = [...f.beats];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setF({ ...f, beats: arr });
  }

  function openSave(title: string, content: string, defaultCategory?: string) {
    setSavePayload({ title, content, source: f.title, defaultCategory });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ink-200 px-6 py-3 dark:border-ink-800">
        <div className="flex items-center gap-3">
          <input className="input max-w-xs font-semibold" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <div className="flex rounded-md border border-ink-200 p-0.5 text-sm dark:border-ink-700">
            <button className={`flex items-center gap-1 rounded px-3 py-1 ${tab === "matrix" ? "bg-accent-600 text-white" : ""}`} onClick={() => setTab("matrix")}>
              <Grid3x3 size={14} /> 矩阵分析
            </button>
            <button className={`flex items-center gap-1 rounded px-3 py-1 ${tab === "linear" ? "bg-accent-600 text-white" : ""}`} onClick={() => setTab("linear")}>
              <ListTree size={14} /> 线性分析
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline text-rose-500" onClick={del}><Trash2 size={15} /></button>
          <button className="btn-primary" onClick={save}><Save size={15} /> 保存</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === "matrix" ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">维度评分</h3>
                <div className="flex gap-2">
                  <button className="btn-outline px-2 py-1 text-xs" onClick={() => openSave(`${f.title} 梗概`, f.summary || f.title, "事件")}>
                    <BookmarkPlus size={13} /> 存摘要
                  </button>
                  <button className="btn-outline px-2 py-1 text-xs" onClick={aiMatrix} disabled={aiBusy}>
                    {aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} AI 分析本章
                  </button>
                </div>
              </div>
              {matrixDimensions.map((d) => (
                <div key={d.key} className="card p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{d.label}</span>
                      <span className="ml-2 text-xs text-ink-400">{d.desc}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-accent-500">{f.matrix?.[d.key] ?? "-"}</span>
                      {f.matrixNotes?.[d.key] && (
                        <button
                          className="rounded bg-ink-100 p-1 hover:bg-accent-600/10 dark:bg-ink-800"
                          title="存此点评为素材"
                          onClick={() => openSave(`${f.title} · ${d.label}点评`, f.matrixNotes[d.key], "技巧")}
                        >
                          <BookmarkPlus size={12} className="text-accent-500" />
                        </button>
                      )}
                    </div>
                  </div>
                  <input type="range" min={0} max={5} step={1} value={f.matrix?.[d.key] ?? 0} onChange={(e) => setScore(d.key, Number(e.target.value))} className="mt-2 w-full accent-accent-600" />
                  <input className="input mt-1 py-1 text-xs" placeholder="点评/备注" value={f.matrixNotes?.[d.key] || ""} onChange={(e) => setNote(d.key, e.target.value)} />
                </div>
              ))}
            </div>
            <div>
              <h3 className="mb-2 font-semibold">维度雷达图</h3>
              <div className="card p-3">
                <EChart option={radarOption} height={360} />
              </div>
              <div className="mt-3">
                <label className="label">本章梗概</label>
                <textarea className="input mt-1 min-h-[80px] resize-y" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">线性节拍（本章如何构思）</h3>
                <div className="flex gap-2">
                  <button className="btn-outline px-2 py-1 text-xs" onClick={aiBeats} disabled={aiBusy}>
                    {aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} AI 拆解
                  </button>
                  <button className="btn-outline px-2 py-1 text-xs" onClick={aiTechniques} disabled={aiTechBusy}>
                    {aiTechBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} 提炼技巧
                  </button>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={addBeat}><Plus size={13} /> 加节拍</button>
                </div>
              </div>
              {f.beats.length === 0 && <p className="text-sm text-ink-400">点击「加节拍」或用 AI 拆解，梳理本章的线性推进。</p>}
              {f.beats.map((b, i) => (
                <div key={i} className="card p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col text-ink-400">
                      <button onClick={() => moveBeat(i, -1)} className="hover:text-accent-500">▲</button>
                      <button onClick={() => moveBeat(i, 1)} className="hover:text-accent-500">▼</button>
                    </div>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-600/15 text-xs font-bold text-accent-500">{i + 1}</span>
                    <input className="input py-1 font-medium" value={b.name} onChange={(e) => updateBeat(i, { name: e.target.value })} />
                    <button
                      className="btn-ghost px-1 text-accent-500"
                      title="存入素材库"
                      onClick={() => openSave(`${f.title} · ${b.name}`, b.content || b.name, "事件")}
                    >
                      <BookmarkPlus size={14} />
                    </button>
                    <button className="btn-ghost px-1 text-rose-500" onClick={() => removeBeat(i)}><Trash2 size={14} /></button>
                  </div>
                  <textarea className="input mt-2 min-h-[60px] resize-y text-sm" placeholder="这一节拍发生了什么、起到什么作用…" value={b.content} onChange={(e) => updateBeat(i, { content: e.target.value })} />
                </div>
              ))}

              {/* AI extracted techniques */}
              {techniques.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-semibold text-accent-500">AI 提炼写作技巧（点击书签存入素材库）</h4>
                  {techniques.map((t, i) => (
                    <div key={i} className="card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-sm font-medium">{t.name}</span>
                          <p className="mt-0.5 text-xs text-ink-400">{t.desc}</p>
                        </div>
                        <button
                          className="btn-ghost shrink-0 px-1.5 py-1 text-accent-500"
                          onClick={() => openSave(`写作技巧：${t.name}`, `${t.name}\n\n${t.desc}\n\n来源章节：${f.title}`, "技巧")}
                        >
                          <BookmarkPlus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="label">章节正文（线性分析依据）</label>
              <textarea className="input mt-1 min-h-[480px] resize-y font-mono text-xs leading-relaxed" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      {savePayload && (
        <SaveToMaterialModal
          payload={savePayload}
          onClose={() => setSavePayload(null)}
          onSave={async (title, body, category) => {
            await onSaveMaterial(title, body, category, savePayload.source);
          }}
        />
      )}
    </div>
  );
}
