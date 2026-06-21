import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
} from "@xyflow/react";
import { Plus, Trash2, UserPlus, Save, Filter } from "lucide-react";
import PageHeader from "../components/PageHeader";
import Empty from "../components/Empty";
import Modal from "../components/Modal";
import { useSettings } from "../store/settings";
import { useVault } from "../store/vault";
import { Character, Relation } from "../types";
import {
  characterData,
  deleteEntity,
  projectDirs,
  safeFileName,
  writeEntity,
} from "../lib/vault";
import { joinPath } from "../lib/fs";
import { toast } from "../store/toast";

function CharacterNode({ data, selected }: NodeProps) {
  const d = data as any;
  return (
    <div
      className={`min-w-[110px] rounded-lg border-2 bg-white px-3 py-2 text-center shadow-sm dark:bg-ink-800 ${
        selected ? "ring-2 ring-accent-500" : ""
      }`}
      style={{ borderColor: d.color }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-sm font-semibold" style={{ color: d.color }}>
        {d.label}
      </div>
      {d.role && <div className="text-[11px] text-ink-400">{d.role}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { character: CharacterNode };

export default function Characters() {
  const { vaultPath, dirs } = useSettings();
  const { characters, refresh } = useVault();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [form, setForm] = useState<Character | null>(null);

  const allTags = useMemo(
    () => Array.from(new Set(characters.flatMap((c) => c.tags))).sort(),
    [characters]
  );

  // Build graph from vault characters
  useEffect(() => {
    const filtered = tagFilter
      ? characters.filter((c) => c.tags.includes(tagFilter))
      : characters;
    const ids = new Set(filtered.map((c) => c.id));
    const n: Node[] = filtered.map((c, i) => {
      const angle = (i / Math.max(filtered.length, 1)) * Math.PI * 2;
      const radius = 80 + filtered.length * 22;
      return {
        id: c.id,
        type: "character",
        position: {
          x: Number.isFinite(c.data.x) ? c.data.x : 360 + radius * Math.cos(angle),
          y: Number.isFinite(c.data.y) ? c.data.y : 280 + radius * Math.sin(angle),
        },
        data: { label: c.name, role: c.role, color: c.color },
      };
    });
    const e: Edge[] = [];
    for (const c of filtered) {
      for (const rel of c.relations || []) {
        if (!ids.has(rel.target)) continue;
        e.push({
          id: `${c.id}__${rel.target}__${rel.type}`,
          source: c.id,
          target: rel.target,
          label: rel.type,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: c.color },
          labelStyle: { fontSize: 11 },
        });
      }
    }
    setNodes(n);
    setEdges(e);
  }, [characters, tagFilter, setNodes, setEdges]);

  const selected = characters.find((c) => c.id === selectedId) || null;
  useEffect(() => {
    setForm(selected ? { ...selected, relations: [...(selected.relations || [])] } : null);
  }, [selectedId, selected?.path]);

  const dirsAbs = vaultPath ? projectDirs(vaultPath, dirs) : null;

  const saveCharacter = useCallback(
    async (c: Character, pos?: { x: number; y: number }) => {
      if (!dirsAbs) return;
      const data = characterData(c);
      if (pos) {
        data.x = Math.round(pos.x);
        data.y = Math.round(pos.y);
      } else {
        if (Number.isFinite(c.data?.x)) data.x = c.data.x;
        if (Number.isFinite(c.data?.y)) data.y = c.data.y;
      }
      await writeEntity(data, c.body || `# ${c.name}\n\n`, c.path);
    },
    [dirsAbs]
  );

  async function onNodeDragStop(_: any, node: Node) {
    const c = characters.find((x) => x.id === node.id);
    if (!c) return;
    await saveCharacter(c, node.position);
  }

  async function createCharacter() {
    if (!dirsAbs || !newName.trim()) return;
    const name = newName.trim();
    const path = joinPath(dirsAbs.characters, safeFileName(name) + ".md");
    await writeEntity(
      characterData({
        name,
        aliases: [],
        role: "",
        tags: [],
        color: "#8b5cf6",
        relations: [],
      }),
      `# ${name}\n\n`,
      path
    );
    toast.success("已创建人物：" + name);
    setNewName("");
    setAddOpen(false);
    await refresh(vaultPath, dirs);
    setSelectedId(safeFileName(name));
  }

  async function handleSaveForm() {
    if (!form) return;
    await saveCharacter(form);
    toast.success("已保存");
    await refresh(vaultPath, dirs);
  }

  async function handleDelete() {
    if (!form) return;
    if (!confirm(`确认删除人物「${form.name}」？该 .md 文件将被删除。`)) return;
    await deleteEntity(form.path);
    setSelectedId(null);
    toast.success("已删除");
    await refresh(vaultPath, dirs);
  }

  if (!vaultPath) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="人物关系" />
        <Empty title="请先在设置中连接 vault" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="人物关系"
        subtitle={`${characters.length} 个人物 · 拖拽节点可调整布局并自动保存`}
        actions={
          <>
            <div className="flex items-center gap-1.5">
              <Filter size={14} className="text-ink-400" />
              <select
                className="input py-1"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">全部标签</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-primary" onClick={() => setAddOpen(true)}>
              <UserPlus size={15} /> 添加人物
            </button>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {characters.length === 0 ? (
            <Empty
              title="还没有人物"
              hint="点击右上角「添加人物」开始构建你的人物关系网。"
            />
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          )}
        </div>

        {/* Inspector */}
        {form && (
          <div className="w-80 shrink-0 overflow-y-auto border-l border-ink-200 p-4 dark:border-ink-800">
            <Inspector
              form={form}
              characters={characters}
              setForm={setForm}
              onSave={handleSaveForm}
              onDelete={handleDelete}
            />
          </div>
        )}
      </div>

      <Modal
        open={addOpen}
        title="添加人物"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>
              取消
            </button>
            <button className="btn-primary" onClick={createCharacter}>
              创建
            </button>
          </>
        }
      >
        <label className="label">人物名</label>
        <input
          autoFocus
          className="input mt-1"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createCharacter()}
          placeholder="例如：林清欢"
        />
      </Modal>
    </div>
  );
}

function Inspector({
  form,
  characters,
  setForm,
  onSave,
  onDelete,
}: {
  form: Character;
  characters: Character[];
  setForm: (c: Character) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const others = characters.filter((c) => c.id !== form.id);

  function addRelation() {
    const target = others[0]?.id || "";
    setForm({ ...form, relations: [...form.relations, { target, type: "朋友", desc: "" }] });
  }
  function updateRelation(i: number, patch: Partial<Relation>) {
    const rels = form.relations.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    setForm({ ...form, relations: rels });
  }
  function removeRelation(i: number) {
    setForm({ ...form, relations: form.relations.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">编辑人物</h3>
        <div className="flex gap-1">
          <button className="btn-primary px-2 py-1 text-xs" onClick={onSave}>
            <Save size={13} /> 保存
          </button>
          <button className="btn-outline px-2 py-1 text-xs text-rose-500" onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div>
        <label className="label">姓名</label>
        <input
          className="input mt-1"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label">身份/角色</label>
          <input
            className="input mt-1"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            placeholder="主角 / 反派…"
          />
        </div>
        <div>
          <label className="label">颜色</label>
          <input
            type="color"
            className="mt-1 h-9 w-12 cursor-pointer rounded border border-ink-200 bg-transparent dark:border-ink-700"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="label">别名（逗号分隔）</label>
        <input
          className="input mt-1"
          value={form.aliases.join(", ")}
          onChange={(e) =>
            setForm({ ...form, aliases: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })
          }
        />
      </div>
      <div>
        <label className="label">标签（逗号分隔）</label>
        <input
          className="input mt-1"
          value={form.tags.join(", ")}
          onChange={(e) =>
            setForm({ ...form, tags: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })
          }
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label">人物关系</label>
          <button className="btn-ghost px-1.5 py-1 text-xs" onClick={addRelation} disabled={others.length === 0}>
            <Plus size={13} /> 添加
          </button>
        </div>
        <div className="mt-1 space-y-2">
          {form.relations.length === 0 && (
            <p className="text-xs text-ink-400">暂无关系</p>
          )}
          {form.relations.map((r, i) => (
            <div key={i} className="rounded-md border border-ink-200 p-2 dark:border-ink-700">
              <div className="flex gap-1.5">
                <select
                  className="input py-1 text-xs"
                  value={r.target}
                  onChange={(e) => updateRelation(i, { target: e.target.value })}
                >
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input w-24 py-1 text-xs"
                  value={r.type}
                  onChange={(e) => updateRelation(i, { type: e.target.value })}
                  placeholder="关系"
                />
                <button className="btn-ghost px-1 text-rose-500" onClick={() => removeRelation(i)}>
                  <Trash2 size={13} />
                </button>
              </div>
              <input
                className="input mt-1.5 py-1 text-xs"
                value={r.desc || ""}
                onChange={(e) => updateRelation(i, { desc: e.target.value })}
                placeholder="关系备注（可选）"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">人设描述</label>
        <textarea
          className="input mt-1 min-h-[120px] resize-y font-mono text-xs"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
      </div>
    </div>
  );
}
