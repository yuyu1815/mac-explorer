use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::time::UNIX_EPOCH;

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

fn is_symlink(_name: &str) -> bool {
    false // Simplified for now
}

/// list_directory の内部実装
fn list_directory_internal(path: &str, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let dir = fs::read_dir(path).map_err(|e| e.to_string())?;

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
            is_hidden: file_name.starts_with('.') || is_symlink(&file_name),
            is_symlink: metadata.file_type().is_symlink(),
            permissions: format!("{:o}", metadata.permissions().mode() & 0o777),
            icon_id: get_entry_icon_id(is_dir, &path_str, ext),
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn list_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    list_directory_internal(&path, show_hidden)
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
    let mut entries = list_directory_internal(&path, show_hidden)?;

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
    let entries = list_directory_internal(&dir_path, show_hidden)?;

    let prefix_lower = prefix.to_lowercase();
    let mut filtered: Vec<FileEntry> = entries
        .into_iter()
        .filter(|e| e.is_dir)
        .filter(|e| e.name.to_lowercase().starts_with(&prefix_lower))
        .collect();

    filtered.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(filtered)
}
