//! 結合テスト - ファイルシステム操作の包括的なテスト
//!
//! これらのテストは実際のファイルシステムを使用して、
//! 閾値ギリギリのエッジケースや予期せぬ動作を検証します。

use std::fs;
use std::path::Path;
use tempfile::TempDir;

// テスト用ヘルパー関数
mod helpers {
    use std::fs;
    use std::path::Path;

    pub fn create_file_with_size(path: &Path, size: u64) -> std::io::Result<()> {
        let file = fs::File::create(path)?;
        if size > 0 {
            file.set_len(size)?;
        }
        Ok(())
    }

    pub fn create_deep_directory(base: &Path, depth: usize) -> std::io::Result<()> {
        let mut current = base.to_path_buf();
        for i in 0..depth {
            current = current.join(format!("level_{}", i));
            fs::create_dir(&current)?;
        }
        Ok(())
    }

    pub fn count_files_recursive(dir: &Path) -> (u64, u64) {
        let mut files = 0;
        let mut dirs = 0;

        if dir.is_dir() {
            dirs += 1;
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let (f, d) = count_files_recursive(&path);
                        files += f;
                        dirs += d;
                    } else {
                        files += 1;
                    }
                }
            }
        }

        (files, dirs)
    }
}

// =============================================================================
// ファイルサイズの閾値テスト
// =============================================================================

mod file_size_thresholds {
    use super::*;

    #[test]
    fn test_empty_file() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("empty.txt");

        // Act
        helpers::create_file_with_size(&file, 0).unwrap();

        // Assert
        let metadata = fs::metadata(&file).unwrap();
        assert_eq!(metadata.len(), 0);
    }

    #[test]
    fn test_one_byte_file() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("one_byte.txt");

        // Act
        helpers::create_file_with_size(&file, 1).unwrap();

        // Assert
        let metadata = fs::metadata(&file).unwrap();
        assert_eq!(metadata.len(), 1);
    }

    #[test]
    fn test_4kb_boundary() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file_just_under = temp.path().join("4095.bin");
        let file_exact = temp.path().join("4096.bin");
        let file_just_over = temp.path().join("4097.bin");

        // Act
        helpers::create_file_with_size(&file_just_under, 4095).unwrap();
        helpers::create_file_with_size(&file_exact, 4096).unwrap();
        helpers::create_file_with_size(&file_just_over, 4097).unwrap();

        // Assert
        assert_eq!(fs::metadata(&file_just_under).unwrap().len(), 4095);
        assert_eq!(fs::metadata(&file_exact).unwrap().len(), 4096);
        assert_eq!(fs::metadata(&file_just_over).unwrap().len(), 4097);
    }

    #[test]
    fn test_large_file_1gb() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("large.bin");
        let expected_size: u64 = 1024 * 1024 * 1024;

        // Act
        helpers::create_file_with_size(&file, expected_size).unwrap();

        // Assert
        let metadata = fs::metadata(&file).unwrap();
        assert_eq!(metadata.len(), expected_size);
    }

    #[test]
    fn test_very_long_filename() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let long_name = "a".repeat(255);
        let file = temp.path().join(&long_name);
        let too_long = "a".repeat(256);
        let file_too_long = temp.path().join(&too_long);

        // Act
        let result_255 = fs::File::create(&file);
        let result_256 = fs::File::create(&file_too_long);

        // Assert
        assert!(result_255.is_ok(), "255文字のファイル名は作成可能であるべき");
        assert!(result_256.is_err(), "256文字のファイル名は失敗するべき");
    }
}

// =============================================================================
// ディレクトリ深度とファイル数の閾値テスト
// =============================================================================

mod directory_thresholds {
    use super::*;

    #[test]
    fn test_deep_directory_structure() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let depth = 50;
        let expected_dirs = 51; // temp + 50 levels

        // Act
        helpers::create_deep_directory(temp.path(), depth).unwrap();

        // Assert
        let (files, dirs) = helpers::count_files_recursive(temp.path());
        assert_eq!(files, 0);
        assert_eq!(dirs, expected_dirs);
    }

    #[test]
    fn test_many_files_in_directory() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file_count = 1000;

        // Act
        for i in 0..file_count {
            let file = temp.path().join(format!("file_{:04}.txt", i));
            fs::write(&file, "content").unwrap();
        }

        // Assert
        let entries: Vec<_> = fs::read_dir(temp.path()).unwrap().collect();
        assert_eq!(entries.len(), file_count);
    }

    #[test]
    fn test_nested_many_files() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let dir_count = 10;
        let files_per_dir = 100;

        // Act
        for d in 0..dir_count {
            let dir = temp.path().join(format!("dir_{}", d));
            fs::create_dir(&dir).unwrap();
            for f in 0..files_per_dir {
                let file = dir.join(format!("file_{:03}.txt", f));
                fs::write(&file, "content").unwrap();
            }
        }

        // Assert
        let (files, dirs) = helpers::count_files_recursive(temp.path());
        assert_eq!(files, 1000);
        assert_eq!(dirs, 11); // temp + 10 subdirs
    }

    #[test]
    fn test_empty_directory_handling() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let empty = temp.path().join("empty");
        fs::create_dir(&empty).unwrap();

        // Act
        let entries: Vec<_> = fs::read_dir(&empty).unwrap().collect();

        // Assert
        assert_eq!(entries.len(), 0);
    }
}

// =============================================================================
// 特殊文字・エッジケースのファイル名
// =============================================================================

mod special_filenames {
    use super::*;

    #[test]
    fn test_unicode_filename_japanese() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("日本語ファイル名.txt");
        let content = "内容";

        // Act
        fs::write(&file, content).unwrap();

        // Assert
        assert!(file.exists());
        assert_eq!(fs::read_to_string(&file).unwrap(), content);
    }

    #[test]
    fn test_unicode_filename_emoji() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("📄file_🎉.txt");

        // Act
        fs::write(&file, "emoji content").unwrap();

        // Assert
        assert!(file.exists());
    }

    #[test]
    fn test_spaces_in_filename() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let files = vec![
            "file with spaces.txt",
            "  leading spaces.txt",
            "trailing spaces  .txt",
            "multiple   spaces.txt",
        ];

        // Act & Assert
        for name in &files {
            let file = temp.path().join(name);
            fs::write(&file, "content").unwrap();
            assert!(file.exists(), "File '{}' should exist", name);
        }
    }

    #[test]
    fn test_hidden_file() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let hidden = temp.path().join(".hidden_file");

        // Act
        fs::write(&hidden, "hidden content").unwrap();

        // Assert
        assert!(hidden.exists());
        assert!(hidden
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with('.'));
    }

    #[test]
    fn test_multiple_extensions() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("archive.tar.gz");

        // Act
        fs::write(&file, "content").unwrap();

        // Assert
        assert!(file.exists());
        assert_eq!(file.extension().unwrap().to_string_lossy(), "gz");
    }

    #[test]
    fn test_no_extension() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("README");

        // Act
        fs::write(&file, "content").unwrap();

        // Assert
        assert!(file.exists());
        assert!(file.extension().is_none());
    }

    #[test]
    fn test_dotfile_with_extension() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join(".gitignore");

        // Act
        fs::write(&file, "*.log\n").unwrap();

        // Assert
        assert!(file.exists());
    }
}

// =============================================================================
// 権限・エラーハンドリング
// =============================================================================

mod error_handling {
    use super::*;

    #[test]
    fn test_read_nonexistent_file() {
        // Arrange
        let nonexistent_path = "/nonexistent/path/file.txt";

        // Act
        let result = fs::read_to_string(nonexistent_path);

        // Assert
        assert!(result.is_err());
    }

    #[test]
    fn test_write_to_nonexistent_directory() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("nonexistent/nested/dir/file.txt");

        // Act
        let result = fs::write(&file, "content");

        // Assert
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_nonexistent_file() {
        // Arrange
        let nonexistent = "/nonexistent/file.txt";

        // Act
        let result = fs::remove_file(nonexistent);

        // Assert
        assert!(result.is_err());
    }

    #[test]
    fn test_create_file_in_readonly_directory() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let readonly_dir = temp.path().join("readonly");
        fs::create_dir(&readonly_dir).unwrap();
        let mut perms = fs::metadata(&readonly_dir).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&readonly_dir, perms).unwrap();
        let file = readonly_dir.join("test.txt");

        // Act
        let result = fs::write(&file, "content");

        // Assert
        assert!(result.is_err());

        // Cleanup
        let mut perms = fs::metadata(&readonly_dir).unwrap().permissions();
        perms.set_readonly(false);
        fs::set_permissions(&readonly_dir, perms).unwrap();
    }

    #[test]
    fn test_path_with_null_byte() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let invalid_path = temp.path().join("file\0name.txt");

        // Act
        let result = fs::write(&invalid_path, "content");

        // Assert
        assert!(result.is_err());
    }
}

// =============================================================================
// 並行性・レースコンディション
// =============================================================================

mod concurrency {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn test_concurrent_file_creation() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let temp = Arc::new(temp);
        let thread_count = 10;

        // Act
        let handles: Vec<_> = (0..thread_count)
            .map(|i| {
                let temp = Arc::clone(&temp);
                thread::spawn(move || {
                    let file = temp.path().join(format!("concurrent_{}.txt", i));
                    fs::write(&file, format!("content {}", i)).unwrap();
                })
            })
            .collect();

        for h in handles {
            h.join().unwrap();
        }

        // Assert
        let entries: Vec<_> = fs::read_dir(temp.path()).unwrap().collect();
        assert_eq!(entries.len(), thread_count);
    }

    #[test]
    fn test_concurrent_read_same_file() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("shared.txt");
        let expected_content = "shared content";
        fs::write(&file, expected_content).unwrap();
        let file = Arc::new(file);
        let thread_count = 10;

        // Act
        let handles: Vec<_> = (0..thread_count)
            .map(|_| {
                let file = Arc::clone(&file);
                thread::spawn(move || fs::read_to_string(&*file).unwrap())
            })
            .collect();

        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();

        // Assert
        for result in results {
            assert_eq!(result, expected_content);
        }
    }
}

// =============================================================================
// シンボリックリンク
// =============================================================================

mod symlink_handling {
    use super::*;

    #[test]
    fn test_file_symlink() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let original = temp.path().join("original.txt");
        let link = temp.path().join("link.txt");
        fs::write(&original, "original content").unwrap();

        // Act
        #[cfg(unix)]
        std::os::unix::fs::symlink(&original, &link).unwrap();

        // Assert
        #[cfg(unix)]
        {
            assert!(link.exists());
            assert_eq!(fs::read_to_string(&link).unwrap(), "original content");

            let metadata = fs::symlink_metadata(&link).unwrap();
            assert!(metadata.file_type().is_symlink());
        }
    }

    #[test]
    fn test_directory_symlink() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let original_dir = temp.path().join("original_dir");
        let link_dir = temp.path().join("link_dir");
        fs::create_dir(&original_dir).unwrap();
        fs::write(original_dir.join("file.txt"), "content").unwrap();

        // Act
        #[cfg(unix)]
        std::os::unix::fs::symlink(&original_dir, &link_dir).unwrap();

        // Assert
        #[cfg(unix)]
        {
            assert!(link_dir.exists());
            assert!(link_dir.join("file.txt").exists());
        }
    }

    #[test]
    fn test_broken_symlink() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let nonexistent = temp.path().join("nonexistent.txt");
        let broken_link = temp.path().join("broken_link");

        // Act
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&nonexistent, &broken_link).unwrap();

            // Assert
            let metadata = fs::symlink_metadata(&broken_link).unwrap();
            assert!(metadata.file_type().is_symlink());
            assert!(!broken_link.exists());
        }
    }
}

// =============================================================================
// フォルダサイズ計算の精度テスト
// =============================================================================

mod folder_size_calculation {
    use super::*;

    #[test]
    fn test_empty_folder_size() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let empty = temp.path().join("empty");
        fs::create_dir(&empty).unwrap();

        // Act
        let (files, dirs) = helpers::count_files_recursive(&empty);

        // Assert
        assert_eq!(files, 0);
        assert_eq!(dirs, 1);
    }

    #[test]
    fn test_folder_with_various_file_sizes() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let sizes = [0, 1, 100, 1024, 4096, 1024 * 1024, 10 * 1024 * 1024];

        // Act
        for (i, &size) in sizes.iter().enumerate() {
            let file = temp.path().join(format!("file_{}.bin", i));
            helpers::create_file_with_size(&file, size).unwrap();
        }

        // Assert
        let total_size: u64 = sizes.iter().sum();
        let actual_size: u64 = fs::read_dir(temp.path())
            .unwrap()
            .flatten()
            .map(|e| e.metadata().unwrap().len())
            .sum();
        assert_eq!(total_size, actual_size);
    }

    #[test]
    fn test_deeply_nested_file_size() {
        // Arrange
        let temp = TempDir::new().unwrap();
        let depth = 20;
        let content = "deep content";

        // Act
        let mut current = temp.path().to_path_buf();
        for i in 0..depth {
            current = current.join(format!("level_{}", i));
            fs::create_dir(&current).unwrap();
        }
        let deep_file = current.join("deep.txt");
        fs::write(&deep_file, content).unwrap();

        // Assert
        assert!(deep_file.exists());
        assert_eq!(fs::read_to_string(&deep_file).unwrap(), content);
    }
}
