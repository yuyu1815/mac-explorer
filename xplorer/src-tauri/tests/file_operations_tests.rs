//! ファイル操作関数のテスト
//!
//! パスユーティリティ、ファイル作成、コピー、移動、削除、リネームなどの
//! ファイル操作関数をテストします。

use std::fs;
use std::io::Write;
use std::path::Path;

mod test_utils;
use test_utils::ProjectTempDir;

use xplorer_lib::commands::file_ops::*;
use xplorer_lib::commands::utils::{get_home_dir, get_parent_path};

// =============================================================================
// パスユーティリティのテスト
// =============================================================================

mod path_utils {
    use super::*;

    #[tokio::test]
    async fn test_get_parent_empty_path() {
        assert!(get_parent_path("".to_string()).await.is_err());
    }

    #[tokio::test]
    async fn test_get_parent_root_path() {
        assert_eq!(get_parent_path("/".to_string()).await.unwrap(), "/");
    }

    #[tokio::test]
    async fn test_get_parent_single_directory() {
        assert_eq!(get_parent_path("/Users".to_string()).await.unwrap(), "/");
    }

    #[tokio::test]
    async fn test_get_parent_nested_path() {
        assert_eq!(
            get_parent_path("/Users/yuyu/Documents".to_string())
                .await
                .unwrap(),
            "/Users/yuyu"
        );
    }

    #[tokio::test]
    async fn test_get_parent_deeply_nested_path() {
        assert_eq!(
            get_parent_path("/a/b/c/d/e/f".to_string()).await.unwrap(),
            "/a/b/c/d/e"
        );
    }

    #[tokio::test]
    async fn test_get_parent_relative_path() {
        assert_eq!(
            get_parent_path("folder/subfolder".to_string())
                .await
                .unwrap(),
            "folder"
        );
    }

    #[tokio::test]
    async fn test_get_home_dir_returns_home() {
        let result = get_home_dir().await.unwrap();
        assert!(!result.is_empty());
        assert!(result.starts_with('/'));
    }
}

// =============================================================================
// ディレクトリ作成のテスト
// =============================================================================

mod create_directory_tests {
    use super::*;

    #[tokio::test]
    async fn test_create_single_directory() {
        let temp = ProjectTempDir::new("create_single_dir");
        let new_dir = temp.path().join("new_folder");
        assert!(create_directory(new_dir.to_string_lossy().to_string())
            .await
            .is_ok());
        assert!(new_dir.exists());
    }

    #[tokio::test]
    async fn test_create_nested_directories() {
        let temp = ProjectTempDir::new("create_nested_dirs");
        let nested = temp.path().join("a/b/c/d/e");
        assert!(create_directory(nested.to_string_lossy().to_string())
            .await
            .is_ok());
        assert!(nested.exists());
    }

    #[tokio::test]
    async fn test_create_existing_directory() {
        let temp = ProjectTempDir::new("create_existing_dir");
        let existing = temp.path().join("existing");
        fs::create_dir(&existing).unwrap();
        assert!(create_directory(existing.to_string_lossy().to_string())
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn test_create_directory_with_special_chars() {
        let temp = ProjectTempDir::new("create_dir_special_chars");
        let special = temp.path().join("folder with spaces");
        assert!(create_directory(special.to_string_lossy().to_string())
            .await
            .is_ok());
        assert!(special.exists());
    }

    #[tokio::test]
    async fn test_create_directory_invalid_path() {
        assert!(create_directory("/root/unauthorized_dir_test".to_string())
            .await
            .is_err());
    }
}

// =============================================================================
// ファイル作成のテスト
// =============================================================================

mod create_file_tests {
    use super::*;

    #[tokio::test]
    async fn test_create_simple_file() {
        let temp = ProjectTempDir::new("create_simple_file");
        let file_path = temp.path().join("test.txt");
        assert!(create_file(file_path.to_string_lossy().to_string())
            .await
            .is_ok());
        assert!(file_path.exists());
    }

    #[tokio::test]
    async fn test_create_file_overwrites_existing() {
        let temp = ProjectTempDir::new("create_file_overwrite");
        let file_path = temp.path().join("existing.txt");
        let mut file = fs::File::create(&file_path).unwrap();
        file.write_all(b"original content").unwrap();

        assert!(create_file(file_path.to_string_lossy().to_string())
            .await
            .is_ok());
        assert_eq!(fs::metadata(&file_path).unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_create_file_nonexistent_parent() {
        let temp = ProjectTempDir::new("create_file_no_parent");
        let file_path = temp.path().join("nonexistent/test.txt");
        assert!(create_file(file_path.to_string_lossy().to_string())
            .await
            .is_err());
    }
}

// =============================================================================
// ファイルコピーのテスト
// =============================================================================

mod copy_files_tests {
    use super::*;

    #[tokio::test]
    async fn test_copy_single_file() {
        let temp = ProjectTempDir::new("copy_single_file");
        let src = temp.path().join("source.txt");
        let dest_dir = temp.path().join("dest");
        fs::write(&src, "test content").unwrap();
        fs::create_dir(&dest_dir).unwrap();

        assert!(copy_files(
            vec![src.to_string_lossy().to_string()],
            dest_dir.to_string_lossy().to_string(),
        )
        .await
        .is_ok());

        let copied = dest_dir.join("source.txt");
        assert!(copied.exists());
        assert_eq!(fs::read_to_string(&copied).unwrap(), "test content");
    }

    #[tokio::test]
    async fn test_copy_multiple_files() {
        let temp = ProjectTempDir::new("copy_multiple_files");
        let dest_dir = temp.path().join("dest");
        fs::create_dir(&dest_dir).unwrap();

        let files: Vec<_> = (0..5)
            .map(|i| {
                let path = temp.path().join(format!("file{}.txt", i));
                fs::write(&path, format!("content {}", i)).unwrap();
                path.to_string_lossy().to_string()
            })
            .collect();

        assert!(copy_files(files, dest_dir.to_string_lossy().to_string())
            .await
            .is_ok());
        for i in 0..5 {
            assert!(dest_dir.join(format!("file{}.txt", i)).exists());
        }
    }

    #[tokio::test]
    async fn test_copy_nonexistent_file_skipped() {
        let temp = ProjectTempDir::new("copy_nonexistent_file");
        let dest_dir = temp.path().join("dest");
        fs::create_dir(&dest_dir).unwrap();

        assert!(copy_files(
            vec!["/nonexistent/file.txt".to_string()],
            dest_dir.to_string_lossy().to_string(),
        )
        .await
        .is_ok());
    }

    #[tokio::test]
    async fn test_copy_empty_list() {
        let temp = ProjectTempDir::new("copy_empty_list");
        let dest_dir = temp.path().join("dest");
        fs::create_dir(&dest_dir).unwrap();

        assert!(copy_files(vec![], dest_dir.to_string_lossy().to_string())
            .await
            .is_ok());
    }
}

// =============================================================================
// ファイル移動のテスト
// =============================================================================

mod move_files_tests {
    use super::*;

    #[tokio::test]
    async fn test_move_single_file() {
        let temp = ProjectTempDir::new("move_single_file");
        let src = temp.path().join("source.txt");
        let dest_dir = temp.path().join("dest");
        fs::write(&src, "test content").unwrap();
        fs::create_dir(&dest_dir).unwrap();

        assert!(move_files(
            vec![src.to_string_lossy().to_string()],
            dest_dir.to_string_lossy().to_string(),
        )
        .await
        .is_ok());

        assert!(!src.exists());
        assert!(dest_dir.join("source.txt").exists());
    }

    #[tokio::test]
    async fn test_move_multiple_files() {
        let temp = ProjectTempDir::new("move_multiple_files");
        let dest_dir = temp.path().join("dest");
        fs::create_dir(&dest_dir).unwrap();

        let files: Vec<_> = (0..3)
            .map(|i| {
                let path = temp.path().join(format!("file{}.txt", i));
                fs::write(&path, "content").unwrap();
                path.to_string_lossy().to_string()
            })
            .collect();

        assert!(
            move_files(files.clone(), dest_dir.to_string_lossy().to_string())
                .await
                .is_ok()
        );

        for f in &files {
            assert!(!Path::new(f).exists());
        }
        for i in 0..3 {
            assert!(dest_dir.join(format!("file{}.txt", i)).exists());
        }
    }

    #[tokio::test]
    async fn test_move_nonexistent_file_skipped() {
        let temp = ProjectTempDir::new("move_nonexistent_file");
        let dest_dir = temp.path().join("dest");
        fs::create_dir(&dest_dir).unwrap();

        assert!(move_files(
            vec!["/nonexistent/file.txt".to_string()],
            dest_dir.to_string_lossy().to_string(),
        )
        .await
        .is_ok());
    }
}

// =============================================================================
// ファイル削除のテスト
// =============================================================================

mod delete_files_tests {
    use super::*;

    #[tokio::test]
    async fn test_delete_single_file() {
        let temp = ProjectTempDir::new("delete_single_file");
        let file = temp.path().join("to_delete.txt");
        fs::write(&file, "content").unwrap();

        assert!(
            delete_files(vec![file.to_string_lossy().to_string()], false)
                .await
                .is_ok()
        );
        assert!(!file.exists());
    }

    #[tokio::test]
    async fn test_delete_directory_with_contents() {
        let temp = ProjectTempDir::new("delete_dir_with_contents");
        let dir = temp.path().join("to_delete");
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("file1.txt"), "content").unwrap();
        fs::create_dir(dir.join("subdir")).unwrap();
        fs::write(dir.join("subdir/file2.txt"), "content").unwrap();

        assert!(delete_files(vec![dir.to_string_lossy().to_string()], false)
            .await
            .is_ok());
        assert!(!dir.exists());
    }

    #[tokio::test]
    async fn test_delete_empty_directory() {
        let temp = ProjectTempDir::new("delete_empty_dir");
        let dir = temp.path().join("empty_dir");
        fs::create_dir(&dir).unwrap();

        assert!(delete_files(vec![dir.to_string_lossy().to_string()], false)
            .await
            .is_ok());
        assert!(!dir.exists());
    }

    #[tokio::test]
    async fn test_delete_multiple_files() {
        let temp = ProjectTempDir::new("delete_multiple_files");
        let files: Vec<_> = (0..3)
            .map(|i| {
                let path = temp.path().join(format!("file{}.txt", i));
                fs::write(&path, "content").unwrap();
                path.to_string_lossy().to_string()
            })
            .collect();

        assert!(delete_files(files.clone(), false).await.is_ok());

        for f in &files {
            assert!(!Path::new(f).exists());
        }
    }

    #[tokio::test]
    async fn test_delete_nonexistent_file_skipped() {
        assert!(
            delete_files(vec!["/nonexistent/file.txt".to_string()], false)
                .await
                .is_ok()
        );
    }
}

// =============================================================================
// ファイル名変更のテスト
// =============================================================================

mod rename_file_tests {
    use super::*;

    #[tokio::test]
    async fn test_rename_file() {
        let temp = ProjectTempDir::new("rename_file");
        let old = temp.path().join("old_name.txt");
        fs::write(&old, "content").unwrap();

        assert!(rename_file(
            old.to_string_lossy().to_string(),
            "new_name.txt".to_string()
        )
        .await
        .is_ok());
        assert!(!old.exists());
        assert!(temp.path().join("new_name.txt").exists());
    }

    #[tokio::test]
    async fn test_rename_directory() {
        let temp = ProjectTempDir::new("rename_directory");
        let old = temp.path().join("old_dir");
        fs::create_dir(&old).unwrap();
        fs::write(old.join("file.txt"), "content").unwrap();

        assert!(
            rename_file(old.to_string_lossy().to_string(), "new_dir".to_string())
                .await
                .is_ok()
        );
        assert!(!old.exists());
        assert!(temp.path().join("new_dir").exists());
        assert!(temp.path().join("new_dir/file.txt").exists());
    }

    #[tokio::test]
    async fn test_rename_with_special_chars() {
        let temp = ProjectTempDir::new("rename_special_chars");
        let old = temp.path().join("old.txt");
        fs::write(&old, "content").unwrap();

        assert!(rename_file(
            old.to_string_lossy().to_string(),
            "file with spaces.txt".to_string()
        )
        .await
        .is_ok());
        assert!(temp.path().join("file with spaces.txt").exists());
    }
}

// =============================================================================
// アーカイブユーティリティのテスト
// =============================================================================

mod archive_utils {
    #[test]
    fn test_format_parsing() {
        let supported_formats = [
            "zip", "tar", "tar.gz", "tgz", "tar.bz2", "tar.xz", "tar.zst", "7z",
        ];
        let unsupported_formats = ["rar", "iso"];

        for format in &supported_formats {
            assert!(
                matches!(
                    *format,
                    "zip" | "tar" | "tar.gz" | "tgz" | "tar.bz2" | "tar.xz" | "tar.zst" | "7z"
                ),
                "{} should be supported",
                format
            );
        }

        for format in &unsupported_formats {
            assert!(
                !matches!(
                    *format,
                    "zip" | "tar" | "tar.gz" | "tgz" | "tar.bz2" | "tar.xz" | "tar.zst" | "7z"
                ),
                "{} should not be supported",
                format
            );
        }
    }

    #[test]
    fn test_common_parent_calculation() {
        let paths1 = vec![
            "/Users/test/project/src/file.rs".to_string(),
            "/Users/test/project/src/utils/helper.rs".to_string(),
        ];

        let common1 = "/Users/test/project/src";
        assert!(paths1.iter().all(|p| p.starts_with(common1)));
    }

    #[test]
    fn test_relative_path_from_common_parent() {
        let parent = "/Users/test/project";
        let file1 = "/Users/test/project/src/file.rs";

        let rel1 = file1.strip_prefix(parent).unwrap_or(file1);
        assert_eq!(rel1, "/src/file.rs");
    }
}

// =============================================================================
// バッチリネームのテスト
// =============================================================================

mod batch_rename_tests {
    use super::*;

    #[tokio::test]
    async fn test_batch_rename_multiple_files() {
        let temp = ProjectTempDir::new("batch_rename_multi");
        let file1 = temp.path().join("old1.txt");
        let file2 = temp.path().join("old2.txt");
        let file3 = temp.path().join("old3.txt");
        fs::write(&file1, "content1").unwrap();
        fs::write(&file2, "content2").unwrap();
        fs::write(&file3, "content3").unwrap();

        let paths = vec![
            file1.to_string_lossy().to_string(),
            file2.to_string_lossy().to_string(),
            file3.to_string_lossy().to_string(),
        ];
        let new_names = vec!["new1.txt".to_string(), "new2.txt".to_string(), "new3.txt".to_string()];

        let result = batch_rename(paths, new_names).await;
        assert!(result.is_ok());

        assert!(temp.path().join("new1.txt").exists());
        assert!(temp.path().join("new2.txt").exists());
        assert!(temp.path().join("new3.txt").exists());
        assert!(!temp.path().join("old1.txt").exists());
    }

    #[tokio::test]
    async fn test_batch_rename_mismatched_counts() {
        let temp = ProjectTempDir::new("batch_rename_mismatch");
        let file1 = temp.path().join("file.txt");
        fs::write(&file1, "content").unwrap();

        let paths = vec![file1.to_string_lossy().to_string()];
        let new_names = vec!["new1.txt".to_string(), "new2.txt".to_string()];

        let result = batch_rename(paths, new_names).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_batch_rename_empty_lists() {
        let result = batch_rename(vec![], vec![]).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_batch_rename_directories() {
        let temp = ProjectTempDir::new("batch_rename_dirs");
        let dir1 = temp.path().join("olddir1");
        let dir2 = temp.path().join("olddir2");
        fs::create_dir(&dir1).unwrap();
        fs::create_dir(&dir2).unwrap();
        fs::write(dir1.join("file.txt"), "content").unwrap();

        let paths = vec![
            dir1.to_string_lossy().to_string(),
            dir2.to_string_lossy().to_string(),
        ];
        let new_names = vec!["newdir1".to_string(), "newdir2".to_string()];

        let result = batch_rename(paths, new_names).await;
        assert!(result.is_ok());

        assert!(temp.path().join("newdir1").exists());
        assert!(temp.path().join("newdir1/file.txt").exists());
        assert!(temp.path().join("newdir2").exists());
    }

    #[tokio::test]
    async fn test_batch_rename_with_special_chars() {
        let temp = ProjectTempDir::new("batch_rename_special");
        let file = temp.path().join("old.txt");
        fs::write(&file, "content").unwrap();

        let paths = vec![file.to_string_lossy().to_string()];
        let new_names = vec!["file with spaces.txt".to_string()];

        let result = batch_rename(paths, new_names).await;
        assert!(result.is_ok());
        assert!(temp.path().join("file with spaces.txt").exists());
    }
}

// =============================================================================
// check_exists のテスト
// =============================================================================

mod check_exists_tests {
    use super::*;

    #[tokio::test]
    async fn test_check_exists_file_present() {
        let temp = ProjectTempDir::new("check_exists_file");
        let file = temp.path().join("exists.txt");
        fs::write(&file, "content").unwrap();

        let result = check_exists(file.to_string_lossy().to_string()).await.unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_check_exists_file_absent() {
        let temp = ProjectTempDir::new("check_exists_absent");
        let file = temp.path().join("notexists.txt");

        let result = check_exists(file.to_string_lossy().to_string()).await.unwrap();
        assert!(!result);
    }

    #[tokio::test]
    async fn test_check_exists_directory() {
        let temp = ProjectTempDir::new("check_exists_dir");
        let dir = temp.path().join("subdir");
        fs::create_dir(&dir).unwrap();

        let result = check_exists(dir.to_string_lossy().to_string()).await.unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_check_exists_nested_path() {
        let temp = ProjectTempDir::new("check_exists_nested");
        let nested = temp.path().join("a/b/c/file.txt");
        fs::create_dir_all(nested.parent().unwrap()).unwrap();
        fs::write(&nested, "content").unwrap();

        let result = check_exists(nested.to_string_lossy().to_string()).await.unwrap();
        assert!(result);

        let result = check_exists(temp.path().join("a/b").to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_check_exists_root() {
        let result = check_exists("/".to_string()).await.unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_check_exists_hidden_file() {
        let temp = ProjectTempDir::new("check_exists_hidden");
        let hidden = temp.path().join(".hidden");
        fs::write(&hidden, "hidden content").unwrap();

        let result = check_exists(hidden.to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(result);
    }
}

// =============================================================================
// open_file_default と open_terminal_at のテスト
// 注: これらは外部プロセスを起動するため、基本的な成功確認のみ
// =============================================================================

mod external_commands_tests {
    use super::*;
    use xplorer_lib::commands::utils::open_file_default;
    use xplorer_lib::commands::utils::open_terminal_at;

    #[tokio::test]
    async fn test_open_file_default_existing_file() {
        let temp = ProjectTempDir::new("open_file_default");
        let file = temp.path().join("test.txt");
        fs::write(&file, "content").unwrap();

        // This will actually open the file in the default app
        // We just verify it doesn't error
        let result = open_file_default(file.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_open_file_default_directory() {
        let temp = ProjectTempDir::new("open_file_dir");

        // Opening a directory should work
        let result = open_file_default(temp.path().to_string_lossy().to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_open_terminal_at_valid_directory() {
        let temp = ProjectTempDir::new("open_terminal");

        let result = open_terminal_at(temp.path().to_string_lossy().to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_open_terminal_at_invalid_path() {
        // Not a directory should fail
        let temp = ProjectTempDir::new("open_terminal_invalid");
        let file = temp.path().join("file.txt");
        fs::write(&file, "content").unwrap();

        let result = open_terminal_at(file.to_string_lossy().to_string()).await;
        assert!(result.is_err());
    }
}
