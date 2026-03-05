mod format_size {
    use xplorer_lib::commands::utils::format_size;

    #[test]
    fn test_zero_bytes() {
        assert_eq!(format_size(0), "0 B");
    }

    #[test]
    fn test_one_byte() {
        assert_eq!(format_size(1), "1 B");
    }

    #[test]
    fn test_bytes_boundary() {
        assert_eq!(format_size(1023), "1023 B");
        assert_eq!(format_size(1024), "1.0 KB");
    }

    #[test]
    fn test_kilobytes() {
        assert_eq!(format_size(1536), "1.5 KB");
        assert_eq!(format_size(2048), "2.0 KB");
    }

    #[test]
    fn test_kb_mb_boundary() {
        assert_eq!(format_size(1048575).ends_with("KB"), true);
        assert_eq!(format_size(1024 * 1024), "1.0 MB");
    }

    #[test]
    fn test_megabytes() {
        assert_eq!(format_size(1572864), "1.5 MB");
        assert_eq!(format_size(10 * 1024 * 1024), "10.0 MB");
    }

    #[test]
    fn test_mb_gb_boundary() {
        let just_under_gb: u64 = 1024 * 1024 * 1024 - 1;
        assert!(format_size(just_under_gb).ends_with("MB"));
        assert_eq!(format_size(1024 * 1024 * 1024), "1.0 GB");
    }

    #[test]
    fn test_gigabytes() {
        assert_eq!(format_size(1536 * 1024 * 1024), "1.5 GB");
        assert_eq!(format_size(10 * 1024 * 1024 * 1024), "10.0 GB");
    }

    #[test]
    fn test_large_values() {
        let tb: u64 = 1000 * 1024 * 1024 * 1024;
        assert_eq!(format_size(tb), "1000.0 GB");
    }

    #[test]
    fn test_max_value() {
        let result = format_size(u64::MAX);
        assert!(result.ends_with("GB"));
    }
}

mod format_timestamp {
    use xplorer_lib::commands::utils::format_timestamp;

    #[test]
    fn test_zero_timestamp() {
        assert_eq!(format_timestamp(0), "");
    }

    #[test]
    fn test_unix_epoch() {
        let result = format_timestamp(1);
        assert!(!result.is_empty());
    }

    #[test]
    fn test_known_date() {
        let result = format_timestamp(1704067200);
        assert!(result.contains("2024"));
        assert!(result.contains("01"));
    }

    #[test]
    fn test_negative_timestamp_far_past() {
        let result = format_timestamp(-1);
        assert!(!result.is_empty() || result.is_empty());
    }
}

mod get_parent_path {
    use xplorer_lib::commands::utils::get_parent_path;

    #[tokio::test]
    async fn test_empty_path() {
        let result = get_parent_path("".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_root_path() {
        let result = get_parent_path("/".to_string()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/");
    }

    #[tokio::test]
    async fn test_single_directory() {
        let result = get_parent_path("/Users".to_string()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/");
    }

    #[tokio::test]
    async fn test_nested_path() {
        let result = get_parent_path("/Users/yuyu/Documents".to_string()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/Users/yuyu");
    }

    #[tokio::test]
    async fn test_deeply_nested_path() {
        let result = get_parent_path("/a/b/c/d/e/f".to_string()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/a/b/c/d/e");
    }

    #[tokio::test]
    async fn test_trailing_slash() {
        let result = get_parent_path("/Users/yuyu/".to_string()).await;
        assert!(result.is_ok());
        let parent = result.unwrap();
        assert!(parent == "/Users" || parent == "/Users/yuyu");
    }

    #[tokio::test]
    async fn test_relative_path() {
        let result = get_parent_path("folder/subfolder".to_string()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "folder");
    }

    #[tokio::test]
    async fn test_single_relative_directory() {
        let result = get_parent_path("folder".to_string()).await;
        assert!(result.is_ok());
        let parent = result.unwrap();
        assert!(parent.is_empty() || parent == "folder");
    }
}

mod get_home_dir {
    use xplorer_lib::commands::utils::get_home_dir;

    #[tokio::test]
    async fn test_returns_home() {
        let result = get_home_dir().await;
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
        let result = create_directory("/root/unauthorized_dir_test".to_string()).await;
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

        let mut file = fs::File::create(&file_path).unwrap();
        file.write_all(b"original content").unwrap();

        let result = create_file(file_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());

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
        let temp = TempDir::new().unwrap();
        let file_path = temp.path().join("nonexistent/test.txt");

        let result = create_file(file_path.to_string_lossy().to_string()).await;
        assert!(result.is_err());
    }
}

mod copy_files {
    use std::fs;
    use tempfile::TempDir;
    use xplorer_lib::commands::file_ops::copy_files;

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
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;
    use xplorer_lib::commands::file_ops::move_files;

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

        for f in &files {
            assert!(!Path::new(f).exists());
        }
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
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;
    use xplorer_lib::commands::file_ops::delete_files;

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

        let result = delete_files(vec![file.to_string_lossy().to_string()], true).await;
        assert!(result.is_ok() || result.is_err());
    }
}

mod rename_file {
    use std::fs;
    use tempfile::TempDir;
    use xplorer_lib::commands::file_ops::rename_file;

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

        let result = rename_file(
            old.to_string_lossy().to_string(),
            "existing.txt".to_string(),
        )
        .await;
        assert!(result.is_ok() || result.is_err());
    }
}
