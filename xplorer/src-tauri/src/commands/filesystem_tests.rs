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
