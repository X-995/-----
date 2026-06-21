use base64::Engine;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, State};
use walkdir::WalkDir;

#[derive(Default)]
struct WatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Serialize, Clone)]
struct FileEntry {
    path: String,
    name: String,
    rel: String,
    is_dir: bool,
    ext: String,
}

#[derive(Serialize, Clone)]
struct WatchEvent {
    kind: String,
    paths: Vec<String>,
}

fn norm(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read {}: {}", path, e))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("write {}: {}", path, e))
}

#[tauri::command]
fn read_binary_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read {}: {}", path, e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn write_binary_base64(path: String, data: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&to).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

/// List markdown (and optionally all) files under a directory, recursively.
#[tauri::command]
fn list_dir(root: String, exts: Vec<String>) -> Result<Vec<FileEntry>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in WalkDir::new(&root_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let p = entry.path();
        // Skip hidden app/system folders
        if p.components().any(|c| {
            let s = c.as_os_str().to_string_lossy();
            s == ".git" || s == ".obsidian" || s == "node_modules"
        }) {
            continue;
        }
        let is_dir = entry.file_type().is_dir();
        let ext = p
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if !is_dir && !exts.is_empty() && !exts.contains(&ext) {
            continue;
        }
        let rel = p
            .strip_prefix(&root_path)
            .map(|r| norm(r))
            .unwrap_or_else(|_| norm(p));
        out.push(FileEntry {
            path: norm(p),
            name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
            rel,
            is_dir,
            ext,
        });
    }
    Ok(out)
}

#[tauri::command]
fn start_watch(
    app: tauri::AppHandle,
    state: State<WatcherState>,
    path: String,
) -> Result<(), String> {
    let watch_path = PathBuf::from(&path);
    if !watch_path.exists() {
        return Err(format!("path not found: {}", path));
    }
    let app_handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let kind = format!("{:?}", event.kind);
            let paths: Vec<String> = event.paths.iter().map(|p| norm(p)).collect();
            // Ignore changes inside system/hidden folders
            if paths.iter().any(|p| {
                p.contains("/.git/") || p.contains("/.obsidian/") || p.contains("/node_modules/")
            }) {
                return;
            }
            let _ = app_handle.emit("vault-change", WatchEvent { kind, paths });
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&watch_path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let mut guard = state.watcher.lock().map_err(|e| e.to_string())?;
    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
fn stop_watch(state: State<WatcherState>) -> Result<(), String> {
    let mut guard = state.watcher.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .manage(WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            read_binary_base64,
            write_binary_base64,
            path_exists,
            ensure_dir,
            delete_path,
            rename_path,
            list_dir,
            start_watch,
            stop_watch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
