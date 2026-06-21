import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  GitBranch,
  Grid3x3,
  Library,
  BookUp,
  Settings,
  Moon,
  Sun,
  Plug,
  RefreshCw,
  Map,
} from "lucide-react";
import { useSettings } from "../store/settings";
import { useVault } from "../store/vault";
import { baseName } from "../lib/fs";

const NAV = [
  { to: "/", label: "概览", icon: LayoutDashboard, end: true },
  { to: "/characters", label: "人物关系", icon: Users },
  { to: "/timeline", label: "剧情线", icon: GitBranch },
  { to: "/matrix", label: "剧情矩阵", icon: Grid3x3 },
  { to: "/worldview", label: "世界观", icon: Map },
  { to: "/materials", label: "素材库", icon: Library },
  { to: "/epub", label: "EPUB 导入", icon: BookUp },
];

export default function Sidebar() {
  const { vaultPath, theme, toggleTheme, dirs } = useSettings();
  const { connected, loading, refresh } = useVault();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-600 font-bold text-white">
          墨
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">墨链</div>
          <div className="text-[11px] text-ink-400">小说创作助手</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={(n as any).end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-accent-600/10 font-medium text-accent-500"
                  : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              }`
            }
          >
            <n.icon size={17} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-ink-200 p-3 dark:border-ink-800">
        <div className="flex items-center gap-1.5 text-[11px]">
          <Plug
            size={12}
            className={connected ? "text-emerald-500" : "text-ink-400"}
          />
          <span className="truncate text-ink-400" title={vaultPath}>
            {vaultPath ? baseName(vaultPath) : "未连接 Vault"}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            className="btn-outline flex-1 px-2 py-1.5 text-xs"
            onClick={() => refresh(vaultPath, dirs)}
            disabled={!vaultPath || loading}
            title="刷新"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            刷新
          </button>
          <button
            className="btn-outline px-2 py-1.5 text-xs"
            onClick={toggleTheme}
            title="切换主题"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <NavLink to="/settings" className="btn-outline px-2 py-1.5 text-xs" title="设置">
            <Settings size={14} />
          </NavLink>
        </div>
      </div>
    </aside>
  );
}
