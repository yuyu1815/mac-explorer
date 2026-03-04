use serde::Serialize;
use std::fs;
use std::time::UNIX_EPOCH;

#[cfg(unix)]
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
    
    #[cfg(target_os = "windows")]
    {
        // Unfortunately standard process::Command doesn't easily trigger the Win32 Properties dialog directly without complex COM calls.
        // We'll execute an Explorer command as a fallback for now, or just open the containing folder and select it if COM is too much.
        // Actually, there's no native one-liner CLI for "Properties" in Windows, so we'll fallback to selecting the file in Explorer.
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
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

    #[cfg(not(unix))]
    let is_readonly = metadata.permissions().readonly();
    #[cfg(unix)]
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
            
            #[cfg(unix)]
            let permissions = format!("{:o}", metadata.permissions().mode() & 0o777);
            
            #[cfg(not(unix))]
            let permissions = if metadata.permissions().readonly() { "444".to_string() } else { "666".to_string() };

            entries.push(FileEntry {
                name: file_name,
                path: path_str,
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
    
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd").args(["/C", "start", "", &path]).spawn().map_err(|e| e.to_string())?;

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

    #[cfg(target_os = "windows")]
    {
        // Windowsではドライブレターを列挙
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            if std::path::Path::new(&drive).exists() {
                volumes.push(VolumeInfo {
                    name: format!("ローカルディスク ({}:)", letter as char),
                    path: drive,
                    total_bytes: 0,
                    free_bytes: 0,
                    total_bytes_formatted: String::new(),
                    free_bytes_formatted: String::new(),
                });
            }
        }
    }

    Ok(volumes)
}

#[cfg(unix)]
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

#[cfg(not(unix))]
fn get_statvfs_info(_path: &str) -> (u64, u64) {
    (0, 0)
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
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::tempdir;

    // ヘルパー: テスト用の空ファイルを作る
    fn create_dummy_file(path: &PathBuf) {
        fs::write(path, "test").unwrap();
    }

    #[tokio::test]
    async fn test_create_directory() {
        let dir = tempdir().unwrap();
        let target_dir = dir.path().join("new_dir");
        
        // 実行前は存在しない
        assert!(!target_dir.exists());

        // 実行
        let res = create_directory(target_dir.to_string_lossy().into_owned()).await;
        assert!(res.is_ok());

        // 実行後は存在する
        assert!(target_dir.exists());
        assert!(target_dir.is_dir());
    }

    #[tokio::test]
    async fn test_create_file() {
        let dir = tempdir().unwrap();
        let target_file = dir.path().join("new_file.txt");

        let res = create_file(target_file.to_string_lossy().into_owned()).await;
        assert!(res.is_ok());
        assert!(target_file.exists());
        assert!(target_file.is_file());
    }

    #[tokio::test]
    async fn test_list_directory() {
        let dir = tempdir().unwrap();
        
        // 2つのファイルと1つのディレクトリを作成
        create_dummy_file(&dir.path().join("file1.txt"));
        create_dummy_file(&dir.path().join("file2.txt"));
        fs::create_dir(dir.path().join("subdir")).unwrap();

        let entries = list_directory(dir.path().to_string_lossy().into_owned(), true).await.unwrap();
        
        assert_eq!(entries.len(), 3);
        let folders: Vec<_> = entries.iter().filter(|e| e.is_dir).collect();
        let files: Vec<_> = entries.iter().filter(|e| !e.is_dir).collect();
        
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].name, "subdir");
        
        assert_eq!(files.len(), 2);
    }

    #[tokio::test]
    async fn test_copy_files() {
        let dir = tempdir().unwrap();
        let src_file = dir.path().join("src.txt");
        create_dummy_file(&src_file);
        
        let dest_dir = dir.path().join("dest");
        fs::create_dir(&dest_dir).unwrap();
        
        let res = copy_files(
            vec![src_file.to_string_lossy().into_owned()],
            dest_dir.to_string_lossy().into_owned()
        ).await;
        
        assert!(res.is_ok());
        assert!(dest_dir.join("src.txt").exists()); // コピー先が存在すること
        assert!(src_file.exists()); // コピー元も存在すること
    }

    #[tokio::test]
    async fn test_move_files() {
        let dir = tempdir().unwrap();
        let src_file = dir.path().join("src.txt");
        create_dummy_file(&src_file);
        
        let dest_dir = dir.path().join("dest");
        fs::create_dir(&dest_dir).unwrap();
        
        let res = move_files(
            vec![src_file.to_string_lossy().into_owned()],
            dest_dir.to_string_lossy().into_owned()
        ).await;
        
        assert!(res.is_ok());
        assert!(dest_dir.join("src.txt").exists()); // 移動先が存在すること
        assert!(!src_file.exists()); // 移動元が消えていること
    }

    #[tokio::test]
    async fn test_rename_file() {
        let dir = tempdir().unwrap();
        let src_file = dir.path().join("old_name.txt");
        create_dummy_file(&src_file);
        
        let res = rename_file(src_file.to_string_lossy().into_owned(), "new_name.txt".to_string()).await;
        
        assert!(res.is_ok());
        assert!(!src_file.exists());
        assert!(dir.path().join("new_name.txt").exists()); // 新しい名前で存在すること
    }

    #[tokio::test]
    async fn test_delete_files_not_trash() {
        let dir = tempdir().unwrap();
        let src_file = dir.path().join("delete_me.txt");
        let src_dir = dir.path().join("delete_dir");

        create_dummy_file(&src_file);
        fs::create_dir(&src_dir).unwrap();
        create_dummy_file(&src_dir.join("inside.txt")); // 内部にファイルがあっても消えるか

        let paths = vec![
            src_file.to_string_lossy().into_owned(),
            src_dir.to_string_lossy().into_owned(),
        ];

        let res = delete_files(paths, false).await;
        
        assert!(res.is_ok());
        assert!(!src_file.exists());
        assert!(!src_dir.exists());
    }

    #[tokio::test]
    async fn test_integration_flow() {
        // 複合テスト: ファイル操作の一連の流れをテスト
        let base_dir = tempdir().unwrap();
        let base_path = base_dir.path().to_string_lossy().into_owned();

        // 1. ディレクトリとファイルの作成
        let target_dir = format!("{}/test_flow", base_path);
        assert!(create_directory(target_dir.clone()).await.is_ok());
        assert!(create_file(format!("{}/f1.txt", target_dir)).await.is_ok());

        // 2. リスト取得（1ファイルあるはず）
        let list1 = list_directory(target_dir.clone(), true).await.unwrap();
        assert_eq!(list1.len(), 1);
        assert_eq!(list1[0].name, "f1.txt");

        // 3. ファイルの複製と同ディレクトリ内操作によるリネーム
        let f1_path = list1[0].path.clone();
        let dest_dir = format!("{}/dest", base_path);
        assert!(create_directory(dest_dir.clone()).await.is_ok());
        
        assert!(copy_files(vec![f1_path.clone()], dest_dir.clone()).await.is_ok());
        assert!(rename_file(format!("{}/f1.txt", dest_dir), "f1_copy.txt".to_string()).await.is_ok());

        // 4. 移動
        assert!(move_files(vec![format!("{}/f1_copy.txt", dest_dir)], target_dir.clone()).await.is_ok());

        // 5. 再リスト取得（f1.txt と f1_copy.txt の2つがあるはず）
        let list2 = list_directory(target_dir.clone(), true).await.unwrap();
        assert_eq!(list2.len(), 2);
        
        // 6. まとめて削除
        let paths_to_delete: Vec<String> = list2.into_iter().map(|e| e.path).collect();
        assert!(delete_files(paths_to_delete, false).await.is_ok());

        // 空になっていることの確認
        let list3 = list_directory(target_dir.clone(), true).await.unwrap();
        assert_eq!(list3.len(), 0);
    }

    #[tokio::test]
    async fn test_e2e_real_directory() {
        // 環境依存パス（絶対パスのハードコード）を避け、OSのテンポラリディレクトリ下に特定ディレクトリを作成して実験を行う
        let base_path_buf = std::env::temp_dir().join("xplorer_e2e_experiment");
        let base_path = base_path_buf.to_string_lossy().into_owned();

        // 既存テスト環境のクリーンアップ（もしあれば）
        let _ = fs::remove_dir_all(&base_path);

        // 1. 実験用ディレクトリの作成
        assert!(create_directory(base_path.clone()).await.is_ok());

        // 2. 複数のファイルとフォルダを作成
        let file1 = format!("{}/file1.txt", base_path);
        let file2 = format!("{}/file2.txt", base_path);
        let sub_dir = format!("{}/subfolder", base_path);

        assert!(create_file(file1.clone()).await.is_ok());
        assert!(create_file(file2.clone()).await.is_ok());
        assert!(create_directory(sub_dir.clone()).await.is_ok());

        // 中身の確認（3つあるか）
        let entries = list_directory(base_path.clone(), true).await.unwrap();
        assert_eq!(entries.len(), 3);

        // 3. コピー操作（file1 -> subfolder/file1.txt）
        assert!(copy_files(vec![file1.clone()], sub_dir.clone()).await.is_ok());

        let sub_entries = list_directory(sub_dir.clone(), true).await.unwrap();
        assert_eq!(sub_entries.len(), 1);
        assert_eq!(sub_entries[0].name, "file1.txt");

        // 4. リネーム操作（subfolder/file1.txt -> subfolder/renamed.txt）
        let copied_file = format!("{}/file1.txt", sub_dir);
        assert!(rename_file(copied_file, "renamed.txt".to_string()).await.is_ok());

        // 5. 移動操作（subfolder/renamed.txt -> base_path/renamed.txt）
        let renamed_file = format!("{}/renamed.txt", sub_dir);
        assert!(move_files(vec![renamed_file], base_path.clone()).await.is_ok());

        // 元の場所に4つのエントリがあるか確認 (file1, file2, subfolder, renamed)
        let entries_after_move = list_directory(base_path.clone(), true).await.unwrap();
        assert_eq!(entries_after_move.len(), 4);

        // 6. 削除操作 (subfolder と file2 を消す)
        let paths_to_delete = vec![sub_dir.clone(), file2.clone()];
        assert!(delete_files(paths_to_delete, false).await.is_ok());

        // 残っているのは file1.txt と renamed.txt のはず
        let final_entries = list_directory(base_path.clone(), true).await.unwrap();
        assert_eq!(final_entries.len(), 2);

        // テスト後のクリーンアップ: /tmp 内を元の状態に戻す
        let _ = fs::remove_dir_all(&base_path);
    }

    // ============================================
    // list_files_sorted tests
    // ============================================

    /// Helper function to call list_files_sorted with simplified arguments
    async fn call_list_files_sorted(
        path: &str,
        show_hidden: bool,
        sort_by: &str,
        sort_desc: bool,
        search_query: &str,
    ) -> Result<Vec<FileEntry>, String> {
        let args = ListFilesSortedArgs {
            path: path.to_string(),
            show_hidden,
            sort_by: sort_by.to_string(),
            sort_desc,
            search_query: search_query.to_string(),
        };
        list_files_sorted(args).await
    }

    #[tokio::test]
    async fn test_list_files_sorted_basic() {
        let dir = tempdir().unwrap();
        let path = dir.path().to_string_lossy().into_owned();

        // Create test files and directories
        // Files: apple.txt, banana.txt, cherry.pdf
        // Dirs: Alpha, Beta
        create_dummy_file(&dir.path().join("banana.txt"));
        create_dummy_file(&dir.path().join("apple.txt"));
        create_dummy_file(&dir.path().join("cherry.pdf"));
        fs::create_dir(dir.path().join("Beta")).unwrap();
        fs::create_dir(dir.path().join("Alpha")).unwrap();

        // Test 1: Sort by name (ascending)
        let entries = call_list_files_sorted(&path, true, "name", false, "")
            .await
            .unwrap();

        // Directories should come first (Alpha, Beta), then files (apple.txt, banana.txt, cherry.pdf)
        assert_eq!(entries.len(), 5);
        assert!(entries[0].is_dir);
        assert!(entries[1].is_dir);
        assert!(!entries[2].is_dir);

        // Directories sorted alphabetically
        assert_eq!(entries[0].name, "Alpha");
        assert_eq!(entries[1].name, "Beta");

        // Files sorted alphabetically
        assert_eq!(entries[2].name, "apple.txt");
        assert_eq!(entries[3].name, "banana.txt");
        assert_eq!(entries[4].name, "cherry.pdf");

        // Test 2: Sort by name (descending)
        let entries_desc = call_list_files_sorted(&path, true, "name", true, "")
            .await
            .unwrap();

        assert_eq!(entries_desc.len(), 5);
        // Directories still first, but in reverse order
        assert_eq!(entries_desc[0].name, "Beta");
        assert_eq!(entries_desc[1].name, "Alpha");
        // Files in reverse order
        assert_eq!(entries_desc[2].name, "cherry.pdf");
        assert_eq!(entries_desc[3].name, "banana.txt");
        assert_eq!(entries_desc[4].name, "apple.txt");
    }

    #[tokio::test]
    async fn test_list_files_sorted_with_search() {
        let dir = tempdir().unwrap();
        let path = dir.path().to_string_lossy().into_owned();

        // Create test files with different names
        create_dummy_file(&dir.path().join("document.txt"));
        create_dummy_file(&dir.path().join("report.txt"));
        create_dummy_file(&dir.path().join("notes.md"));
        create_dummy_file(&dir.path().join("README.txt"));
        fs::create_dir(dir.path().join("documents")).unwrap();
        fs::create_dir(dir.path().join("pictures")).unwrap();

        // Test 1: Search for "doc" (case-insensitive)
        let entries = call_list_files_sorted(&path, true, "name", false, "doc")
            .await
            .unwrap();

        // Should return: documents (dir), document.txt
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "documents");
        assert!(entries[0].is_dir);
        assert_eq!(entries[1].name, "document.txt");
        assert!(!entries[1].is_dir);

        // Test 2: Search for ".txt"
        let txt_entries = call_list_files_sorted(&path, true, "name", false, ".txt")
            .await
            .unwrap();

        // Should return: document.txt, report.txt, README.txt
        assert_eq!(txt_entries.len(), 3);
        let names: Vec<&str> = txt_entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"document.txt"));
        assert!(names.contains(&"report.txt"));
        assert!(names.contains(&"README.txt"));

        // Test 3: Search with no matches
        let no_matches = call_list_files_sorted(&path, true, "name", false, "xyz123")
            .await
            .unwrap();
        assert_eq!(no_matches.len(), 0);

        // Test 4: Empty search query returns all entries
        let all_entries = call_list_files_sorted(&path, true, "name", false, "")
            .await
            .unwrap();
        assert_eq!(all_entries.len(), 6);
    }

    #[tokio::test]
    async fn test_list_files_sorted_camelcase_deser() {
        // TypeScript側からの呼び出しをシミュレート（camelCase）
        let json = r#"{
            "path": "/tmp",
            "showHidden": false,
            "sortBy": "name",
            "sortDesc": false,
            "searchQuery": ""
        }"#;

        let args: ListFilesSortedArgs = serde_json::from_str(json)
            .expect("Failed to deserialize camelCase JSON");

        assert_eq!(args.path, "/tmp");
        assert_eq!(args.show_hidden, false);
        assert_eq!(args.sort_by, "name");
        assert_eq!(args.sort_desc, false);
        assert_eq!(args.search_query, "");
    }

    #[tokio::test]
    async fn test_list_files_sorted_dirs_first() {
        let dir = tempdir().unwrap();
        let path = dir.path().to_string_lossy().into_owned();

        // Create mixed files and directories
        // Using names that would sort files before dirs if dirs_first was disabled
        create_dummy_file(&dir.path().join("aaa_file.txt")); // Would be first alphabetically
        create_dummy_file(&dir.path().join("zzz_file.txt"));
        fs::create_dir(dir.path().join("mmm_dir")).unwrap();
        fs::create_dir(dir.path().join("aaa_dir")).unwrap();

        // Test: Sort by name - directories should always come first
        let entries = call_list_files_sorted(&path, true, "name", false, "")
            .await
            .unwrap();

        assert_eq!(entries.len(), 4);

        // First two should be directories (sorted alphabetically)
        assert!(entries[0].is_dir, "First entry should be a directory");
        assert!(entries[1].is_dir, "Second entry should be a directory");
        assert_eq!(entries[0].name, "aaa_dir");
        assert_eq!(entries[1].name, "mmm_dir");

        // Last two should be files (sorted alphabetically)
        assert!(!entries[2].is_dir, "Third entry should be a file");
        assert!(!entries[3].is_dir, "Fourth entry should be a file");
        assert_eq!(entries[2].name, "aaa_file.txt");
        assert_eq!(entries[3].name, "zzz_file.txt");

        // Test: Sort by size - directories should still come first
        let size_entries = call_list_files_sorted(&path, true, "size", false, "")
            .await
            .unwrap();

        assert!(size_entries[0].is_dir, "First entry (size sort) should be a directory");
        assert!(size_entries[1].is_dir, "Second entry (size sort) should be a directory");

        // Test: Sort by modified - directories should still come first
        let modified_entries = call_list_files_sorted(&path, true, "modified", false, "")
            .await
            .unwrap();

        assert!(modified_entries[0].is_dir, "First entry (modified sort) should be a directory");
        assert!(modified_entries[1].is_dir, "Second entry (modified sort) should be a directory");

        // Test: Sort by file_type - directories should NOT be prioritized
        // (dirs_first is false when sort_by == "file_type")
        let filetype_entries = call_list_files_sorted(&path, true, "file_type", false, "")
            .await
            .unwrap();

        // When sorting by file_type, dirs_first is disabled, so order depends on file_type
        // Directories have file_type "folder", files have their extension
        // "folder" vs "txt" - "folder" comes before "txt" alphabetically
        // But this is implementation-specific; the key point is dirs_first is disabled
        assert_eq!(filetype_entries.len(), 4);
    }
}

// ============================================
// get_parent_path command
// ============================================

/// 与えられたパスの親ディレクトリパスを返す
/// Unix/Windows両方のパス区切り文字に対応
#[tauri::command]
pub async fn get_parent_path(path: String) -> Result<String, String> {
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    // パス区切り文字で分割（/ と \ の両方に対応）
    let segments: Vec<&str> = path.split(|c| c == '/' || c == '\\').collect();

    // 空のセグメントを除外（連続する区切り文字や末尾の区切り文字対策）
    let non_empty: Vec<&str> = segments.into_iter().filter(|s| !s.is_empty()).collect();

    // ルートディレクトリまたはセグメントが1つ以下の場合は自分自身を返す
    if non_empty.len() <= 1 {
        // Unix ルート
        if path.starts_with('/') {
            return Ok("/".to_string());
        }
        // Windows ドライブレター (C:\ など)
        if path.contains(':') {
            let drive_end = path.find(':').unwrap() + 1;
            let drive = &path[..drive_end];
            return Ok(format!("{}\\", drive));
        }
        return Ok(path);
    }

    // 最後のセグメントを削除して再構築
    let parent_segments = &non_empty[..non_empty.len() - 1];

    // 元のパスが / で始まる場合は Unix パス
    if path.starts_with('/') {
        return Ok(format!("/{}", parent_segments.join("/")));
    }

    // 元のパスが \ を含むか : を含む場合は Windows パス
    if path.contains('\\') || path.contains(':') {
        return Ok(parent_segments.join("\\"));
    }

    // それ以外は Unix スタイル
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

            #[cfg(unix)]
            let permissions = format!("{:o}", metadata.permissions().mode() & 0o777);

            #[cfg(not(unix))]
            let permissions = if metadata.permissions().readonly() {
                "444".to_string()
            } else {
                "666".to_string()
            };

            entries.push(FileEntry {
                name: file_name,
                path: path_str,
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
            });
        }
    }

    Ok(entries)
}

