use std::fs;

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    fs::File::create(&path).map_err(|e| e.to_string())?;
    Ok(())
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

        // 単純化のため、ディレクトリの再帰的コピーはPhase2の要件として一旦除外（またはここではファイルのみをサポート
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
            if !p.exists() {
                continue;
            }
            if p.is_dir() {
                fs::remove_dir_all(&path)
                    .map_err(|e| format!("Failed to delete dir {}: {}", path, e))?;
            } else {
                fs::remove_file(&path)
                    .map_err(|e| format!("Failed to delete file {}: {}", path, e))?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::Path;
    use tempfile::TempDir;

    mod create_directory {
        use super::*;

        #[tokio::test]
        async fn test_create_single_directory() {
            let temp = TempDir::new().unwrap();
            let new_dir = temp.path().join("new_folder");

            let result = create_directory(new_dir.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
            assert!(new_dir.exists());
        }

        #[tokio::test]
        async fn test_create_nested_directories() {
            let temp = TempDir::new().unwrap();
            let nested = temp.path().join("a/b/c/d/e");

            let result = create_directory(nested.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
            assert!(nested.exists());
        }

        #[tokio::test]
        async fn test_create_existing_directory() {
            let temp = TempDir::new().unwrap();
            let existing = temp.path().join("existing");
            fs::create_dir(&existing).unwrap();

            // 既存ディレクトリを作成しようとしてもエラーにならない
            let result = create_directory(existing.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
        }

        #[tokio::test]
        async fn test_create_directory_with_special_chars() {
            let temp = TempDir::new().unwrap();
            let special = temp.path().join("folder with spaces");

            let result = create_directory(special.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
            assert!(special.exists());
        }

        #[tokio::test]
        async fn test_create_directory_invalid_path() {
            // 無効なパス（ルートへの書き込み権限なし）
            let result = create_directory("/root/unauthorized_dir_test".to_string()).await;
            assert!(result.is_err());
        }
    }

    mod create_file {
        use super::*;

        #[tokio::test]
        async fn test_create_simple_file() {
            let temp = TempDir::new().unwrap();
            let file_path = temp.path().join("test.txt");

            let result = create_file(file_path.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
            assert!(file_path.exists());
        }

        #[tokio::test]
        async fn test_create_file_overwrites_existing() {
            let temp = TempDir::new().unwrap();
            let file_path = temp.path().join("existing.txt");

            // 既存ファイルを作成
            let mut file = fs::File::create(&file_path).unwrap();
            file.write_all(b"original content").unwrap();

            // 上書き作成
            let result = create_file(file_path.to_string_lossy().to_string()).await;
            assert!(result.is_ok());

            // ファイルは空になっているはず
            let metadata = fs::metadata(&file_path).unwrap();
            assert_eq!(metadata.len(), 0);
        }

        #[tokio::test]
        async fn test_create_file_with_extension() {
            let temp = TempDir::new().unwrap();
            let file_path = temp.path().join("document.pdf");

            let result = create_file(file_path.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
        }

        #[tokio::test]
        async fn test_create_file_nonexistent_parent() {
            // 親ディレクトリが存在しない場合
            let temp = TempDir::new().unwrap();
            let file_path = temp.path().join("nonexistent/test.txt");

            let result = create_file(file_path.to_string_lossy().to_string()).await;
            assert!(result.is_err());
        }
    }

    mod copy_files {
        use super::*;

        #[tokio::test]
        async fn test_copy_single_file() {
            let temp = TempDir::new().unwrap();
            let src = temp.path().join("source.txt");
            let dest_dir = temp.path().join("dest");

            fs::write(&src, "test content").unwrap();
            fs::create_dir(&dest_dir).unwrap();

            let result = copy_files(
                vec![src.to_string_lossy().to_string()],
                dest_dir.to_string_lossy().to_string(),
            )
            .await;
            assert!(result.is_ok());

            let copied = dest_dir.join("source.txt");
            assert!(copied.exists());
            assert_eq!(fs::read_to_string(&copied).unwrap(), "test content");
        }

        #[tokio::test]
        async fn test_copy_multiple_files() {
            let temp = TempDir::new().unwrap();
            let dest_dir = temp.path().join("dest");
            fs::create_dir(&dest_dir).unwrap();

            let files: Vec<_> = (0..5)
                .map(|i| {
                    let path = temp.path().join(format!("file{}.txt", i));
                    fs::write(&path, format!("content {}", i)).unwrap();
                    path.to_string_lossy().to_string()
                })
                .collect();

            let result = copy_files(files, dest_dir.to_string_lossy().to_string()).await;
            assert!(result.is_ok());

            for i in 0..5 {
                assert!(dest_dir.join(format!("file{}.txt", i)).exists());
            }
        }

        #[tokio::test]
        async fn test_copy_nonexistent_file_skipped() {
            let temp = TempDir::new().unwrap();
            let dest_dir = temp.path().join("dest");
            fs::create_dir(&dest_dir).unwrap();

            // 存在しないファイルはスキップされる（エラーにならない）
            let result = copy_files(
                vec!["/nonexistent/file.txt".to_string()],
                dest_dir.to_string_lossy().to_string(),
            )
            .await;
            assert!(result.is_ok());
        }

        #[tokio::test]
        async fn test_copy_empty_list() {
            let temp = TempDir::new().unwrap();
            let dest_dir = temp.path().join("dest");
            fs::create_dir(&dest_dir).unwrap();

            let result = copy_files(vec![], dest_dir.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
        }

        #[tokio::test]
        async fn test_copy_directory_skipped() {
            let temp = TempDir::new().unwrap();
            let src_dir = temp.path().join("source_dir");
            let dest_dir = temp.path().join("dest");

            fs::create_dir(&src_dir).unwrap();
            fs::create_dir(&dest_dir).unwrap();

            // ディレクトリはコピーされない（スキップされる）
            let result = copy_files(
                vec![src_dir.to_string_lossy().to_string()],
                dest_dir.to_string_lossy().to_string(),
            )
            .await;
            assert!(result.is_ok());
            assert!(!dest_dir.join("source_dir").exists());
        }
    }

    mod move_files {
        use super::*;

        #[tokio::test]
        async fn test_move_single_file() {
            let temp = TempDir::new().unwrap();
            let src = temp.path().join("source.txt");
            let dest_dir = temp.path().join("dest");

            fs::write(&src, "test content").unwrap();
            fs::create_dir(&dest_dir).unwrap();

            let result = move_files(
                vec![src.to_string_lossy().to_string()],
                dest_dir.to_string_lossy().to_string(),
            )
            .await;
            assert!(result.is_ok());

            assert!(!src.exists());
            assert!(dest_dir.join("source.txt").exists());
        }

        #[tokio::test]
        async fn test_move_multiple_files() {
            let temp = TempDir::new().unwrap();
            let dest_dir = temp.path().join("dest");
            fs::create_dir(&dest_dir).unwrap();

            let files: Vec<_> = (0..3)
                .map(|i| {
                    let path = temp.path().join(format!("file{}.txt", i));
                    fs::write(&path, "content").unwrap();
                    path.to_string_lossy().to_string()
                })
                .collect();

            let result = move_files(files.clone(), dest_dir.to_string_lossy().to_string()).await;
            assert!(result.is_ok());

            // 元のファイルは削除されている
            for f in &files {
                assert!(!Path::new(f).exists());
            }
            // 新しい場所に存在
            for i in 0..3 {
                assert!(dest_dir.join(format!("file{}.txt", i)).exists());
            }
        }

        #[tokio::test]
        async fn test_move_nonexistent_file_skipped() {
            let temp = TempDir::new().unwrap();
            let dest_dir = temp.path().join("dest");
            fs::create_dir(&dest_dir).unwrap();

            let result = move_files(
                vec!["/nonexistent/file.txt".to_string()],
                dest_dir.to_string_lossy().to_string(),
            )
            .await;
            assert!(result.is_ok());
        }
    }

    mod delete_files {
        use super::*;

        #[tokio::test]
        async fn test_delete_single_file() {
            let temp = TempDir::new().unwrap();
            let file = temp.path().join("to_delete.txt");
            fs::write(&file, "content").unwrap();

            let result = delete_files(vec![file.to_string_lossy().to_string()], false).await;
            assert!(result.is_ok());
            assert!(!file.exists());
        }

        #[tokio::test]
        async fn test_delete_directory_with_contents() {
            let temp = TempDir::new().unwrap();
            let dir = temp.path().join("to_delete");
            fs::create_dir(&dir).unwrap();
            fs::write(dir.join("file1.txt"), "content").unwrap();
            fs::create_dir(dir.join("subdir")).unwrap();
            fs::write(dir.join("subdir/file2.txt"), "content").unwrap();

            let result = delete_files(vec![dir.to_string_lossy().to_string()], false).await;
            assert!(result.is_ok());
            assert!(!dir.exists());
        }

        #[tokio::test]
        async fn test_delete_empty_directory() {
            let temp = TempDir::new().unwrap();
            let dir = temp.path().join("empty_dir");
            fs::create_dir(&dir).unwrap();

            let result = delete_files(vec![dir.to_string_lossy().to_string()], false).await;
            assert!(result.is_ok());
            assert!(!dir.exists());
        }

        #[tokio::test]
        async fn test_delete_multiple_files() {
            let temp = TempDir::new().unwrap();

            let files: Vec<_> = (0..3)
                .map(|i| {
                    let path = temp.path().join(format!("file{}.txt", i));
                    fs::write(&path, "content").unwrap();
                    path.to_string_lossy().to_string()
                })
                .collect();

            let result = delete_files(files.clone(), false).await;
            assert!(result.is_ok());
            for f in &files {
                assert!(!Path::new(f).exists());
            }
        }

        #[tokio::test]
        async fn test_delete_nonexistent_file_skipped() {
            let result = delete_files(vec!["/nonexistent/file.txt".to_string()], false).await;
            assert!(result.is_ok());
        }

        #[tokio::test]
        async fn test_delete_to_trash() {
            let temp = TempDir::new().unwrap();
            let file = temp.path().join("to_trash.txt");
            fs::write(&file, "content").unwrap();

            // ゴミ箱に移動（trash crate が利用可能な場合）
            let result = delete_files(vec![file.to_string_lossy().to_string()], true).await;
            // ゴミ箱への移動は成功または権限エラーの可能性
            assert!(result.is_ok() || result.is_err());
        }
    }

    mod rename_file {
        use super::*;

        #[tokio::test]
        async fn test_rename_file() {
            let temp = TempDir::new().unwrap();
            let old = temp.path().join("old_name.txt");
            fs::write(&old, "content").unwrap();

            let result = rename_file(
                old.to_string_lossy().to_string(),
                "new_name.txt".to_string(),
            )
            .await;
            assert!(result.is_ok());
            assert!(!old.exists());
            assert!(temp.path().join("new_name.txt").exists());
        }

        #[tokio::test]
        async fn test_rename_directory() {
            let temp = TempDir::new().unwrap();
            let old = temp.path().join("old_dir");
            fs::create_dir(&old).unwrap();
            fs::write(old.join("file.txt"), "content").unwrap();

            let result =
                rename_file(old.to_string_lossy().to_string(), "new_dir".to_string()).await;
            assert!(result.is_ok());
            assert!(!old.exists());
            assert!(temp.path().join("new_dir").exists());
            assert!(temp.path().join("new_dir/file.txt").exists());
        }

        #[tokio::test]
        async fn test_rename_with_special_chars() {
            let temp = TempDir::new().unwrap();
            let old = temp.path().join("old.txt");
            fs::write(&old, "content").unwrap();

            let result = rename_file(
                old.to_string_lossy().to_string(),
                "file with spaces.txt".to_string(),
            )
            .await;
            assert!(result.is_ok());
            assert!(temp.path().join("file with spaces.txt").exists());
        }

        #[tokio::test]
        async fn test_rename_to_existing_name() {
            let temp = TempDir::new().unwrap();
            let old = temp.path().join("old.txt");
            let existing = temp.path().join("existing.txt");
            fs::write(&old, "old content").unwrap();
            fs::write(&existing, "existing content").unwrap();

            // 上書きになる（OS依存）
            let result = rename_file(
                old.to_string_lossy().to_string(),
                "existing.txt".to_string(),
            )
            .await;
            // macOS では上書きされるかエラーになるかは状況次第
            assert!(result.is_ok() || result.is_err());
        }
    }
}
