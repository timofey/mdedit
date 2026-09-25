use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

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
            dunce::canonicalize(&abs).unwrap_or(abs)
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
    let target = dunce::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));
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

/// Installed font families as (all, monospaced), sorted and de-duplicated.
/// Scanning takes a moment, so it's done once, off the main thread.
fn font_families() -> &'static (Vec<String>, Vec<String>) {
    static FAMILIES: OnceLock<(Vec<String>, Vec<String>)> = OnceLock::new();
    FAMILIES.get_or_init(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        let mut all = Vec::new();
        let mut mono = Vec::new();
        for face in db.faces() {
            let Some((family, _)) = face.families.first() else { continue };
            if family.is_empty() || family.starts_with('.') {
                continue; // e.g. macOS private system fonts
            }
            if face.monospaced && !family.contains("Emoji") {
                mono.push(family.clone());
            }
            all.push(family.clone());
        }
        for list in [&mut all, &mut mono] {
            list.sort_by_key(|f| f.to_lowercase());
            list.dedup();
        }
        (all, mono)
    })
}

#[tauri::command]
async fn list_fonts(mono: bool) -> Vec<String> {
    let (all, monospaced) = font_families();
    if mono { monospaced.clone() } else { all.clone() }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_installed_fonts() {
        let (all, mono) = font_families();
        assert!(!all.is_empty(), "no fonts found");
        assert!(mono.iter().all(|f| all.contains(f)), "monospaced fonts must be in the full list");
        if std::env::var_os("SHOW_FONTS").is_some() {
            println!("all={} mono={}\nmono: {:?}", all.len(), mono.len(), mono);
        }
    }

    #[test]
    fn resolves_args_without_verbatim_prefix() {
        let cwd = std::env::temp_dir();
        let file = cwd.join("mdedit-args-test.md");
        fs::write(&file, "x").unwrap();
        let out = resolve_args(["mdedit-args-test.md".to_string(), "--flag".to_string()], &cwd);
        fs::remove_file(&file).unwrap();
        assert_eq!(out.len(), 1);
        assert!(!out[0].starts_with(r"\\?\"), "{}", out[0]);
        assert!(out[0].ends_with("mdedit-args-test.md"));
    }
}
