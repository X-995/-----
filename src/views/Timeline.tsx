import { useEffect, useMemo, useRef, useState } from "react";
import { Timeline } from "vis-timeline/standalone";
import { DataSet } from "vis-data";
import { GitBranchPlus, CalendarPlus, Save, Trash2, Maximize2, Search } from "lucide-react";
import PageHeader from "../components/PageHeader";
import Empty from "../components/Empty";
import Modal from "../components/Modal";
import { useSettings } from "../store/settings";
import { useVault } from "../store/vault";
import { PlotEvent, Plotline } from "../types";
import {
  deleteEntity,
  eventData,
  plotlineData,
  projectDirs,
  safeFileName,
  writeEntity,
} from "../lib/vault";
import { joinPath } from "../lib/fs";
import { toast } from "../store/toast";

const NO_LINE = "__none__";

export default function TimelineView() {
  const { vaultPath, dirs } = useSettings();
  const { events, plotlines, characters, refresh } = useVault();
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);

  const [editEvent, setEditEvent] = useState<PlotEvent | null>(null);
  const [editLine, setEditLine] = useState<Plotline | null>(null);
  const [sideTab, setSideTab] = useState<"lines" | "events">("lines");
  const [eventSearch, setEventSearch] = useState("");

  function focusEvent(path: string) {
    timelineRef.current?.focus(path, { animation: { duration: 500, easingFunction: "easeInOutQuad" } });
    timelineRef.current?.setSelection([path]);
    const ev = events.find((e) => e.path === path);
    if (ev) setEditEvent({ ...ev });
  }

  function fitAll() {
    timelineRef.current?.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
  }

  const dirsAbs = vaultPath ? projectDirs(vaultPath, dirs) : null;

  const groups = useMemo(() => {
    const g = plotlines.map((p) => ({
      id: p.id,
      content: `<span style="border-left:3px solid ${p.color};padding-left:6px">${p.name}</span>`,
    }));
    g.push({ id: NO_LINE, content: "未分线" });
    return g;
  }, [plotlines]);

  // (Re)build the timeline whenever data changes
  useEffect(() => {
    if (!containerRef.current) return;

    // vis-timeline treats `start` as a Date/timestamp; we scale order → days
    // so each event is 1 day apart on the axis, keeping labels as #1 #2 #3 …
    const MS_PER_SLOT = 86400000; // 1 day in ms
    const items = new DataSet(
      events.map((e) => {
        const line = plotlines.find((p) => p.id === e.plotline);
        return {
          id: e.path,
          group: e.plotline && plotlines.some((p) => p.id === e.plotline) ? e.plotline : NO_LINE,
          content: `<span class="tl-item">#${e.order} ${e.title}</span>`,
          start: e.order * MS_PER_SLOT,
          style: line ? `background-color:${line.color}22;border-color:${line.color}` : "",
        };
      })
    );
    const groupSet = new DataSet(groups as any);

    if (!timelineRef.current) {
      timelineRef.current = new Timeline(containerRef.current, items as any, groupSet as any, {
        editable: { updateTime: true, updateGroup: true, add: false, remove: false },
        orientation: "top",
        stack: true,
        zoomMin: MS_PER_SLOT / 2,
        margin: { item: 10 },
        format: {
          minorLabels: (date: any) => `#${Math.round(Number(date) / MS_PER_SLOT)}`,
          majorLabels: () => "",
        } as any,
      });

      timelineRef.current.on("doubleClick", (props: any) => {
        if (props.item) {
          const ev = events.find((e) => e.path === props.item);
          if (ev) setEditEvent({ ...ev });
        }
      });

      timelineRef.current.on("select", (props: any) => {
        if (props.items?.length) {
          const ev = events.find((e) => e.path === props.items[0]);
          if (ev) setEditEvent({ ...ev });
        }
      });
    } else {
      timelineRef.current.setGroups(groupSet as any);
      timelineRef.current.setItems(items as any);
    }

    // persist drag changes (order + group)
    const onChanged = async () => {
      const data = items.get();
      for (const it of data as any[]) {
        const ev = events.find((e) => e.path === it.id);
        if (!ev) continue;
        const newOrder = Math.round(Number(it.start) / MS_PER_SLOT);
        const newLine = it.group === NO_LINE ? undefined : it.group;
        if (newOrder !== ev.order || newLine !== ev.plotline) {
          await writeEntity(
            eventData({ ...ev, order: newOrder, plotline: newLine }),
            ev.body,
            ev.path
          );
        }
      }
      await refresh(vaultPath, dirs);
    };
    (items as any).on("update", () => {
      /* user drag triggers update; debounce via timeout */
      clearTimeout((window as any).__tl_t);
      (window as any).__tl_t = setTimeout(onChanged, 500);
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, plotlines, groups]);

  useEffect(() => {
    return () => {
      timelineRef.current?.destroy();
      timelineRef.current = null;
    };
  }, []);

  async function addEvent() {
    if (!dirsAbs) return;
    const maxOrder = events.reduce((m, e) => Math.max(m, e.order), 0);
    const title = "新事件";
    const path = joinPath(dirsAbs.events, safeFileName(title + " " + (maxOrder + 1)) + ".md");
    await writeEntity(
      eventData({ title, order: maxOrder + 1, characters: [], summary: "" }),
      "",
      path
    );
    await refresh(vaultPath, dirs);
    toast.success("已添加事件");
  }

  async function addPlotline() {
    if (!dirsAbs) return;
    const name = "新剧情线";
    const palette = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
    const path = joinPath(dirsAbs.plotlines, safeFileName(name + " " + (plotlines.length + 1)) + ".md");
    await writeEntity(
      plotlineData({ name, color: palette[plotlines.length % palette.length], description: "" }),
      "",
      path
    );
    await refresh(vaultPath, dirs);
    toast.success("已添加剧情线");
  }

  if (!vaultPath) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="剧情线" />
        <Empty title="请先在设置中连接 vault" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="剧情线 / 时间轴"
        subtitle="#N 为事件顺序编号，拖拽事件可调整顺序与所属剧情线，双击事件编辑详情"
        actions={
          <>
            <button className="btn-outline" onClick={fitAll} title="适应全图">
              <Maximize2 size={15} /> 适应全图
            </button>
            <button className="btn-outline" onClick={addPlotline}>
              <GitBranchPlus size={15} /> 新剧情线
            </button>
            <button className="btn-primary" onClick={addEvent}>
              <CalendarPlus size={15} /> 新事件
            </button>
          </>
        }
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden p-3">
          {events.length === 0 && plotlines.length === 0 ? (
            <Empty
              title="还没有剧情线和事件"
              hint="先新建一条剧情线，再添加事件，即可在时间轴上编排你的故事。"
            />
          ) : (
            <div ref={containerRef} className="h-full w-full" />
          )}
        </div>

        {/* right panel: tabs for plotlines / event list */}
        <div className="w-64 shrink-0 flex flex-col border-l border-ink-200 dark:border-ink-800">
          {/* tab switcher */}
          <div className="flex border-b border-ink-200 dark:border-ink-800">
            <button
              className={`flex-1 py-2 text-xs font-medium ${sideTab === "lines" ? "border-b-2 border-accent-500 text-accent-500" : "text-ink-400 hover:text-ink-600"}`}
              onClick={() => setSideTab("lines")}
            >
              剧情线
            </button>
            <button
              className={`flex-1 py-2 text-xs font-medium ${sideTab === "events" ? "border-b-2 border-accent-500 text-accent-500" : "text-ink-400 hover:text-ink-600"}`}
              onClick={() => setSideTab("events")}
            >
              事件列表
            </button>
          </div>

          {sideTab === "lines" ? (
            <div className="flex-1 overflow-y-auto space-y-2 p-3">
              {plotlines.map((p) => (
                <button
                  key={p.path}
                  className="flex w-full items-center gap-2 rounded-md border border-ink-200 px-2 py-1.5 text-left text-sm hover:border-accent-500 dark:border-ink-700"
                  onClick={() => setEditLine({ ...p })}
                >
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
              {plotlines.length === 0 && <p className="text-xs text-ink-400">暂无剧情线</p>}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-2 border-b border-ink-200 dark:border-ink-800">
                <div className="relative">
                  <Search size={13} className="absolute left-2 top-2 text-ink-400" />
                  <input
                    className="input py-1 pl-6 text-xs"
                    placeholder="搜索事件…"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {events
                  .filter((e) => !eventSearch || e.title.includes(eventSearch) || String(e.order).includes(eventSearch))
                  .map((e) => {
                    const line = plotlines.find((p) => p.id === e.plotline);
                    return (
                      <button
                        key={e.path}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-ink-100 dark:hover:bg-ink-800"
                        onClick={() => focusEvent(e.path)}
                      >
                        <span className="shrink-0 w-6 text-center font-mono text-ink-400">#{e.order}</span>
                        {line && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: line.color }} />}
                        <span className="truncate">{e.title}</span>
                      </button>
                    );
                  })}
                {events.length === 0 && <p className="text-xs text-ink-400 px-2">暂无事件</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {editEvent && (
        <EventModal
          event={editEvent}
          plotlines={plotlines}
          characters={characters.map((c) => c.name)}
          onClose={() => setEditEvent(null)}
          onSaved={async () => {
            setEditEvent(null);
            await refresh(vaultPath, dirs);
          }}
        />
      )}
      {editLine && (
        <PlotlineModal
          line={editLine}
          onClose={() => setEditLine(null)}
          onSaved={async () => {
            setEditLine(null);
            await refresh(vaultPath, dirs);
          }}
        />
      )}
    </div>
  );
}

function EventModal({
  event,
  plotlines,
  characters,
  onClose,
  onSaved,
}: {
  event: PlotEvent;
  plotlines: Plotline[];
  characters: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<PlotEvent>(event);

  async function save() {
    await writeEntity(eventData(f), f.body, f.path);
    toast.success("已保存事件");
    onSaved();
  }
  async function del() {
    if (!confirm(`删除事件「${f.title}」？`)) return;
    await deleteEntity(f.path);
    toast.success("已删除");
    onSaved();
  }

  return (
    <Modal
      open
      title="编辑事件"
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline mr-auto text-rose-500" onClick={del}>
            <Trash2 size={15} /> 删除
          </button>
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={save}>
            <Save size={15} /> 保存
          </button>
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
            <label className="label">顺序 (order)</label>
            <input
              type="number"
              className="input mt-1"
              value={f.order}
              onChange={(e) => setF({ ...f, order: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">所属剧情线</label>
            <select
              className="input mt-1"
              value={f.plotline || ""}
              onChange={(e) => setF({ ...f, plotline: e.target.value || undefined })}
            >
              <option value="">未分线</option>
              {plotlines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">关联章节</label>
            <input className="input mt-1" value={f.chapter || ""} onChange={(e) => setF({ ...f, chapter: e.target.value })} />
          </div>
          <div>
            <label className="label">时间标注（可选）</label>
            <input className="input mt-1" value={f.date || ""} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">出场人物（逗号分隔）</label>
          <input
            className="input mt-1"
            value={f.characters.join(", ")}
            onChange={(e) => setF({ ...f, characters: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
            list="char-list"
          />
          <datalist id="char-list">
            {characters.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label">事件梗概</label>
          <textarea
            className="input mt-1 min-h-[100px] resize-y"
            value={f.summary}
            onChange={(e) => setF({ ...f, summary: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}

function PlotlineModal({
  line,
  onClose,
  onSaved,
}: {
  line: Plotline;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Plotline>(line);
  async function save() {
    await writeEntity(plotlineData(f), f.body, f.path);
    toast.success("已保存剧情线");
    onSaved();
  }
  async function del() {
    if (!confirm(`删除剧情线「${f.name}」？事件不会被删除，但会变为未分线。`)) return;
    await deleteEntity(f.path);
    toast.success("已删除");
    onSaved();
  }
  return (
    <Modal
      open
      title="编辑剧情线"
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline mr-auto text-rose-500" onClick={del}>
            <Trash2 size={15} /> 删除
          </button>
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={save}>
            <Save size={15} /> 保存
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="label">名称</label>
            <input className="input mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div>
            <label className="label">颜色</label>
            <input
              type="color"
              className="mt-1 h-9 w-12 cursor-pointer rounded border border-ink-200 bg-transparent dark:border-ink-700"
              value={f.color}
              onChange={(e) => setF({ ...f, color: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="label">描述</label>
          <textarea
            className="input mt-1 min-h-[100px] resize-y"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}
