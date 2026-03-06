use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use super::archive::{is_archive_file, list_archive_entries};
use super::icons::get_icon_binary;
use super::types::FileEntry;
use super::utils::{format_size, format_timestamp};

fn get_entry_icon_id(is_dir: bool, path_str: &str, extension: Option<String>) -> String {
    if is_dir {
        if path_str.ends_with(".app") {
            return format!("app:{}", path_str);
        }
        return "dir".to_string();
    }
    format!("ext:{}", extension.unwrap_or_default())
}

/// パスを「アーカイブファイル」と「その内部の相対パス」に分割する
pub fn split_archive_path(path: &str) -> Option<(String, String)> {
    let path_buf = PathBuf::from(path);
    let mut current = path_buf.as_path();

    while let Some(parent) = current.parent() {
        if current.exists() && current.is_file() {
            let path_str = current.to_string_lossy().to_string();
            // 拡張子がアーカイブ形式かチェック
            if is_archive_file(&path_str) {
                let relative = path.strip_prefix(&path_str).unwrap_or("");
                let relative = relative.trim_start_matches('/');
                return Some((path_str, relative.to_string()));
            }
        }
        current = parent;
    }
    None
}

/// アーカイブ内のエントリから指定階層の FileEntry を生成する
pub async fn list_archive_internal(
    archive_path: &str,
    inner_path: &str,
) -> Result<Vec<FileEntry>, String> {
    let entries = list_archive_entries(archive_path.to_string()).await?;
    let mut result = Vec::new();
    let inner_path = if inner_path.is_empty() {
        ""
    } else {
        inner_path
    };
    let mut seen_dirs = std::collections::HashSet::new();

    println!(
        "[DEBUG] list_archive_internal: archive={}, inner={}",
        archive_path, inner_path
    );

    for entry in entries {
        // アーカイブ内のパス処理
        let entry_path = entry.path.trim_start_matches('/');

        // フィルタリング: inner_path 直下の要素のみを対象にする
        let relative = if inner_path.is_empty() {
            entry_path.to_string()
        } else {
            let prefix = format!("{}/", inner_path);
            if !entry_path.starts_with(&prefix) {
                continue;
            }
            entry_path
                .strip_prefix(&prefix)
                .unwrap_or(entry_path)
                .to_string()
        };

        if relative.is_empty() {
            continue;
        }

        let parts: Vec<&str> = relative.split('/').collect();
        if parts.is_empty() {
            continue;
        }

        let name = parts[0];
        if name.is_empty() {
            continue;
        }

        let is_dir = parts.len() > 1 || entry.is_directory;
        let full_virtual_path = format!(
            "{}/{}",
            archive_path,
            if inner_path.is_empty() {
                name.to_string()
            } else {
                format!("{}/{}", inner_path, name)
            }
        );

        if is_dir {
            if seen_dirs.contains(name) {
                continue;
            }
            seen_dirs.insert(name.to_string());

            println!(
                "[DEBUG] Adding dir: name={}, path={}",
                name, full_virtual_path
            );
            result.push(FileEntry {
                name: name.to_string(),
                path: full_virtual_path,
                is_dir: true,
                size: 0,
                size_formatted: String::new(),
                modified: entry.modified,
                modified_formatted: format_timestamp(entry.modified),
                created: 0,
                created_formatted: String::new(),
                file_type: "folder".to_string(),
                is_hidden: name.starts_with('.'),
                is_symlink: false,
                permissions: "755".to_string(),
                icon_id: "dir".to_string(),
            });
        } else {
            let ext = Path::new(name)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase());
            println!(
                "[DEBUG] Adding file: name={}, path={}",
                name, full_virtual_path
            );
            result.push(FileEntry {
                name: name.to_string(),
                path: full_virtual_path,
                is_dir: false,
                size: entry.size,
                size_formatted: format_size(entry.size),
                modified: entry.modified,
                modified_formatted: format_timestamp(entry.modified),
                created: 0,
                created_formatted: String::new(),
                file_type: ext.clone().unwrap_or_default(),
                is_hidden: name.starts_with('.'),
                is_symlink: false,
                permissions: "644".to_string(),
                icon_id: get_entry_icon_id(false, &entry.path, ext),
            });
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn list_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    // 仮想パス（アーカイブ内）のチェック
    if let Some((archive_path, inner_path)) = split_archive_path(&path) {
        // パスがアーカイブファイル自体、またはその内部を指している場合
        // (通常のディレクトリが同名で存在する特異なケースを除き、アーカイブとして扱う)
        if !Path::new(&path).is_dir() {
            return list_archive_internal(&archive_path, &inner_path).await;
        }
    }

    let mut entries = Vec::new();
    let dir = fs::read_dir(&path).map_err(|e| e.to_string())?;

    for entry in dir.flatten() {
        let file_name = entry.file_name().to_string_lossy().into_owned();

        if !show_hidden && file_name.starts_with('.') {
            continue;
        }

        let path_buf = entry.path();
        let path_str = path_buf.to_string_lossy().into_owned();
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let is_dir = metadata.is_dir();

        let modified = metadata
            .modified()
            .unwrap_or(UNIX_EPOCH)
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let created = metadata
            .created()
            .unwrap_or(UNIX_EPOCH)
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let ext = path_buf
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase());

        entries.push(FileEntry {
            name: file_name.clone(),
            path: path_str.clone(),
            is_dir,
            size: metadata.len(),
            size_formatted: if is_dir {
                String::new()
            } else {
                format_size(metadata.len())
            },
            modified,
            modified_formatted: format_timestamp(modified),
            created,
            created_formatted: format_timestamp(created),
            file_type: if is_dir {
                "folder".to_string()
            } else {
                ext.clone().unwrap_or_default()
            },
            is_hidden: file_name.starts_with('.'),
            is_symlink: metadata.file_type().is_symlink(),
            permissions: format!("{:o}", metadata.permissions().mode() & 0o777),
            icon_id: get_entry_icon_id(is_dir, &path_str, ext),
        });
    }

    Ok(entries)
}

/// フィルタ・ソート済みのファイル一覧を返す
#[tauri::command]
pub async fn list_files_sorted(
    path: String,
    show_hidden: bool,
    sort_by: String,
    sort_desc: bool,
    search_query: String,
) -> Result<Vec<FileEntry>, String> {
    let mut entries = list_directory(path.clone(), show_hidden).await?;

    // フィルタリング
    if !search_query.is_empty() {
        let query_lower = search_query.to_lowercase();
        entries.retain(|e| e.name.to_lowercase().contains(&query_lower));
    }

    // ソート
    let sort_by_str = sort_by.as_str();
    let dirs_first = sort_by_str != "file_type";

    entries.sort_by(|a, b| {
        if dirs_first {
            match (a.is_dir, b.is_dir) {
                (true, false) => return std::cmp::Ordering::Less,
                (false, true) => return std::cmp::Ordering::Greater,
                _ => {}
            }
        }

        let ordering = match sort_by_str {
            "name" => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            "modified" => a.modified.cmp(&b.modified),
            "file_type" => a.file_type.to_lowercase().cmp(&b.file_type.to_lowercase()),
            "size" => a.size.cmp(&b.size),
            _ => std::cmp::Ordering::Equal,
        };

        if sort_desc {
            ordering.reverse()
        } else {
            ordering
        }
    });

    // app: アイコンを並列プリウォーム
    let app_ids: Vec<String> = entries
        .iter()
        .filter(|e| e.icon_id.starts_with("app:"))
        // アーカイブ内（仮想パス）のアイコンは物理パスとしての実体がないため、スキップ
        .filter(|e| !e.path.contains(".zip/") && !e.path.contains(".7z/") && !e.path.contains(".tar"))
        .map(|e| e.icon_id.clone())
        .collect();

    if !app_ids.is_empty() {
        use rayon::prelude::*;
        app_ids.par_iter().for_each(|id| {
            let _ = get_icon_binary(id);
        });
    }

    Ok(entries)
}

/// パス補完候補を返す
#[tauri::command]
pub async fn complete_path(
    dir_path: String,
    prefix: String,
    show_hidden: bool,
) -> Result<Vec<FileEntry>, String> {
    let entries = list_directory(dir_path.clone(), show_hidden).await?;

    let prefix_lower = prefix.to_lowercase();
    let mut filtered: Vec<FileEntry> = entries
        .into_iter()
        .filter(|e| e.is_dir)
        .filter(|e| e.name.to_lowercase().starts_with(&prefix_lower))
        .collect();

    filtered.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(filtered)
}
