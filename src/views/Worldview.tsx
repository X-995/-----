import { useMemo, useState } from "react";
import { Plus, Save, Trash2, Search } from "lucide-react";
import PageHeader from "../components/PageHeader";
import Empty from "../components/Empty";
import Modal from "../components/Modal";
import { useSettings } from "../store/settings";
import { useVault } from "../store/vault";
import { Worldview } from "../types";
import {
  deleteEntity,
  projectDirs,
  safeFileName,
  worldviewData,
  writeEntity,
} from "../lib/vault";
import { joinPath } from "../lib/fs";
import { toast } from "../store/toast";

export default function WorldviewView() {
  const { vaultPath, dirs, worldviewCategories } = useSettings();
  const { worldviews, refresh } = useVault();
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [edit, setEdit] = useState<Worldview | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCat, setNewCat] = useState(worldviewCategories[0] || "其他设定");

  const dirsAbs = vaultPath ? projectDirs(vaultPath, dirs) : null;

  const filtered = useMemo(() => {
    return worldviews.filter((w) => {
      const okCat = !catFilter || w.category === catFilter;
      const okQ = !query || w.title.includes(query) || w.summary.includes(query) || w.body.includes(query);
      return okCat && okQ;
    });
  }, [worldviews, catFilter, query]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, Worldview[]>();
    const cats = catFilter ? [catFilter] : worldviewCategories;
    for (const cat of cats) map.set(cat, []);
    // also collect any category not in preset list
    for (const w of filtered) {
      if (!map.has(w.category)) map.set(w.category, []);
      map.get(w.category)!.push(w);
    }
    // For filtered preset cats, fill in
    for (const w of filtered) {
      if (map.has(w.category)) {
        const arr = map.get(w.category)!;
        if (!arr.includes(w)) arr.push(w);
      }
    }
    // Remove empty preset cats unless no filter
    return Array.from(map.entries()).filter(([, items]) => items.length > 0 || !catFilter);
  }, [filtered, catFilter, worldviewCategories]);

  async function createWorldview() {
    if (!dirsAbs || !newTitle.trim()) return;
    const title = newTitle.trim();
    const path = joinPath(dirsAbs.worldview, safeFileName(title) + ".md");
    await writeEntity(
      worldviewData({ title, category: newCat, tags: [], summary: "" }),
      `# ${title}\n\n`,
      path
    );
    toast.success("已创建：" + title);
    setAddOpen(false);
    setNewTitle("");
    await refresh(vaultPath, dirs);
  }

  if (!vaultPath) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="世界观设定" />
        <Empty title="请先在设置中连接 vault" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="世界观设定"
        subtitle={`${worldviews.length} 条设定`}
        actions={
          <button className="btn-primary" onClick={() => { setNewCat(worldviewCategories[0] || "其他设定"); setAddOpen(true); }}>
            <Plus size={15} /> 新建设定
          </button>
        }
      />

      <div className="flex items-center gap-2 border-b border-ink-200 px-6 py-3 dark:border-ink-800">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-2.5 top-2.5 text-ink-400" />
          <input
            className="input pl-8"
            placeholder="搜索世界观设定…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="input max-w-[180px]" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">全部类别</option>
          {worldviewCategories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {worldviews.length === 0 && (
          <Empty title="还没有世界观设定" hint="点击右上角「新建设定」，按类别整理地理、势力、历史等设定。" />
        )}
        {grouped.map(([cat, items]) => (
          <section key={cat}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-500 dark:text-ink-300">
              <span className="h-1 w-5 rounded-full bg-accent-600" />
              {cat}
              <span className="text-xs text-ink-400">({items.length})</span>
            </h3>
            {items.length === 0 ? (
              <p className="text-sm text-ink-400">暂无内容</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((w) => (
                  <button
                    key={w.path}
                    className="card flex flex-col p-4 text-left hover:border-accent-500"
                    onClick={() => setEdit({ ...w })}
                  >
                    <div className="font-medium">{w.title}</div>
                    <div className="mt-1 line-clamp-3 flex-1 text-sm text-ink-400">
                      {w.summary || w.body.slice(0, 120) || "（无内容）"}
                    </div>
                    {w.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {w.tags.map((t) => (
                          <span key={t} className="rounded bg-accent-600/10 px-1.5 py-0.5 text-[11px] text-accent-500">{t}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <Modal
        open={addOpen}
        title="新建世界观设定"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>取消</button>
            <button className="btn-primary" onClick={createWorldview}>创建</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">标题</label>
            <input
              autoFocus
              className="input mt-1"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createWorldview()}
              placeholder="例如：东洲大陆"
            />
          </div>
          <div>
            <label className="label">类别</label>
            <select className="input mt-1" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
              {worldviewCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {edit && (
        <WorldviewEditModal
          item={edit}
          categories={worldviewCategories}
          onClose={() => setEdit(null)}
          onSaved={async () => { setEdit(null); await refresh(vaultPath, dirs); }}
        />
      )}
    </div>
  );
}

function WorldviewEditModal({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item: Worldview;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Worldview>(item);

  async function save() {
    await writeEntity(worldviewData(f), f.body, f.path);
    toast.success("已保存");
    onSaved();
  }
  async function del() {
    if (!confirm(`删除「${f.title}」？`)) return;
    await deleteEntity(f.path);
    toast.success("已删除");
    onSaved();
  }

  return (
    <Modal
      open
      title="编辑世界观设定"
      width="max-w-2xl"
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline mr-auto text-rose-500" onClick={del}><Trash2 size={15} /> 删除</button>
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save}><Save size={15} /> 保存</button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">标题</label>
          <input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">类别</label>
            <select className="input mt-1" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              {!categories.includes(f.category) && <option value={f.category}>{f.category}</option>}
            </select>
          </div>
          <div>
            <label className="label">标签（逗号分隔）</label>
            <input
              className="input mt-1"
              value={f.tags.join(", ")}
              onChange={(e) => setF({ ...f, tags: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
            />
          </div>
        </div>
        <div>
          <label className="label">简介/摘要</label>
          <textarea className="input mt-1 min-h-[60px] resize-y" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        </div>
        <div>
          <label className="label">正文（支持 Markdown，Obsidian 中可直接查看）</label>
          <textarea className="input mt-1 min-h-[280px] resize-y font-mono text-xs leading-relaxed" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}
