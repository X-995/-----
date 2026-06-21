import { useEffect, useMemo, useState } from "react";
import * as echarts from "echarts";
import { Link } from "react-router-dom";
import {
  Users,
  GitBranch,
  Grid3x3,
  Library,
  BookUp,
  FolderOpen,
  Settings as SettingsIcon,
  Map,
  Flame,
  Target,
  Pencil,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import Empty from "../components/Empty";
import EChart from "../components/EChart";
import { useSettings } from "../store/settings";
import { useVault } from "../store/vault";
import { useStats } from "../store/stats";

export default function Dashboard() {
  const { vaultPath, dirs, dailyGoal, setDailyGoal } = useSettings();
  const v = useVault();
  const stats = useStats();
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(dailyGoal));

  // Update stats whenever chapters change
  useEffect(() => {
    if (vaultPath && v.chapters.length >= 0) {
      stats.update(vaultPath, dirs.root, v.chapters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, v.chapters]);

  const todayWords = stats.todayWords();
  const progress = Math.min(1, dailyGoal > 0 ? todayWords / dailyGoal : 0);
  const streakCount = stats.streak(dailyGoal);
  const recentDays = stats.recentDays(7);

  const barOption = useMemo<echarts.EChartsOption>(() => ({
    grid: { left: 30, right: 8, top: 8, bottom: 24 },
    xAxis: {
      type: "category",
      data: recentDays.map((d) => d.date.slice(5)),
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series: [
      {
        type: "bar",
        data: recentDays.map((d) => ({
          value: d.words,
          itemStyle: {
            color: d.words >= dailyGoal ? "#10b981" : "#7c3aed",
          },
        })),
        markLine: {
          data: [{ yAxis: dailyGoal }],
          label: { show: false },
          lineStyle: { color: "#f59e0b", type: "dashed" },
        },
      },
    ],
    tooltip: { trigger: "axis" },
  }), [recentDays, dailyGoal]);

  const statItems = [
    { to: "/characters", label: "人物", count: v.characters.length, icon: Users },
    { to: "/timeline", label: "事件", count: v.events.length, icon: GitBranch },
    { to: "/timeline", label: "剧情线", count: v.plotlines.length, icon: GitBranch },
    { to: "/matrix", label: "章节", count: v.chapters.length, icon: Grid3x3 },
    { to: "/materials", label: "素材", count: v.materials.length, icon: Library },
    { to: "/worldview", label: "世界观", count: (v as any).worldviews?.length ?? 0, icon: Map },
  ];

  if (!vaultPath) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="概览" />
        <Empty
          icon={<FolderOpen size={48} className="opacity-40" />}
          title="还没有连接 Obsidian vault"
          hint="前往设置选择你的 vault 文件夹，应用会在其中创建小说项目目录，并与 Obsidian 双向同步。"
          action={
            <Link to="/settings" className="btn-primary mt-2">
              <SettingsIcon size={16} /> 前往设置
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="概览"
        subtitle={vaultPath}
        actions={v.error ? <span className="text-sm text-rose-500">{v.error}</span> : null}
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Daily goal card */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-accent-500" />
              <h3 className="font-semibold">今日写作目标</h3>
              {streakCount > 1 && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500">
                  <Flame size={12} /> {streakCount} 天连续达标
                </span>
              )}
            </div>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setEditingGoal(!editingGoal); setGoalInput(String(dailyGoal)); }}>
              <Pencil size={13} /> 修改目标
            </button>
          </div>

          {editingGoal && (
            <div className="mb-4 flex items-center gap-2">
              <input
                type="number"
                min={100}
                className="input max-w-[140px]"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = parseInt(goalInput);
                    if (n > 0) { setDailyGoal(n); setEditingGoal(false); }
                  }
                }}
              />
              <button className="btn-primary text-xs" onClick={() => {
                const n = parseInt(goalInput);
                if (n > 0) { setDailyGoal(n); setEditingGoal(false); }
              }}>确定</button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Progress ring + numbers */}
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" strokeWidth="8" className="stroke-ink-100 dark:stroke-ink-800" />
                  <circle
                    cx="40" cy="40" r="32" fill="none" strokeWidth="8"
                    stroke={progress >= 1 ? "#10b981" : "#7c3aed"}
                    strokeDasharray={`${progress * 201} 201`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-base font-bold">{Math.round(progress * 100)}%</span>
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold">{todayWords.toLocaleString()}</div>
                <div className="text-sm text-ink-400">/ {dailyGoal.toLocaleString()} 字</div>
                <div className="mt-1 text-xs text-ink-400">
                  {progress >= 1 ? "🎉 已完成今日目标！" : `还差 ${(dailyGoal - todayWords).toLocaleString()} 字`}
                </div>
              </div>
            </div>

            {/* 7-day bar chart */}
            <div>
              <div className="text-xs text-ink-400 mb-1">近 7 天（虚线=目标）</div>
              <EChart option={barOption} height={100} />
            </div>
          </div>
        </div>

        {/* Entity stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {statItems.map((st) => (
            <Link key={st.label} to={st.to} className="card p-4 hover:border-accent-500">
              <st.icon size={20} className="text-accent-500" />
              <div className="mt-3 text-3xl font-bold">{st.count}</div>
              <div className="text-sm text-ink-400">{st.label}</div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-3 font-semibold">快速开始</h3>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/characters" className="btn-outline justify-start">
                <Users size={15} /> 添加人物
              </Link>
              <Link to="/timeline" className="btn-outline justify-start">
                <GitBranch size={15} /> 编排剧情线
              </Link>
              <Link to="/matrix" className="btn-outline justify-start">
                <Grid3x3 size={15} /> 分析章节
              </Link>
              <Link to="/epub" className="btn-outline justify-start">
                <BookUp size={15} /> 导入 EPUB
              </Link>
              <Link to="/worldview" className="btn-outline justify-start">
                <Map size={15} /> 世界观设定
              </Link>
              <Link to="/materials" className="btn-outline justify-start">
                <Library size={15} /> 素材库
              </Link>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 font-semibold">最近章节</h3>
            {v.chapters.length === 0 ? (
              <p className="text-sm text-ink-400">暂无章节。可在剧情矩阵中新建或从 EPUB 导入。</p>
            ) : (
              <ul className="space-y-1.5">
                {v.chapters.slice(0, 6).map((c) => (
                  <li key={c.path} className="flex items-center justify-between text-sm">
                    <span className="truncate">
                      <span className="text-ink-400">#{c.index} </span>
                      {c.title}
                    </span>
                    <span className="text-xs text-ink-400">
                      {Object.keys(c.matrix).length} 维已评
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
