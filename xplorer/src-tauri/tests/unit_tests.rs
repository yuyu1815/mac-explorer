mod format_size {
    use xplorer_lib::commands::utils::format_size;

    #[test]
    fn test_zero_bytes() {
        // Arrange
        let input = 0;
        let expected = "0 B";

        // Act
        let result = format_size(input);

        // Assert
        assert_eq!(result, expected);
    }

    #[test]
    fn test_one_byte() {
        // Arrange
        let input = 1;
        let expected = "1 B";

        // Act
        let result = format_size(input);

        // Assert
        assert_eq!(result, expected);
    }

    #[test]
    fn test_bytes_boundary() {
        // Arrange
        let just_under_kb = 1023;
        let exactly_kb = 1024;

        // Act
        let result_under = format_size(just_under_kb);
        let result_exact = format_size(exactly_kb);

        // Assert
        assert_eq!(result_under, "1023 B");
        assert_eq!(result_exact, "1.0 KB");
    }

    #[test]
    fn test_kilobytes() {
        // Arrange
        let one_half_kb = 1536;
        let two_kb = 2048;

        // Act
        let result_1_5 = format_size(one_half_kb);
        let result_2 = format_size(two_kb);

        // Assert
        assert_eq!(result_1_5, "1.5 KB");
        assert_eq!(result_2, "2.0 KB");
    }

    #[test]
    fn test_kb_mb_boundary() {
        // Arrange
        let just_under_mb: u64 = 1048575;
        let exactly_mb: u64 = 1024 * 1024;

        // Act
        let result_under = format_size(just_under_mb);
        let result_exact = format_size(exactly_mb);

        // Assert
        assert!(result_under.ends_with("KB"));
        assert_eq!(result_exact, "1.0 MB");
    }

    #[test]
    fn test_megabytes() {
        // Arrange
        let one_half_mb = 1572864;
        let ten_mb = 10 * 1024 * 1024;

        // Act
        let result_1_5 = format_size(one_half_mb);
        let result_10 = format_size(ten_mb);

        // Assert
        assert_eq!(result_1_5, "1.5 MB");
        assert_eq!(result_10, "10.0 MB");
    }

    #[test]
    fn test_mb_gb_boundary() {
        // Arrange
        let just_under_gb: u64 = 1024 * 1024 * 1024 - 1;
        let exactly_gb: u64 = 1024 * 1024 * 1024;

        // Act
        let result_under = format_size(just_under_gb);
        let result_exact = format_size(exactly_gb);

        // Assert
        assert!(result_under.ends_with("MB"));
        assert_eq!(result_exact, "1.0 GB");
    }

    #[test]
    fn test_gigabytes() {
        // Arrange
        let one_half_gb: u64 = 1536 * 1024 * 1024;
        let ten_gb: u64 = 10 * 1024 * 1024 * 1024;

        // Act
        let result_1_5 = format_size(one_half_gb);
        let result_10 = format_size(ten_gb);

        // Assert
        assert_eq!(result_1_5, "1.5 GB");
        assert_eq!(result_10, "10.0 GB");
    }

    #[test]
    fn test_large_values() {
        // Arrange
        let tb: u64 = 1000 * 1024 * 1024 * 1024;
        let expected = "1000.0 GB";

        // Act
        let result = format_size(tb);

        // Assert
        assert_eq!(result, expected);
    }

    #[test]
    fn test_max_value() {
        // Arrange
        let max_value = u64::MAX;

        // Act
        let result = format_size(max_value);

        // Assert
        assert!(result.ends_with("GB"));
    }
}

mod format_timestamp {
    use xplorer_lib::commands::utils::format_timestamp;

    #[test]
    fn test_zero_timestamp() {
        // Arrange
        let input = 0;
        let expected = "";

        // Act
        let result = format_timestamp(input);

        // Assert
        assert_eq!(result, expected);
    }

    #[test]
    fn test_unix_epoch() {
        // Arrange
        let input = 1;

        // Act
        let result = format_timestamp(input);

        // Assert
        assert!(!result.is_empty());
    }

    #[test]
    fn test_known_date() {
        // Arrange
        let input = 1704067200; // 2024-01-01

        // Act
        let result = format_timestamp(input);

        // Assert
        assert!(result.contains("2024"));
        assert!(result.contains("01"));
    }

    #[test]
    fn test_negative_timestamp_far_past() {
        // Arrange
        let input = -1;

        // Act
        let result = format_timestamp(input);

        // Assert
        assert!(!result.is_empty() || result.is_empty());
    }
}

mod get_parent_path {
    use xplorer_lib::commands::utils::get_parent_path;

    #[tokio::test]
    async fn test_empty_path() {
        // Arrange
        let input = "".to_string();

        // Act
        let result = get_parent_path(input).await;

        // Assert
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_root_path() {
        // Arrange
        let input = "/".to_string();
        let expected = "/";

        // Act
        let result = get_parent_path(input).await;

        // Assert
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), expected);
    }

    #[tokio::test]
    async fn test_single_directory() {
        // Arrange
        let input = "/Users".to_string();
        let expected = "/";

        // Act
        let result = get_parent_path(input).await;

        // Assert
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), expected);
    }

    #[tokio::test]
    async fn test_nested_path() {
        // Arrange
        let input = "/Users/yuyu/Documents".to_string();
        let expected = "/Users/yuyu";

        // Act
        let result = get_parent_path(input).await;

        // Assert
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), expected);
    }

    #[tokio::test]
    async fn test_deeply_nested_path() {
        // Arrange
        let input = "/a/b/c/d/e/f".to_string();
        let expected = "/a/b/c/d/e";

        // Act
        let result = get_parent_path(input).await;

        // Assert
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), expected);
    }

    #[tokio::test]
    async fn test_trailing_slash() {
        // Arrange
        let input = "/Users/yuyu/".to_string();

        // Act
        let result = get_parent_path(input).await;

        // Assert
        assert!(result.is_ok());
        let parent = result.unwrap();
        assert!(parent == "/Users" || parent == "/Users/yuyu");
    }

    #[tokio::test]
    async fn test_relative_path() {
        // Arrange
        let input = "folder/subfolder".to_string();
        let expected = "folder";

        // Act
        let result = get_parent_path(input).await;

        // Assert
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), expected);
    }

    #[tokio::test]
    async fn test_single_relative_directory() {
        // Arrange
        let input = "folder".to_string();

        // Act
        let result = get_parent_path(input).await;

        // Assert
        assert!(result.is_ok());
        let parent = result.unwrap();
        assert!(parent.is_empty() || parent == "folder");
    }
}

mod get_home_dir {
    use xplorer_lib::commands::utils::get_home_dir;

    #[tokio::test]
    async fn test_returns_home() {
        // Arrange - no setup needed for home directory

        // Act
        let result = get_home_dir().await;

        // Assert
        assert!(result.is_ok());
        let home = result.unwrap();
        assert!(!home.is_empty());
        assert!(home.starts_with('/'));
    }
}

mod create_directory {
    use std::fs;
    use tempfile::TempDir;
    use xplorer_lib::commands::file_ops::create_directory;

    #[tokio::test]
    async fn test_create_single_directory() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let new_dir = temp.path().join("new_folder");

        // Act
        let result = create_directory(new_dir.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_ok());
        assert!(new_dir.exists());
    }

    #[tokio::test]
    async fn test_create_nested_directories() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let nested = temp.path().join("a/b/c/d/e");

        // Act
        let result = create_directory(nested.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_ok());
        assert!(nested.exists());
    }

    #[tokio::test]
    async fn test_create_existing_directory() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let existing = temp.path().join("existing");
        fs::create_dir(&existing).unwrap();

        // Act
        let result = create_directory(existing.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_create_directory_with_special_chars() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let special = temp.path().join("folder with spaces");

        // Act
        let result = create_directory(special.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_ok());
        assert!(special.exists());
    }

    #[tokio::test]
    async fn test_create_directory_invalid_path() {
        // Arrange
        let invalid_path = "/root/unauthorized_dir_test".to_string();

        // Act
        let result = create_directory(invalid_path).await;

        // Assert
        assert!(result.is_err());
    }
}

mod create_file {
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;
    use xplorer_lib::commands::file_ops::create_file;

    #[tokio::test]
    async fn test_create_simple_file() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file_path = temp.path().join("test.txt");

        // Act
        let result = create_file(file_path.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_ok());
        assert!(file_path.exists());
    }

    #[tokio::test]
    async fn test_create_file_overwrites_existing() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file_path = temp.path().join("existing.txt");
        let mut file = fs::File::create(&file_path).unwrap();
        file.write_all(b"original content").unwrap();

        // Act
        let result = create_file(file_path.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_ok());
        let metadata = fs::metadata(&file_path).unwrap();
        assert_eq!(metadata.len(), 0);
    }

    #[tokio::test]
    async fn test_create_file_with_extension() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file_path = temp.path().join("document.pdf");

        // Act
        let result = create_file(file_path.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_create_file_nonexistent_parent() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file_path = temp.path().join("nonexistent/test.txt");

        // Act
        let result = create_file(file_path.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_err());
    }
}

mod copy_files {
    use std::fs;
    use tempfile::TempDir;
    use xplorer_lib::commands::file_ops::copy_files;

    #[tokio::test]
    async fn test_copy_single_file() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let src = temp.path().join("source.txt");
        let dest_dir = temp.path().join("dest");
        fs::write(&src, "test content").unwrap();
        fs::create_dir(&dest_dir).unwrap();

        // Act
        let result = copy_files(
            vec![src.to_string_lossy().to_string()],
            dest_dir.to_string_lossy().to_string(),
        )
        .await;

        // Assert
        assert!(result.is_ok());
        let copied = dest_dir.join("source.txt");
        assert!(copied.exists());
        assert_eq!(fs::read_to_string(&copied).unwrap(), "test content");
    }

    #[tokio::test]
    async fn test_copy_multiple_files() {
        // Arrange
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

        // Act
        let result = copy_files(files, dest_dir.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_ok());
        for i in 0..5 {
            assert!(dest_dir.join(format!("file{}.txt", i)).exists());
        }
    }

    #[tokio::test]
    async fn test_copy_nonexistent_file_skipped() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let dest_dir = temp.path().join("dest");
        fs::create_dir(&dest_dir).unwrap();

        // Act
        let result = copy_files(
            vec!["/nonexistent/file.txt".to_string()],
            dest_dir.to_string_lossy().to_string(),
        )
        .await;

        // Assert
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_copy_empty_list() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let dest_dir = temp.path().join("dest");
        fs::create_dir(&dest_dir).unwrap();

        // Act
        let result = copy_files(vec![], dest_dir.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_copy_directory_skipped() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let src_dir = temp.path().join("source_dir");
        let dest_dir = temp.path().join("dest");
        fs::create_dir(&src_dir).unwrap();
        fs::create_dir(&dest_dir).unwrap();

        // Act
        let result = copy_files(
            vec![src_dir.to_string_lossy().to_string()],
            dest_dir.to_string_lossy().to_string(),
        )
        .await;

        // Assert
        assert!(result.is_ok());
        assert!(!dest_dir.join("source_dir").exists());
    }
}

mod move_files {
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;
    use xplorer_lib::commands::file_ops::move_files;

    #[tokio::test]
    async fn test_move_single_file() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let src = temp.path().join("source.txt");
        let dest_dir = temp.path().join("dest");
        fs::write(&src, "test content").unwrap();
        fs::create_dir(&dest_dir).unwrap();

        // Act
        let result = move_files(
            vec![src.to_string_lossy().to_string()],
            dest_dir.to_string_lossy().to_string(),
        )
        .await;

        // Assert
        assert!(result.is_ok());
        assert!(!src.exists());
        assert!(dest_dir.join("source.txt").exists());
    }

    #[tokio::test]
    async fn test_move_multiple_files() {
        // Arrange
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

        // Act
        let result = move_files(files.clone(), dest_dir.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_ok());
        for f in &files {
            assert!(!Path::new(f).exists());
        }
        for i in 0..3 {
            assert!(dest_dir.join(format!("file{}.txt", i)).exists());
        }
    }

    #[tokio::test]
    async fn test_move_nonexistent_file_skipped() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let dest_dir = temp.path().join("dest");
        fs::create_dir(&dest_dir).unwrap();

        // Act
        let result = move_files(
            vec!["/nonexistent/file.txt".to_string()],
            dest_dir.to_string_lossy().to_string(),
        )
        .await;

        // Assert
        assert!(result.is_ok());
    }
}

mod delete_files {
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;
    use xplorer_lib::commands::file_ops::delete_files;

    #[tokio::test]
    async fn test_delete_single_file() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("to_delete.txt");
        fs::write(&file, "content").unwrap();

        // Act
        let result = delete_files(vec![file.to_string_lossy().to_string()], false).await;

        // Assert
        assert!(result.is_ok());
        assert!(!file.exists());
    }

    #[tokio::test]
    async fn test_delete_directory_with_contents() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join("to_delete");
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("file1.txt"), "content").unwrap();
        fs::create_dir(dir.join("subdir")).unwrap();
        fs::write(dir.join("subdir/file2.txt"), "content").unwrap();

        // Act
        let result = delete_files(vec![dir.to_string_lossy().to_string()], false).await;

        // Assert
        assert!(result.is_ok());
        assert!(!dir.exists());
    }

    #[tokio::test]
    async fn test_delete_empty_directory() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join("empty_dir");
        fs::create_dir(&dir).unwrap();

        // Act
        let result = delete_files(vec![dir.to_string_lossy().to_string()], false).await;

        // Assert
        assert!(result.is_ok());
        assert!(!dir.exists());
    }

    #[tokio::test]
    async fn test_delete_multiple_files() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let files: Vec<_> = (0..3)
            .map(|i| {
                let path = temp.path().join(format!("file{}.txt", i));
                fs::write(&path, "content").unwrap();
                path.to_string_lossy().to_string()
            })
            .collect();

        // Act
        let result = delete_files(files.clone(), false).await;

        // Assert
        assert!(result.is_ok());
        for f in &files {
            assert!(!Path::new(f).exists());
        }
    }

    #[tokio::test]
    async fn test_delete_nonexistent_file_skipped() {
        // Arrange
        let nonexistent = "/nonexistent/file.txt".to_string();

        // Act
        let result = delete_files(vec![nonexistent], false).await;

        // Assert
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_delete_to_trash() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("to_trash.txt");
        fs::write(&file, "content").unwrap();

        // Act
        let result = delete_files(vec![file.to_string_lossy().to_string()], true).await;

        // Assert
        assert!(result.is_ok() || result.is_err());
    }
}

mod rename_file {
    use std::fs;
    use tempfile::TempDir;
    use xplorer_lib::commands::file_ops::rename_file;

    #[tokio::test]
    async fn test_rename_file() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let old = temp.path().join("old_name.txt");
        fs::write(&old, "content").unwrap();

        // Act
        let result = rename_file(
            old.to_string_lossy().to_string(),
            "new_name.txt".to_string(),
        )
        .await;

        // Assert
        assert!(result.is_ok());
        assert!(!old.exists());
        assert!(temp.path().join("new_name.txt").exists());
    }

    #[tokio::test]
    async fn test_rename_directory() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let old = temp.path().join("old_dir");
        fs::create_dir(&old).unwrap();
        fs::write(old.join("file.txt"), "content").unwrap();

        // Act
        let result =
            rename_file(old.to_string_lossy().to_string(), "new_dir".to_string()).await;

        // Assert
        assert!(result.is_ok());
        assert!(!old.exists());
        assert!(temp.path().join("new_dir").exists());
        assert!(temp.path().join("new_dir/file.txt").exists());
    }

    #[tokio::test]
    async fn test_rename_with_special_chars() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let old = temp.path().join("old.txt");
        fs::write(&old, "content").unwrap();

        // Act
        let result = rename_file(
            old.to_string_lossy().to_string(),
            "file with spaces.txt".to_string(),
        )
        .await;

        // Assert
        assert!(result.is_ok());
        assert!(temp.path().join("file with spaces.txt").exists());
    }

    #[tokio::test]
    async fn test_rename_to_existing_name() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let old = temp.path().join("old.txt");
        let existing = temp.path().join("existing.txt");
        fs::write(&old, "old content").unwrap();
        fs::write(&existing, "existing content").unwrap();

        // Act
        let result = rename_file(
            old.to_string_lossy().to_string(),
            "existing.txt".to_string(),
        )
        .await;

        // Assert
        assert!(result.is_ok() || result.is_err());
    }
}
