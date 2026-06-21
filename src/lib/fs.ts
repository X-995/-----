import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface FileEntry {
  path: string;
  name: string;
  rel: string;
  is_dir: boolean;
  ext: string;
}

export interface WatchEvent {
  kind: string;
  paths: string[];
}

export const readTextFile = (path: string) =>
  invoke<string>("read_text_file", { path });

export const writeTextFile = (path: string, contents: string) =>
  invoke<void>("write_text_file", { path, contents });

export const readBinaryBase64 = (path: string) =>
  invoke<string>("read_binary_base64", { path });

export const writeBinaryBase64 = (path: string, data: string) =>
  invoke<void>("write_binary_base64", { path, data });

export const pathExists = (path: string) =>
  invoke<boolean>("path_exists", { path });

export const ensureDir = (path: string) => invoke<void>("ensure_dir", { path });

export const deletePath = (path: string) => invoke<void>("delete_path", { path });

export const renamePath = (from: string, to: string) =>
  invoke<void>("rename_path", { from, to });

export const listDir = (root: string, exts: string[] = []) =>
  invoke<FileEntry[]>("list_dir", { root, exts });

export const startWatch = (path: string) => invoke<void>("start_watch", { path });
export const stopWatch = () => invoke<void>("stop_watch");

export const onVaultChange = (cb: (e: WatchEvent) => void): Promise<UnlistenFn> =>
  listen<WatchEvent>("vault-change", (event) => cb(event.payload));

export async function pickFolder(): Promise<string | null> {
  const result = await openDialog({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

export async function pickFile(
  filters?: { name: string; extensions: string[] }[]
): Promise<string | null> {
  const result = await openDialog({ directory: false, multiple: false, filters });
  return typeof result === "string" ? result : null;
}

export async function pickSave(
  defaultPath?: string,
  filters?: { name: string; extensions: string[] }[]
): Promise<string | null> {
  const result = await saveDialog({ defaultPath, filters });
  return result ?? null;
}

/** Join path segments using forward slashes (works on Windows in Tauri). */
export function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((p) => p.replace(/[\\/]+$/g, ""))
    .join("/");
}

export function baseName(path: string): string {
  const p = path.replace(/[\\/]+$/g, "");
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

export function stemName(path: string): string {
  const b = baseName(path);
  const dot = b.lastIndexOf(".");
  return dot > 0 ? b.slice(0, dot) : b;
}
