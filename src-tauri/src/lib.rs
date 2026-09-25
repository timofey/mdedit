use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct AppState {
    initial_files: Mutex<Vec<String>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Serialize)]
struct MdFile {
    name: String,
    path: String,
}

/// Turns command-line arguments into absolute file paths, resolved against `cwd`.
fn resolve_args(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<String> {
    args.into_iter()
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(&a);
            let abs = if p.is_absolute() { p } else { cwd.join(p) };
            fs::canonicalize(&abs).unwrap_or(abs)
        })
        .filter(|p| !p.is_dir())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
fn initial_files(state: State<AppState>) -> Vec<String> {
    std::mem::take(&mut *state.initial_files.lock().unwrap())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(err)?;
    Ok(String::from_utf8(bytes).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned()))
}

/// Atomic write: write a sibling temp file, then rename over the target.
/// Follows symlinks and keeps the original file's permissions.
#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    let target = fs::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));
    let dir = target.parent().ok_or("invalid path")?;
    let name = target.file_name().ok_or("invalid path")?.to_string_lossy();
    let tmp = dir.join(format!(".{name}.mdedit-tmp"));
    fs::write(&tmp, content.as_bytes()).map_err(err)?;
    if let Ok(meta) = fs::metadata(&target) {
        let _ = fs::set_permissions(&tmp, meta.permissions());
    }
    fs::rename(&tmp, &target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        err(e)
    })
}

#[tauri::command]
fn list_md_files(dir: String) -> Result<Vec<MdFile>, String> {
    let mut files: Vec<MdFile> = fs::read_dir(&dir)
        .map_err(err)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter_map(|e| {
            let path = e.path();
            let ext = path.extension()?.to_string_lossy().to_lowercase();
            if !matches!(ext.as_str(), "md" | "markdown" | "mdown" | "mkd") {
                return None;
            }
            Some(MdFile {
                name: e.file_name().to_string_lossy().into_owned(),
                path: path.to_string_lossy().into_owned(),
            })
        })
        .collect();
    files.sort_by_key(|f| f.name.to_lowercase());
    Ok(files)
}

/// Installed font families (via fontconfig), sorted and de-duplicated.
/// `mono` limits the list to monospaced fonts.
#[tauri::command]
fn list_fonts(mono: bool) -> Vec<String> {
    let pattern = if mono { ":spacing=mono" } else { ":" };
    let Ok(out) = std::process::Command::new("fc-list").args([pattern, "family"]).output() else {
        return Vec::new();
    };
    let mut families: Vec<String> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| l.split(',').next())
        .map(|f| f.trim().replace('\\', ""))
        .filter(|f| !f.is_empty() && !f.starts_with('.'))
        .collect();
    families.sort_by_key(|f| f.to_lowercase());
    families.dedup();
    families
}

/// Replaces the set of watched directories (non-recursive). Changes are emitted as `fs-changed`.
#[tauri::command]
fn watch_dirs(app: AppHandle, state: State<AppState>, dirs: Vec<String>) -> Result<(), String> {
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, notify::EventKind::Access(_)) {
                return;
            }
            let paths: Vec<String> = ev
                .paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .filter(|p| !p.ends_with(".mdedit-tmp"))
                .collect();
            if !paths.is_empty() {
                let _ = handle.emit("fs-changed", paths);
            }
        }
    })
    .map_err(err)?;
    for d in &dirs {
        let _ = watcher.watch(Path::new(d), RecursiveMode::NonRecursive);
    }
    *state.watcher.lock().unwrap() = Some(watcher);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cwd = std::env::current_dir().unwrap_or_default();
    let state = AppState::default();
    *state.initial_files.lock().unwrap() = resolve_args(std::env::args().skip(1), &cwd);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let files = resolve_args(argv.into_iter().skip(1), Path::new(&cwd));
            let _ = app.emit("open-files", files);
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            initial_files,
            read_file,
            write_file,
            list_md_files,
            list_fonts,
            watch_dirs
        ])
        .run(tauri::generate_context!())
        .expect("error while running mdedit");
}
