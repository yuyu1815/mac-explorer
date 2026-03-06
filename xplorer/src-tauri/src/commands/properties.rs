use std::os::unix::fs::PermissionsExt;
use std::time::UNIX_EPOCH;

use super::types::DetailedProperties;
use super::types::PropertyProgress;
use super::utils::{format_size, format_timestamp};

#[tauri::command]
pub async fn show_properties(path: String) -> Result<(), String> {
    let script = format!(
        "tell application \"Finder\" to open information window of (POSIX file \"{}\" as alias)",
        path
    );
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| format!("Failed to open properties: {}", e))?;
    Ok(())
}

/// 基本プロパティのみ取得（フォルダサイズ計算をスキップ）
#[tauri::command]
pub async fn get_basic_properties(path: String) -> Result<DetailedProperties, String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("File or directory not found".into());
    }

    let metadata = std::fs::symlink_metadata(&path_buf).map_err(|e| e.to_string())?;
    let name = path_buf
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    let location = path_buf
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();

    let is_dir = metadata.is_dir();
    let file_type = if is_dir {
        "ファイル フォルダー".to_string()
    } else {
        path_buf
            .extension()
            .map(|ext| format!("{} ファイル", ext.to_string_lossy().to_uppercase()))
            .unwrap_or_else(|| "ファイル".to_string())
    };

    let created = metadata
        .created()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let modified = metadata
        .modified()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let accessed = metadata
        .accessed()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let size_bytes = metadata.len();
    let cluster_size = 4096;
    let size_on_disk_bytes = if is_dir || size_bytes == 0 {
        0
    } else {
        size_bytes.div_ceil(cluster_size) * cluster_size
    };

    let is_readonly = metadata.permissions().mode() & 0o222 == 0;
    let is_hidden = name.starts_with('.');

    Ok(DetailedProperties {
        name,
        path,
        file_type,
        location,
        size_bytes,
        size_formatted: if is_dir {
            "計算中...".to_string()
        } else {
            format_size(size_bytes)
        },
        size_on_disk_bytes,
        size_on_disk_formatted: if is_dir {
            String::new()
        } else {
            format_size(size_on_disk_bytes)
        },
        contains_files: 0,
        contains_folders: 0,
        created_formatted: format_timestamp(created),
        modified_formatted: format_timestamp(modified),
        accessed_formatted: format_timestamp(accessed),
        is_readonly,
        is_hidden,
    })
}

/// 詳細プロパティ取得（フォルダサイズを再帰計算）
#[tauri::command]
pub async fn get_detailed_properties(path: String) -> Result<DetailedProperties, String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("File or directory not found".into());
    }

    let metadata = std::fs::symlink_metadata(&path_buf).map_err(|e| e.to_string())?;
    let name = path_buf
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    let location = path_buf
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();

    let is_dir = metadata.is_dir();
    let file_type = if is_dir {
        "ファイル フォルダー".to_string()
    } else {
        path_buf
            .extension()
            .map(|ext| format!("{} ファイル", ext.to_string_lossy().to_uppercase()))
            .unwrap_or_else(|| "ファイル".to_string())
    };

    let created = metadata
        .created()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let modified = metadata
        .modified()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let accessed = metadata
        .accessed()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let mut size_bytes = metadata.len();
    let mut contains_files = 0;
    let mut contains_folders = 0;

    if is_dir {
        let mut dirs_to_visit = vec![path_buf.clone()];
        while let Some(current_dir) = dirs_to_visit.pop() {
            if let Ok(entries) = std::fs::read_dir(current_dir) {
                for entry in entries.flatten() {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_dir() {
                            contains_folders += 1;
                            dirs_to_visit.push(entry.path());
                        } else {
                            contains_files += 1;
                            size_bytes += meta.len();
                        }
                    }
                }
            }
        }
    }

    let cluster_size = 4096;
    let size_on_disk_bytes = if size_bytes == 0 {
        0
    } else {
        size_bytes.div_ceil(cluster_size) * cluster_size
    };

    let is_readonly = metadata.permissions().mode() & 0o222 == 0;
    let is_hidden = name.starts_with('.');

    Ok(DetailedProperties {
        name,
        path,
        file_type,
        location,
        size_bytes,
        size_formatted: format_size(size_bytes),
        size_on_disk_bytes,
        size_on_disk_formatted: format_size(size_on_disk_bytes),
        contains_files,
        contains_folders,
        created_formatted: format_timestamp(created),
        modified_formatted: format_timestamp(modified),
        accessed_formatted: format_timestamp(accessed),
        is_readonly,
        is_hidden,
    })
}

/// フォルダサイズをストリーミング計算
#[tauri::command]
pub async fn get_detailed_properties_streaming(
    path: String,
    channel: tauri::ipc::Channel<PropertyProgress>,
) -> Result<DetailedProperties, String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("File or directory not found".into());
    }

    let metadata = std::fs::symlink_metadata(&path_buf).map_err(|e| e.to_string())?;
    let name = path_buf
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    let location = path_buf
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();

    let is_dir = metadata.is_dir();
    let file_type = if is_dir {
        "ファイル フォルダー".to_string()
    } else {
        path_buf
            .extension()
            .map(|ext| format!("{} ファイル", ext.to_string_lossy().to_uppercase()))
            .unwrap_or_else(|| "ファイル".to_string())
    };

    let created = metadata
        .created()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let modified = metadata
        .modified()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let accessed = metadata
        .accessed()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let size_bytes = metadata.len();
    let contains_files = 0;
    let contains_folders = 0;

    const CLUSTER_SIZE: u64 = 4096;

    if is_dir {
        let path_clone = path_buf.clone();
        tokio::task::spawn_blocking(move || {
            let mut dirs_to_visit = vec![path_clone.clone()];
            let mut counter = 0u32;
            let mut size_bytes = 0u64;
            let mut contains_files = 0u32;
            let mut contains_folders = 0u32;
            let emit_interval = 50;

            while let Some(current_dir) = dirs_to_visit.pop() {
                if let Ok(entries) = std::fs::read_dir(&current_dir) {
                    for entry in entries.flatten() {
                        if let Ok(meta) = entry.metadata() {
                            if meta.is_dir() {
                                contains_folders += 1;
                                dirs_to_visit.push(entry.path());
                            } else {
                                contains_files += 1;
                                size_bytes += meta.len();
                            }

                            counter += 1;
                            if counter.is_multiple_of(emit_interval) {
                                let size_on_disk = if size_bytes == 0 {
                                    0
                                } else {
                                    size_bytes.div_ceil(CLUSTER_SIZE) * CLUSTER_SIZE
                                };
                                let _ = channel.send(PropertyProgress {
                                    size_bytes,
                                    size_formatted: format_size(size_bytes),
                                    size_on_disk_bytes: size_on_disk,
                                    size_on_disk_formatted: format_size(size_on_disk),
                                    contains_files,
                                    contains_folders,
                                    complete: false,
                                });
                            }
                        }
                    }
                }
            }

            let size_on_disk = if size_bytes == 0 {
                0
            } else {
                size_bytes.div_ceil(CLUSTER_SIZE) * CLUSTER_SIZE
            };
            let _ = channel.send(PropertyProgress {
                size_bytes,
                size_formatted: format_size(size_bytes),
                size_on_disk_bytes: size_on_disk,
                size_on_disk_formatted: format_size(size_on_disk),
                contains_files,
                contains_folders,
                complete: true,
            });
        });
    } else {
        let size_on_disk = if size_bytes == 0 {
            0
        } else {
            size_bytes.div_ceil(CLUSTER_SIZE) * CLUSTER_SIZE
        };
        let _ = channel.send(PropertyProgress {
            size_bytes,
            size_formatted: format_size(size_bytes),
            size_on_disk_bytes: size_on_disk,
            size_on_disk_formatted: format_size(size_on_disk),
            contains_files: 0,
            contains_folders: 0,
            complete: true,
        });
    }

    let size_on_disk_bytes = if size_bytes == 0 {
        0
    } else {
        size_bytes.div_ceil(CLUSTER_SIZE) * CLUSTER_SIZE
    };

    let is_readonly = metadata.permissions().mode() & 0o222 == 0;
    let is_hidden = name.starts_with('.');

    Ok(DetailedProperties {
        name,
        path,
        file_type,
        location,
        size_bytes,
        size_formatted: format_size(size_bytes),
        size_on_disk_bytes,
        size_on_disk_formatted: format_size(size_on_disk_bytes),
        contains_files,
        contains_folders,
        created_formatted: format_timestamp(created),
        modified_formatted: format_timestamp(modified),
        accessed_formatted: format_timestamp(accessed),
        is_readonly,
        is_hidden,
    })
}
