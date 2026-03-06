//! ファイルやディレクトリの詳細なプロパティ（メタデータ）を取得するモジュール。
//! 
//! 基本情報（名前、パス、種類）に加えて、macOSのFinder風の情報ウィンドウ表示や、
//! フォルダサイズの再帰的な計算（ストリーミング含む）をサポートします。

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
    let metadata = std::fs::symlink_metadata(&path_buf).map_err(|e| e.to_string())?;
    let is_dir = metadata.is_dir();
    let size_bytes = metadata.len();

    Ok(DetailedProperties {
        name: path_buf.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone()),
        path,
        file_type: if is_dir { "ファイル フォルダー".to_string() } else { path_buf.extension().map(|ext| format!("{} ファイル", ext.to_string_lossy().to_uppercase())).unwrap_or_else(|| "ファイル".to_string()) },
        location: path_buf.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default(),
        size_bytes,
        size_formatted: if is_dir { "計算中...".to_string() } else { format_size(size_bytes) },
        size_on_disk_bytes: if is_dir || size_bytes == 0 { 0 } else { size_bytes.div_ceil(4096) * 4096 },
        size_on_disk_formatted: if is_dir { String::new() } else { format_size(size_bytes.div_ceil(4096) * 4096) },
        contains_files: 0,
        contains_folders: 0,
        created_formatted: format_timestamp(metadata.created().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0)),
        modified_formatted: format_timestamp(metadata.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0)),
        accessed_formatted: format_timestamp(metadata.accessed().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0)),
        is_readonly: metadata.permissions().mode() & 0o222 == 0,
        is_hidden: path_buf.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(false),
    })
}

/// 詳細プロパティ取得（フォルダサイズを再帰計算）
#[tauri::command]
pub async fn get_detailed_properties(path: String) -> Result<DetailedProperties, String> {
    let mut props = get_basic_properties(path.clone()).await?;
    let path_buf = std::path::PathBuf::from(&path);

    if props.file_type == "ファイル フォルダー" {
        let mut stack = vec![path_buf];
        while let Some(current) = stack.pop() {
            if let Ok(entries) = std::fs::read_dir(current) {
                for entry in entries.flatten() {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_dir() {
                            props.contains_folders += 1;
                            stack.push(entry.path());
                        } else {
                            props.contains_files += 1;
                            props.size_bytes += meta.len();
                        }
                    }
                }
            }
        }
        props.size_formatted = format_size(props.size_bytes);
        props.size_on_disk_bytes = props.size_bytes.div_ceil(4096) * 4096;
        props.size_on_disk_formatted = format_size(props.size_on_disk_bytes);
    }
    Ok(props)
}

/// フォルダサイズをストリーミング計算
#[tauri::command]
pub async fn get_detailed_properties_streaming(path: String, channel: tauri::ipc::Channel<PropertyProgress>) -> Result<DetailedProperties, String> {
    let props = get_basic_properties(path.clone()).await?;
    if props.file_type == "ファイル フォルダー" {
        let path_clone = std::path::PathBuf::from(&path);
        tokio::task::spawn_blocking(move || {
            let mut stack = vec![path_clone];
            let mut size = 0u64;
            let mut files = 0u32;
            let mut folders = 0u32;
            let mut counter = 0u32;

            while let Some(curr) = stack.pop() {
                let entries = match std::fs::read_dir(curr) {
                    Ok(e) => e,
                    Err(_) => continue,
                };

                for entry in entries.flatten() {
                    let m = match entry.metadata() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };

                    if m.is_dir() {
                        folders += 1;
                        stack.push(entry.path());
                    } else {
                        files += 1;
                        size += m.len();
                    }

                    if (counter % 50) == 0 {
                        let sod = size.div_ceil(4096) * 4096;
                        let _ = channel.send(PropertyProgress {
                            size_bytes: size,
                            size_formatted: format_size(size),
                            size_on_disk_bytes: sod,
                            size_on_disk_formatted: format_size(sod),
                            contains_files: files,
                            contains_folders: folders,
                            complete: false,
                        });
                    }
                    counter += 1;
                }
            }

            let sod = size.div_ceil(4096) * 4096;
            let _ = channel.send(PropertyProgress { size_bytes: size, size_formatted: format_size(size), size_on_disk_bytes: sod, size_on_disk_formatted: format_size(sod), contains_files: files, contains_folders: folders, complete: true });
        });
    } else {
        let sod = props.size_bytes.div_ceil(4096) * 4096;
        let _ = channel.send(PropertyProgress { size_bytes: props.size_bytes, size_formatted: props.size_formatted.clone(), size_on_disk_bytes: sod, size_on_disk_formatted: format_size(sod), contains_files: 0, contains_folders: 0, complete: true });
    }
    Ok(props)
}
