use serde::Serialize;
use std::fs;
use std::time::UNIX_EPOCH;

use std::os::unix::fs::PermissionsExt;

#[derive(Serialize)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    size_formatted: String,
    modified: i64,
    modified_formatted: String,
    created: i64,
    created_formatted: String,
    file_type: String,
    is_hidden: bool,
    is_symlink: bool,
    permissions: String,
    icon: Option<String>,
}

#[cfg(target_os = "macos")]
fn get_file_icon(path: &str) -> Option<String> {
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSString, NSData};
    use objc::{msg_send, sel, sel_impl};
    use base64::{Engine as _, engine::general_purpose};

    unsafe {
        let workspace: id = msg_send![objc::class!(NSWorkspace), sharedWorkspace];
        let ns_path = NSString::alloc(nil).init_str(path);
        let icon: id = msg_send![workspace, iconForFile: ns_path];
        
        if icon == nil {
            return None;
        }

        // Convert NSImage to PNG data
        let tiff_data: id = msg_send![icon, TIFFRepresentation];
        if tiff_data == nil {
            return None;
        }

        let image_rep: id = msg_send![objc::class!(NSBitmapImageRep), imageRepWithData: tiff_data];
        if image_rep == nil {
            return None;
        }

        let png_data: id = msg_send![image_rep, representationUsingType: 4 properties: nil]; // 4 is NSPNGFileType
        if png_data == nil {
            return None;
        }

        let length: usize = msg_send![png_data, length];
        let bytes: *const u8 = msg_send![png_data, bytes];
        let slice = std::slice::from_raw_parts(bytes, length);

        Some(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(slice)))
    }
}

#[cfg(not(target_os = "macos"))]
fn get_file_icon(_path: &str) -> Option<String> {
    // TODO: Linux/Windows icon retrieval.
    // Linux requires handling various desktop environments (GNOME, KDE) 
    // and searching through icon themes following Freedesktop standards (MIME types -> Icon Names -> Theme Paths).
    None
}

#[derive(Serialize)]
pub struct DetailedProperties {
    name: String,
    path: String,
    file_type: String,
    location: String,
    size_bytes: u64,
    size_formatted: String,
    size_on_disk_bytes: u64,
    size_on_disk_formatted: String,
    contains_files: u32,
    contains_folders: u32,
    created_formatted: String,
    modified_formatted: String,
    accessed_formatted: String,
    is_readonly: bool,
    is_hidden: bool,
}

fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

fn format_timestamp(ts: i64) -> String {
    if ts == 0 {
        return String::new();
    }
    use std::time::SystemTime;
    let datetime: chrono::DateTime<chrono::Local> = SystemTime::UNIX_EPOCH
        .checked_add(std::time::Duration::from_secs(ts as u64))
        .and_then(|t| chrono::DateTime::try_from(t).ok())
        .unwrap_or_else(chrono::Local::now);
    datetime.format("%Y/%m/%d %H:%M").to_string()
}

#[tauri::command]
pub async fn show_properties(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // Use AppleScript to tell Finder to show info for the file
        let script = format!(
            "tell application \"Finder\" to open information window of (POSIX file \"{}\" as alias)",
            path
        );
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn()
            .map_err(|e| format!("Failed to open properties on Mac: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // Linux is highly dependent on the DE. Fallback to nothing or xdg-open containing dir.
    }

    Ok(())
}

#[tauri::command]
pub async fn get_detailed_properties(path: String) -> Result<DetailedProperties, String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("File or directory not found".into());
    }

    let metadata = std::fs::symlink_metadata(&path_buf).map_err(|e| e.to_string())?;
    let name = path_buf.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone());
    let location = path_buf.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    
    let is_dir = metadata.is_dir();
    let file_type = if is_dir {
        "ファイル フォルダー".to_string()
    } else {
        path_buf.extension()
            .map(|ext| format!("{} ファイル", ext.to_string_lossy().to_uppercase()))
            .unwrap_or_else(|| "ファイル".to_string())
    };

    let created = metadata.created().unwrap_or(UNIX_EPOCH).duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    let modified = metadata.modified().unwrap_or(UNIX_EPOCH).duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    let accessed = metadata.accessed().unwrap_or(UNIX_EPOCH).duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64;

    let mut size_bytes = metadata.len();
    let mut contains_files = 0;
    let mut contains_folders = 0;

    if is_dir {
        // Simple recursive walk to calculate size and counts
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

    // Windows "Size on disk" is typically cluster size aligned. We'll approximate for now.
    let cluster_size = 4096;
    let size_on_disk_bytes = if size_bytes == 0 { 0 } else { ((size_bytes + cluster_size - 1) / cluster_size) * cluster_size };

    let is_readonly = metadata.permissions().mode() & 0o222 == 0;

    let is_hidden = name.starts_with('.'); // Simple cross-platform hidden check

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

#[tauri::command]
pub async fn list_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let dir = fs::read_dir(&path).map_err(|e| e.to_string())?;

    for entry_res in dir {
        if let Ok(entry) = entry_res {
            let file_name = entry.file_name().to_string_lossy().into_owned();
            
            if !show_hidden && file_name.starts_with('.') {
                continue;
            }

            let path_buf = entry.path();
            let path_str = path_buf.to_string_lossy().into_owned();
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            let is_dir = metadata.is_dir();
            let size = metadata.len();
            
            let modified = metadata.modified()
                .unwrap_or(UNIX_EPOCH)
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
                
            let created = metadata.created()
                .unwrap_or(UNIX_EPOCH)
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;

            let file_type = if is_dir {
                "folder".to_string()
            } else {
                path_buf.extension()
                    .map(|ext| ext.to_string_lossy().into_owned())
                    .unwrap_or_default()
            };

            let is_hidden = file_name.starts_with('.') || is_symlink(file_name.as_str());
            let is_symlink = metadata.file_type().is_symlink();
            
            let permissions = format!("{:o}", metadata.permissions().mode() & 0o777);

            entries.push(FileEntry {
                name: file_name,
                path: path_str.clone(),
                is_dir,
                size,
                size_formatted: if is_dir { String::new() } else { format_size(size) },
                modified,
                modified_formatted: format_timestamp(modified),
                created,
                created_formatted: format_timestamp(created),
                file_type,
                is_hidden,
                is_symlink,
                permissions,
                icon: get_file_icon(&path_str),
            });
        }
    }

    Ok(entries)
}

fn is_symlink(_name: &str) -> bool {
    false // Simplified for now
}

#[tauri::command]
pub async fn open_file_default(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;
    
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn copy_files(sources: Vec<String>, dest: String) -> Result<(), String> {
    for src in sources {
        let src_path = std::path::Path::new(&src);
        if !src_path.exists() {
            continue;
        }
        let file_name = src_path.file_name().ok_or("Invalid file name")?;
        let dest_path = std::path::Path::new(&dest).join(file_name);
        
        // 単純化のため、ディレクトリの再帰的コピーはPhase2の要件として一旦除外（またはここではコピー不可とするか、簡単な再帰を実装）
        // 現状はファイルのコピーのみをサポート（シンプルさ優先）
        if src_path.is_file() {
            fs::copy(&src, &dest_path).map_err(|e| format!("Failed to copy {}: {}", src, e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn move_files(sources: Vec<String>, dest: String) -> Result<(), String> {
    for src in sources {
        let src_path = std::path::Path::new(&src);
        if !src_path.exists() {
            continue;
        }
        let file_name = src_path.file_name().ok_or("Invalid file name")?;
        let dest_path = std::path::Path::new(&dest).join(file_name);
        
        fs::rename(&src, &dest_path).map_err(|e| format!("Failed to move {}: {}", src, e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_files(paths: Vec<String>, to_trash: bool) -> Result<(), String> {
    if to_trash {
        trash::delete_all(&paths).map_err(|e| format!("Failed to move to trash: {}", e))?;
    } else {
        for path in paths {
            let p = std::path::Path::new(&path);
            if !p.exists() { continue; }
            if p.is_dir() {
                fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete dir {}: {}", path, e))?;
            } else {
                fs::remove_file(&path).map_err(|e| format!("Failed to delete file {}: {}", path, e))?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let parent = p.parent().ok_or("No parent directory")?;
    let new_path = parent.join(new_name);
    fs::rename(&path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    fs::File::create(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_home_dir() -> Result<String, String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())
}

#[derive(Serialize)]
pub struct VolumeInfo {
    name: String,
    path: String,
    total_bytes: u64,
    free_bytes: u64,
    total_bytes_formatted: String,
    free_bytes_formatted: String,
}

#[tauri::command]
pub async fn list_volumes() -> Result<Vec<VolumeInfo>, String> {
    let mut volumes = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // /Volumes 配下のマウントポイントを列挙
        if let Ok(entries) = fs::read_dir("/Volumes") {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().into_owned();
                let path_str = path.to_string_lossy().into_owned();

                let (total, free) = get_statvfs_info(&path_str);
                volumes.push(VolumeInfo {
                    name,
                    path: path_str,
                    total_bytes: total,
                    free_bytes: free,
                    total_bytes_formatted: format_size(total),
                    free_bytes_formatted: format_size(free),
                });
            }
        }
        // ルートも追加
        let (total, free) = get_statvfs_info("/");
        volumes.insert(0, VolumeInfo {
            name: "Macintosh HD".to_string(),
            path: "/".to_string(),
            total_bytes: total,
            free_bytes: free,
            total_bytes_formatted: format_size(total),
            free_bytes_formatted: format_size(free),
        });
    }

    #[cfg(target_os = "linux")]
    {
        let (total, free) = get_statvfs_info("/");
        volumes.push(VolumeInfo {
            name: "/".to_string(),
            path: "/".to_string(),
            total_bytes: total,
            free_bytes: free,
            total_bytes_formatted: format_size(total),
            free_bytes_formatted: format_size(free),
        });
    }

    Ok(volumes)
}

fn get_statvfs_info(path: &str) -> (u64, u64) {
    use std::ffi::CString;
    use std::mem::MaybeUninit;
    let c_path = CString::new(path).unwrap_or_default();
    unsafe {
        let mut stat = MaybeUninit::<libc::statvfs>::uninit();
        if libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) == 0 {
            let stat = stat.assume_init();
            let total = stat.f_blocks as u64 * stat.f_frsize as u64;
            let free = stat.f_bavail as u64 * stat.f_frsize as u64;
            (total, free)
        } else {
            (0, 0)
        }
    }
}

// --- open_terminal_at コマンド ---

/// 指定されたパスをカレントディレクトリとしてターミナルを開く
#[tauri::command]
pub async fn open_terminal_at(path: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    if !target.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        // AppleScriptでTerminal.appを開き、cdコマンドで指定パスに移動
        let script = format!(
            "tell application \"Terminal\"\n  activate\n  do script \"cd '{}'\"\nend tell",
            path.replace("'", "'\\''")
        );
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Linuxではデフォルトのターミナルエミュレータを使用
        std::process::Command::new("x-terminal-emulator")
            .current_dir(&path)
            .spawn()
            .or_else(|_| {
                std::process::Command::new("gnome-terminal")
                    .arg("--working-directory")
                    .arg(&path)
                    .spawn()
            })
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    Ok(())
}

// --- list_files_sorted コマンド ---

/// list_files_sorted - フィルタ・ソート済みのファイル一覧を返す
#[tauri::command]
pub async fn list_files_sorted(
    path: String,
    show_hidden: bool,
    sort_by: String,
    sort_desc: bool,
    search_query: String,
) -> Result<Vec<FileEntry>, String> {
    let mut entries = list_directory(path, show_hidden).await?;

    // フィルタリング: search_query が空でない場合、ファイル名の部分一致（大文字小文字区別なし）
    if !search_query.is_empty() {
        let query_lower = search_query.to_lowercase();
        entries.retain(|e| e.name.to_lowercase().contains(&query_lower));
    }

    // ソート
    let sort_by_str = sort_by.as_str();
    let dirs_first = sort_by_str != "file_type";

    entries.sort_by(|a, b| {
        // ディレクトリ優先（dirs_first が true の場合）
        if dirs_first {
            match (a.is_dir, b.is_dir) {
                (true, false) => return std::cmp::Ordering::Less,
                (false, true) => return std::cmp::Ordering::Greater,
                _ => {}
            }
        }

        // カラム値によるソート
        let ordering = match sort_by_str {
            "name" => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            "modified" => a.modified.cmp(&b.modified),
            "file_type" => a.file_type.to_lowercase().cmp(&b.file_type.to_lowercase()),
            "size" => a.size.cmp(&b.size),
            _ => std::cmp::Ordering::Equal,
        };

        if sort_desc { ordering.reverse() } else { ordering }
    });

    Ok(entries)
}
#[cfg(test)]
#[path = "filesystem_tests.rs"]
mod tests;

// ============================================
// get_parent_path command
// ============================================

/// 与えられたパスの親ディレクトリパスを返す
/// Unixパスのみ対応
#[tauri::command]
pub async fn get_parent_path(path: String) -> Result<String, String> {
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    // パス区切り文字で分割
    let segments: Vec<&str> = path.split('/').collect();

    // 空のセグメントを除外
    let non_empty: Vec<&str> = segments.into_iter().filter(|s| !s.is_empty()).collect();

    // ルートディレクトリまたはセグメントが1つ以下の場合は自分自身を返す
    if non_empty.len() <= 1 {
        if path.starts_with('/') {
            return Ok("/".to_string());
        }
        return Ok(path);
    }

    // 最後のセグメントを削除して再構築
    let parent_segments = &non_empty[..non_empty.len() - 1];

    if path.starts_with('/') {
        return Ok(format!("/{}", parent_segments.join("/")));
    }

    Ok(parent_segments.join("/"))
}

// ============================================
// complete_path command
// ============================================

/// パス補完候補を返す（ディレクトリのみ、前方一致フィルタリング付き）
#[tauri::command]
pub async fn complete_path(
    dir_path: String,
    prefix: String,
    show_hidden: bool,
) -> Result<Vec<FileEntry>, String> {
    // list_directory の内部ロジックを呼び出し
    let entries = list_directory_internal(&dir_path, show_hidden)?;

    // ディレクトリのみを抽出し、プレフィックスでフィルタリング
    let prefix_lower = prefix.to_lowercase();
    let mut filtered: Vec<FileEntry> = entries
        .into_iter()
        .filter(|e| e.is_dir)
        .filter(|e| e.name.to_lowercase().starts_with(&prefix_lower))
        .collect();

    // アルファベット順（昇順）でソート
    filtered.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(filtered)
}

/// list_directory の同期版内部実装
fn list_directory_internal(path: &str, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let dir = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry_res in dir {
        if let Ok(entry) = entry_res {
            let file_name = entry.file_name().to_string_lossy().into_owned();

            if !show_hidden && file_name.starts_with('.') {
                continue;
            }

            let path_buf = entry.path();
            let path_str = path_buf.to_string_lossy().into_owned();
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            let is_dir = metadata.is_dir();
            let size = metadata.len();

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

            let file_type = if is_dir {
                "folder".to_string()
            } else {
                path_buf
                    .extension()
                    .map(|ext| ext.to_string_lossy().into_owned())
                    .unwrap_or_default()
            };

            let is_hidden = file_name.starts_with('.') || is_symlink(file_name.as_str());
            let is_symlink_val = metadata.file_type().is_symlink();

            let permissions = format!("{:o}", metadata.permissions().mode() & 0o777);

            entries.push(FileEntry {
                name: file_name,
                path: path_str.clone(),
                is_dir,
                size,
                size_formatted: if is_dir { String::new() } else { format_size(size) },
                modified,
                modified_formatted: format_timestamp(modified),
                created,
                created_formatted: format_timestamp(created),
                file_type,
                is_hidden,
                is_symlink: is_symlink_val,
                permissions,
                icon: get_file_icon(&path_str),
            });
        }
    }

    Ok(entries)
}

