import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Toaster from "./components/Toaster";
import Dashboard from "./views/Dashboard";
import Characters from "./views/Characters";
import Timeline from "./views/Timeline";
import Matrix from "./views/Matrix";
import Materials from "./views/Materials";
import EpubImport from "./views/EpubImport";
import SettingsView from "./views/Settings";
import WorldviewView from "./views/Worldview";
import { useSettings } from "./store/settings";
import { useVault } from "./store/vault";

function ThemeAndConnect() {
  const { theme, vaultPath, dirs } = useSettings();
  const connect = useVault((s) => s.connect);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  useEffect(() => {
    if (vaultPath) connect(vaultPath, dirs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath]);

  return null;
}

export default function App() {
  return (
    <HashRouter>
      <ThemeAndConnect />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/characters" element={<Characters />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/matrix" element={<Matrix />} />
            <Route path="/materials" element={<Materials />} />
            <Route path="/epub" element={<EpubImport />} />
            <Route path="/worldview" element={<WorldviewView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </HashRouter>
  );
}
