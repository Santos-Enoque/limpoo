use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use sysinfo::Disks;
use tauri::Emitter;

#[derive(Serialize, Clone)]
pub struct DiskInfo {
    id: String,
    name: String,
    mount_point: String,
    total: u64,
    free: u64,
    is_removable: bool,
}

#[derive(Serialize, Clone)]
pub struct DirEntry {
    id: String,
    name: String,
    path: String,
    size: u64,
    is_dir: bool,
    children: Option<Vec<DirEntry>>,
}

#[tauri::command]
fn list_disks() -> Vec<DiskInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut seen_mounts = std::collections::HashSet::new();

    disks
        .iter()
        .filter_map(|disk| {
            let raw_mount = disk.mount_point().to_string_lossy().to_string();

            // Skip VM and dev mounts
            if raw_mount.starts_with("/dev") || raw_mount.starts_with("/private/var/vm") {
                return None;
            }

            // Normalize: treat /System/Volumes/Data as root "/"
            let mount = if raw_mount == "/System/Volumes/Data" {
                "/".to_string()
            } else if raw_mount.starts_with("/System/Volumes/") {
                // Skip other system snapshot volumes (e.g. /System/Volumes/Preboot, /System/Volumes/VM)
                return None;
            } else {
                raw_mount
            };

            // Deduplicate by normalized mount point
            if !seen_mounts.insert(mount.clone()) {
                return None;
            }

            let name = if disk.name().is_empty() {
                if mount == "/" {
                    "Macintosh HD".to_string()
                } else {
                    mount.clone()
                }
            } else {
                disk.name().to_string_lossy().to_string()
            };

            let id = if mount == "/" {
                "root".to_string()
            } else {
                mount.replace('/', "_").trim_start_matches('_').to_string()
            };

            Some(DiskInfo {
                id,
                name,
                mount_point: mount,
                total: disk.total_space(),
                free: disk.available_space(),
                is_removable: disk.is_removable(),
            })
        })
        .collect()
}

fn expand_path(path: &str) -> PathBuf {
    if path.starts_with("~/") {
        if let Ok(home) = env::var("HOME") {
            return PathBuf::from(home).join(&path[2..]);
        }
    }
    PathBuf::from(path)
}

/// Scan a directory returning children with their sizes.
/// `depth` controls how many levels of children to include inline.
/// Size calculation is capped at `size_max_depth` levels to stay responsive.
#[tauri::command]
async fn scan_directory(path: String, depth: u32) -> Result<Vec<DirEntry>, String> {
    let root = expand_path(&path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let entries =
        tauri::async_runtime::spawn_blocking(move || read_dir_entries(&root, depth, 5))
            .await
            .map_err(|e| format!("Scan failed: {}", e))?;

    Ok(entries)
}

#[derive(Serialize, Clone)]
struct ScanProgress {
    current: u32,
    total: u32,
    name: String,
}

/// Scan a directory with progress events emitted per top-level entry.
#[tauri::command]
async fn scan_directory_with_progress(
    path: String,
    depth: u32,
    app_handle: tauri::AppHandle,
) -> Result<Vec<DirEntry>, String> {
    let root = expand_path(&path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let entries = tauri::async_runtime::spawn_blocking(move || {
        // First, collect all top-level entries to know the total count
        let top_level: Vec<_> = match fs::read_dir(&root) {
            Ok(r) => r.flatten().collect(),
            Err(_) => return vec![],
        };
        let total = top_level.len() as u32;
        let mut results: Vec<DirEntry> = Vec::new();

        for (i, entry) in top_level.into_iter().enumerate() {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            // Emit progress
            let _ = app_handle.emit("scan-progress", ScanProgress {
                current: i as u32 + 1,
                total,
                name: name.clone(),
            });

            let is_dir = entry_path.is_dir();
            let size = if is_dir {
                dir_size(&entry_path, 5)
            } else {
                entry.metadata().map(|m| m.len()).unwrap_or(0)
            };

            if size == 0 {
                continue;
            }

            let children = if is_dir && depth > 0 {
                let child_entries = read_dir_entries(&entry_path, depth - 1, 4);
                if child_entries.is_empty() {
                    None
                } else {
                    Some(child_entries)
                }
            } else {
                None
            };

            results.push(DirEntry {
                id: entry_path.to_string_lossy().to_string(),
                name,
                path: entry_path.to_string_lossy().to_string(),
                size,
                is_dir,
                children,
            });
        }

        results.sort_by(|a, b| b.size.cmp(&a.size));
        results
    })
    .await
    .map_err(|e| format!("Scan failed: {}", e))?;

    Ok(entries)
}

fn read_dir_entries(dir: &Path, depth: u32, size_max_depth: u32) -> Vec<DirEntry> {
    let read = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return vec![],
    };

    let mut entries: Vec<DirEntry> = Vec::new();

    for entry in read.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        let is_dir = path.is_dir();
        let size = if is_dir {
            dir_size(&path, size_max_depth)
        } else {
            entry.metadata().map(|m| m.len()).unwrap_or(0)
        };

        // Skip entries with 0 size
        if size == 0 {
            continue;
        }

        let children = if is_dir && depth > 0 {
            let child_entries = read_dir_entries(&path, depth - 1, size_max_depth.saturating_sub(1));
            if child_entries.is_empty() {
                None
            } else {
                Some(child_entries)
            }
        } else {
            None
        };

        entries.push(DirEntry {
            id: path.to_string_lossy().to_string(),
            name,
            path: path.to_string_lossy().to_string(),
            size,
            is_dir,
            children,
        });
    }

    // Sort by size descending
    entries.sort_by(|a, b| b.size.cmp(&a.size));
    entries
}

/// Calculate directory size, limited to `max_depth` levels of recursion
/// to prevent scanning the entire filesystem.
fn dir_size(path: &Path, max_depth: u32) -> u64 {
    if max_depth == 0 {
        // Just sum the immediate files, don't recurse further
        return shallow_size(path);
    }
    let mut total: u64 = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_symlink() {
                continue;
            }
            if p.is_dir() {
                total += dir_size(&p, max_depth - 1);
            } else {
                total += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    total
}

/// Just sum the sizes of immediate files (no recursion into subdirs).
fn shallow_size(path: &Path) -> u64 {
    let mut total: u64 = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                total += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    total
}

#[derive(Serialize, Clone)]
pub struct DeleteResult {
    path: String,
    success: bool,
    error: Option<String>,
}

/// Move files/directories to the macOS Trash.
/// Returns a result for each path indicating success or failure.
#[tauri::command]
async fn move_to_trash(paths: Vec<String>) -> Vec<DeleteResult> {
    let results = tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .map(|path_str| {
                let path = Path::new(&path_str);
                if !path.exists() {
                    return DeleteResult {
                        path: path_str,
                        success: false,
                        error: Some("Path does not exist".to_string()),
                    };
                }

                match trash::delete(path) {
                    Ok(()) => DeleteResult {
                        path: path_str,
                        success: true,
                        error: None,
                    },
                    Err(e) => DeleteResult {
                        path: path_str,
                        success: false,
                        error: Some(e.to_string()),
                    },
                }
            })
            .collect::<Vec<_>>()
    })
    .await
    .unwrap_or_default();

    results
}

#[derive(Serialize, Clone)]
pub struct AppInfo {
    id: String,
    name: String,
    path: String,
    bundle_id: String,
    version: String,
    size: u64,
    icon_path: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct AppRelatedFiles {
    caches: Vec<String>,
    app_support: Vec<String>,
    preferences: Vec<String>,
    logs: Vec<String>,
    total_size: u64,
}

#[derive(Serialize, Clone)]
pub struct AppDetail {
    app: AppInfo,
    related: AppRelatedFiles,
}

/// List all installed applications in /Applications
#[tauri::command]
async fn list_apps() -> Vec<AppInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut apps = Vec::new();
        let apps_dir = Path::new("/Applications");

        if let Ok(entries) = fs::read_dir(apps_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("app") {
                    continue;
                }

                let name = path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                let info_plist = path.join("Contents/Info.plist");
                let (bundle_id, version) = read_plist_info(&info_plist);

                let size = dir_size(&path, 5);

                apps.push(AppInfo {
                    id: path.to_string_lossy().to_string(),
                    name,
                    path: path.to_string_lossy().to_string(),
                    bundle_id,
                    version,
                    size,
                    icon_path: find_app_icon(&path),
                });
            }
        }

        apps.sort_by(|a, b| b.size.cmp(&a.size));
        apps
    })
    .await
    .unwrap_or_default()
}

fn read_plist_info(plist_path: &Path) -> (String, String) {
    let mut bundle_id = String::new();
    let mut version = String::new();

    if let Ok(content) = fs::read_to_string(plist_path) {
        // Simple XML parsing for CFBundleIdentifier and CFBundleShortVersionString
        if let Some(id) = extract_plist_value(&content, "CFBundleIdentifier") {
            bundle_id = id;
        }
        if let Some(v) = extract_plist_value(&content, "CFBundleShortVersionString") {
            version = v;
        }
    }

    (bundle_id, version)
}

fn extract_plist_value(content: &str, key: &str) -> Option<String> {
    let key_tag = format!("<key>{}</key>", key);
    if let Some(pos) = content.find(&key_tag) {
        let after_key = &content[pos + key_tag.len()..];
        if let Some(start) = after_key.find("<string>") {
            let value_start = start + 8;
            if let Some(end) = after_key[value_start..].find("</string>") {
                return Some(after_key[value_start..value_start + end].to_string());
            }
        }
    }
    None
}

fn find_app_icon(app_path: &Path) -> Option<String> {
    let resources = app_path.join("Contents/Resources");
    if let Ok(entries) = fs::read_dir(&resources) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("icns") {
                return Some(p.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Find all related files for an app (caches, preferences, logs, etc.)
#[tauri::command]
async fn get_app_related_files(bundle_id: String, app_name: String) -> AppRelatedFiles {
    tauri::async_runtime::spawn_blocking(move || {
        let home = env::var("HOME").unwrap_or_default();
        let mut related = AppRelatedFiles {
            caches: Vec::new(),
            app_support: Vec::new(),
            preferences: Vec::new(),
            logs: Vec::new(),
            total_size: 0,
        };

        let search_terms = vec![bundle_id.clone(), app_name.clone()];

        // Search in ~/Library/Caches
        scan_library_dir(&format!("{}/Library/Caches", home), &search_terms, &mut related.caches, &mut related.total_size);
        // Search in ~/Library/Application Support
        scan_library_dir(&format!("{}/Library/Application Support", home), &search_terms, &mut related.app_support, &mut related.total_size);
        // Search in ~/Library/Preferences
        scan_library_dir(&format!("{}/Library/Preferences", home), &search_terms, &mut related.preferences, &mut related.total_size);
        // Search in ~/Library/Logs
        scan_library_dir(&format!("{}/Library/Logs", home), &search_terms, &mut related.logs, &mut related.total_size);
        // Also check ~/Library/Containers
        scan_library_dir(&format!("{}/Library/Containers", home), &search_terms, &mut related.app_support, &mut related.total_size);
        // ~/Library/Saved Application State
        scan_library_dir(&format!("{}/Library/Saved Application State", home), &search_terms, &mut related.app_support, &mut related.total_size);

        related
    })
    .await
    .unwrap_or(AppRelatedFiles {
        caches: Vec::new(),
        app_support: Vec::new(),
        preferences: Vec::new(),
        logs: Vec::new(),
        total_size: 0,
    })
}

fn scan_library_dir(dir: &str, search_terms: &[String], results: &mut Vec<String>, total_size: &mut u64) {
    let dir_path = Path::new(dir);
    if !dir_path.exists() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let matched = search_terms.iter().any(|term| {
                !term.is_empty() && name.contains(&term.to_lowercase())
            });
            if matched {
                let path = entry.path();
                let size = if path.is_dir() {
                    dir_size(&path, 3)
                } else {
                    entry.metadata().map(|m| m.len()).unwrap_or(0)
                };
                *total_size += size;
                results.push(path.to_string_lossy().to_string());
            }
        }
    }
}

#[derive(Deserialize)]
pub struct UninstallRequest {
    app_path: String,
    related_paths: Vec<String>,
}

/// Uninstall an app by moving it and all related files to Trash
#[tauri::command]
async fn uninstall_app(request: UninstallRequest) -> Vec<DeleteResult> {
    let mut all_paths = vec![request.app_path];
    all_paths.extend(request.related_paths);

    tauri::async_runtime::spawn_blocking(move || {
        all_paths
            .into_iter()
            .map(|path_str| {
                let path = Path::new(&path_str);
                if !path.exists() {
                    return DeleteResult {
                        path: path_str,
                        success: true, // already gone
                        error: None,
                    };
                }
                match trash::delete(path) {
                    Ok(()) => DeleteResult {
                        path: path_str,
                        success: true,
                        error: None,
                    },
                    Err(e) => DeleteResult {
                        path: path_str,
                        success: false,
                        error: Some(e.to_string()),
                    },
                }
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[derive(Serialize, Clone)]
pub struct JunkCategory {
    id: String,
    name: String,
    description: String,
    items: Vec<JunkItem>,
    total_size: u64,
}

#[derive(Serialize, Clone)]
pub struct JunkItem {
    path: String,
    name: String,
    size: u64,
    is_dir: bool,
}

#[derive(Serialize, Clone)]
pub struct JunkScanResult {
    categories: Vec<JunkCategory>,
    total_size: u64,
}

/// Scan for junk files across the system
#[tauri::command]
async fn scan_junk() -> JunkScanResult {
    tauri::async_runtime::spawn_blocking(|| {
        let home = env::var("HOME").unwrap_or_default();
        let mut categories = Vec::new();

        // 1. User Caches
        let user_caches = scan_junk_dir(
            &format!("{}/Library/Caches", home),
            "user_caches",
            "User Caches",
            "Application caches that can be safely removed",
        );
        if user_caches.total_size > 0 {
            categories.push(user_caches);
        }

        // 2. System Logs
        let mut log_items = Vec::new();
        let mut log_size = 0u64;
        for log_dir in &[
            format!("{}/Library/Logs", home),
            "/Library/Logs".to_string(),
            "/private/var/log".to_string(),
        ] {
            collect_junk_files(log_dir, &mut log_items, &mut log_size);
        }
        if log_size > 0 {
            categories.push(JunkCategory {
                id: "logs".to_string(),
                name: "System & App Logs".to_string(),
                description: "Log files from apps and the system".to_string(),
                items: log_items,
                total_size: log_size,
            });
        }

        // 3. Downloads (old files)
        let downloads = scan_junk_dir(
            &format!("{}/Downloads", home),
            "downloads",
            "Downloads",
            "Files in your Downloads folder",
        );
        if downloads.total_size > 0 {
            categories.push(downloads);
        }

        // 4. Xcode Derived Data
        let xcode_derived = format!("{}/Library/Developer/Xcode/DerivedData", home);
        let xcode_cat = scan_junk_dir(
            &xcode_derived,
            "xcode_derived",
            "Xcode Derived Data",
            "Build artifacts from Xcode projects",
        );
        if xcode_cat.total_size > 0 {
            categories.push(xcode_cat);
        }

        // 5. Homebrew cache
        let brew_cache = format!("{}/Library/Caches/Homebrew", home);
        let brew_cat = scan_junk_dir(
            &brew_cache,
            "brew_cache",
            "Homebrew Cache",
            "Cached package downloads from Homebrew",
        );
        if brew_cat.total_size > 0 {
            categories.push(brew_cat);
        }

        // 6. npm/yarn/pnpm cache
        let mut dev_items = Vec::new();
        let mut dev_size = 0u64;
        for cache_dir in &[
            format!("{}/.npm/_cacache", home),
            format!("{}/Library/Caches/Yarn", home),
            format!("{}/Library/pnpm/store", home),
        ] {
            let path = Path::new(cache_dir);
            if path.exists() && path.is_dir() {
                let size = dir_size(path, 3);
                if size > 0 {
                    dev_items.push(JunkItem {
                        name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                        path: cache_dir.clone(),
                        size,
                        is_dir: true,
                    });
                    dev_size += size;
                }
            }
        }
        if dev_size > 0 {
            categories.push(JunkCategory {
                id: "dev_caches".to_string(),
                name: "Developer Caches".to_string(),
                description: "Package manager caches (npm, Yarn, pnpm)".to_string(),
                items: dev_items,
                total_size: dev_size,
            });
        }

        // 7. Trash
        let trash_dir = format!("{}/.Trash", home);
        let trash_cat = scan_junk_dir(
            &trash_dir,
            "trash",
            "Trash",
            "Items sitting in your Trash",
        );
        if trash_cat.total_size > 0 {
            categories.push(trash_cat);
        }

        // Sort categories by size descending
        categories.sort_by(|a, b| b.total_size.cmp(&a.total_size));

        let total_size = categories.iter().map(|c| c.total_size).sum();

        JunkScanResult {
            categories,
            total_size,
        }
    })
    .await
    .unwrap_or(JunkScanResult {
        categories: Vec::new(),
        total_size: 0,
    })
}

fn scan_junk_dir(dir: &str, id: &str, name: &str, description: &str) -> JunkCategory {
    let mut items = Vec::new();
    let mut total_size = 0u64;
    collect_junk_files(dir, &mut items, &mut total_size);
    // Sort items by size descending
    items.sort_by(|a, b| b.size.cmp(&a.size));
    JunkCategory {
        id: id.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        items,
        total_size,
    }
}

fn collect_junk_files(dir: &str, items: &mut Vec<JunkItem>, total_size: &mut u64) {
    let dir_path = Path::new(dir);
    if !dir_path.exists() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            // Skip hidden system files
            if name == ".DS_Store" || name == ".localized" {
                continue;
            }
            let is_dir = path.is_dir();
            let size = if is_dir {
                dir_size(&path, 3)
            } else {
                entry.metadata().map(|m| m.len()).unwrap_or(0)
            };
            if size == 0 {
                continue;
            }
            *total_size += size;
            items.push(JunkItem {
                path: path.to_string_lossy().to_string(),
                name,
                size,
                is_dir,
            });
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_disks,
            scan_directory,
            scan_directory_with_progress,
            move_to_trash,
            list_apps,
            get_app_related_files,
            uninstall_app,
            scan_junk
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
