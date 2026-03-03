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
    modified: i64,
    created: i64,
    file_type: String,
    is_hidden: bool,
    is_symlink: bool,
    permissions: String,
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
                modified,
                created,
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
}

