//! 結合テスト - ファイルシステム操作の包括的なテスト
//!
//! これらのテストは実際のファイルシステムを使用して、
//! 閾値ギリギリのエッジケースや予期せぬ動作を検証します。

use std::fs;
use tempfile::TempDir;

// テスト用ヘルパー関数
mod helpers {
    use std::fs;
    use std::path::Path;

    pub fn create_file_with_size(path: &Path, size: u64) -> std::io::Result<()> {
        let file = fs::File::create(path)?;
        // 大きなファイルを効率的に作成
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
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("empty.txt");
        helpers::create_file_with_size(&file, 0).unwrap();

        let metadata = fs::metadata(&file).unwrap();
        assert_eq!(metadata.len(), 0);
    }

    #[test]
    fn test_one_byte_file() {
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("one_byte.txt");
        helpers::create_file_with_size(&file, 1).unwrap();

        let metadata = fs::metadata(&file).unwrap();
        assert_eq!(metadata.len(), 1);
    }

    #[test]
    fn test_4kb_boundary() {
        // 一般的なクラスタサイズの境界
        let temp = TempDir::new().unwrap();

        let file_just_under = temp.path().join("4095.bin");
        helpers::create_file_with_size(&file_just_under, 4095).unwrap();

        let file_exact = temp.path().join("4096.bin");
        helpers::create_file_with_size(&file_exact, 4096).unwrap();

        let file_just_over = temp.path().join("4097.bin");
        helpers::create_file_with_size(&file_just_over, 4097).unwrap();

        assert_eq!(fs::metadata(&file_just_under).unwrap().len(), 4095);
        assert_eq!(fs::metadata(&file_exact).unwrap().len(), 4096);
        assert_eq!(fs::metadata(&file_just_over).unwrap().len(), 4097);
    }

    #[test]
    fn test_large_file_1gb() {
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("large.bin");

        // 1GB ファイル
        helpers::create_file_with_size(&file, 1024 * 1024 * 1024).unwrap();

        let metadata = fs::metadata(&file).unwrap();
        assert_eq!(metadata.len(), 1024 * 1024 * 1024);
    }

    #[test]
    fn test_very_long_filename() {
        let temp = TempDir::new().unwrap();

        // macOS のファイル名長制限（通常255バイト）
        let long_name = "a".repeat(255);
        let file = temp.path().join(&long_name);

        let result = fs::File::create(&file);
        assert!(result.is_ok(), "255文字のファイル名は作成可能であるべき");

        // 256文字は失敗する可能性
        let too_long = "a".repeat(256);
        let file_too_long = temp.path().join(&too_long);
        let result = fs::File::create(&file_too_long);
        assert!(result.is_err(), "256文字のファイル名は失敗するべき");
    }
}

// =============================================================================
// ディレクトリ深度とファイル数の閾値テスト
// =============================================================================

mod directory_thresholds {
    use super::*;

    #[test]
    fn test_deep_directory_structure() {
        let temp = TempDir::new().unwrap();

        // macOS のパス長制限（PATH_MAX = 1024）に近い深さ
        // 各レベルが約10文字として、約100レベル
        helpers::create_deep_directory(temp.path(), 50).unwrap();

        let (files, dirs) = helpers::count_files_recursive(temp.path());
        assert_eq!(files, 0);
        assert_eq!(dirs, 51); // temp + 50 levels
    }

    #[test]
    fn test_many_files_in_directory() {
        let temp = TempDir::new().unwrap();

        // 1000ファイルを作成
        for i in 0..1000 {
            let file = temp.path().join(format!("file_{:04}.txt", i));
            fs::write(&file, "content").unwrap();
        }

        let entries: Vec<_> = fs::read_dir(temp.path()).unwrap().collect();
        assert_eq!(entries.len(), 1000);
    }

    #[test]
    fn test_nested_many_files() {
        let temp = TempDir::new().unwrap();

        // 10ディレクトリ x 100ファイル = 1000ファイル
        for d in 0..10 {
            let dir = temp.path().join(format!("dir_{}", d));
            fs::create_dir(&dir).unwrap();
            for f in 0..100 {
                let file = dir.join(format!("file_{:03}.txt", f));
                fs::write(&file, "content").unwrap();
            }
        }

        let (files, dirs) = helpers::count_files_recursive(temp.path());
        assert_eq!(files, 1000);
        assert_eq!(dirs, 11); // temp + 10 subdirs
    }

    #[test]
    fn test_empty_directory_handling() {
        let temp = TempDir::new().unwrap();
        let empty = temp.path().join("empty");
        fs::create_dir(&empty).unwrap();

        let entries: Vec<_> = fs::read_dir(&empty).unwrap().collect();
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
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("日本語ファイル名.txt");

        fs::write(&file, "内容").unwrap();
        assert!(file.exists());
        assert_eq!(fs::read_to_string(&file).unwrap(), "内容");
    }

    #[test]
    fn test_unicode_filename_emoji() {
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("📄file_🎉.txt");

        fs::write(&file, "emoji content").unwrap();
        assert!(file.exists());
    }

    #[test]
    fn test_spaces_in_filename() {
        let temp = TempDir::new().unwrap();

        let files = vec![
            "file with spaces.txt",
            "  leading spaces.txt",
            "trailing spaces  .txt",
            "multiple   spaces.txt",
        ];

        for name in &files {
            let file = temp.path().join(name);
            fs::write(&file, "content").unwrap();
            assert!(file.exists(), "File '{}' should exist", name);
        }
    }

    #[test]
    fn test_hidden_file() {
        let temp = TempDir::new().unwrap();
        let hidden = temp.path().join(".hidden_file");

        fs::write(&hidden, "hidden content").unwrap();
        assert!(hidden.exists());

        // ファイル名がドットで始まる
        assert!(hidden
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with('.'));
    }

    #[test]
    fn test_multiple_extensions() {
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("archive.tar.gz");

        fs::write(&file, "content").unwrap();
        assert!(file.exists());

        // 拡張子は .gz として認識されるべき
        assert_eq!(file.extension().unwrap().to_string_lossy(), "gz");
    }

    #[test]
    fn test_no_extension() {
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("README");

        fs::write(&file, "content").unwrap();
        assert!(file.exists());
        assert!(file.extension().is_none());
    }

    #[test]
    fn test_dotfile_with_extension() {
        let temp = TempDir::new().unwrap();
        let file = temp.path().join(".gitignore");

        fs::write(&file, "*.log\n").unwrap();
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
        let result = fs::read_to_string("/nonexistent/path/file.txt");
        assert!(result.is_err());
    }

    #[test]
    fn test_write_to_nonexistent_directory() {
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("nonexistent/nested/dir/file.txt");

        let result = fs::write(&file, "content");
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_nonexistent_file() {
        let result = fs::remove_file("/nonexistent/file.txt");
        assert!(result.is_err());
    }

    #[test]
    fn test_create_file_in_readonly_directory() {
        // 読み取り専用ディレクトリには書き込めない
        let temp = TempDir::new().unwrap();
        let readonly_dir = temp.path().join("readonly");
        fs::create_dir(&readonly_dir).unwrap();

        // 読み取り専用に設定
        let mut perms = fs::metadata(&readonly_dir).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&readonly_dir, perms).unwrap();

        let file = readonly_dir.join("test.txt");
        let result = fs::write(&file, "content");

        // 書き込みに失敗するはず
        assert!(result.is_err());

        // クリーンアップのため権限を戻す
        let mut perms = fs::metadata(&readonly_dir).unwrap().permissions();
        perms.set_readonly(false);
        fs::set_permissions(&readonly_dir, perms).unwrap();
    }

    #[test]
    fn test_path_with_null_byte() {
        let temp = TempDir::new().unwrap();
        // NULLバイトを含むパスは無効
        let invalid_path = temp.path().join("file\0name.txt");
        let result = fs::write(&invalid_path, "content");
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
        let temp = TempDir::new().unwrap();
        let temp = Arc::new(temp);

        let handles: Vec<_> = (0..10)
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

        let entries: Vec<_> = fs::read_dir(temp.path()).unwrap().collect();
        assert_eq!(entries.len(), 10);
    }

    #[test]
    fn test_concurrent_read_same_file() {
        let temp = TempDir::new().unwrap();
        let file = temp.path().join("shared.txt");
        fs::write(&file, "shared content").unwrap();
        let file = Arc::new(file);

        let handles: Vec<_> = (0..10)
            .map(|_| {
                let file = Arc::clone(&file);
                thread::spawn(move || fs::read_to_string(&*file).unwrap())
            })
            .collect();

        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();

        for result in results {
            assert_eq!(result, "shared content");
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
        let temp = TempDir::new().unwrap();
        let original = temp.path().join("original.txt");
        let link = temp.path().join("link.txt");

        fs::write(&original, "original content").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&original, &link).unwrap();

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
        let temp = TempDir::new().unwrap();
        let original_dir = temp.path().join("original_dir");
        let link_dir = temp.path().join("link_dir");

        fs::create_dir(&original_dir).unwrap();
        fs::write(original_dir.join("file.txt"), "content").unwrap();

        #[cfg(unix)]
        std::os::unix::fs::symlink(&original_dir, &link_dir).unwrap();

        #[cfg(unix)]
        {
            assert!(link_dir.exists());
            assert!(link_dir.join("file.txt").exists());
        }
    }

    #[test]
    fn test_broken_symlink() {
        let temp = TempDir::new().unwrap();
        let nonexistent = temp.path().join("nonexistent.txt");
        let broken_link = temp.path().join("broken_link");

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&nonexistent, &broken_link).unwrap();

            // symlink_metadata は成功するが、exists は false を返す
            let metadata = fs::symlink_metadata(&broken_link).unwrap();
            assert!(metadata.file_type().is_symlink());

            // リンク先が存在しないので exists() は false
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
        let temp = TempDir::new().unwrap();
        let empty = temp.path().join("empty");
        fs::create_dir(&empty).unwrap();

        let (files, dirs) = helpers::count_files_recursive(&empty);
        assert_eq!(files, 0);
        assert_eq!(dirs, 1);
    }

    #[test]
    fn test_folder_with_various_file_sizes() {
        let temp = TempDir::new().unwrap();

        // 様々なサイズのファイル
        let sizes = [0, 1, 100, 1024, 4096, 1024 * 1024, 10 * 1024 * 1024];
        for (i, &size) in sizes.iter().enumerate() {
            let file = temp.path().join(format!("file_{}.bin", i));
            helpers::create_file_with_size(&file, size).unwrap();
        }

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
        let temp = TempDir::new().unwrap();

        // 深い階層にファイルを作成
        let mut current = temp.path().to_path_buf();
        for i in 0..20 {
            current = current.join(format!("level_{}", i));
            fs::create_dir(&current).unwrap();
        }

        let deep_file = current.join("deep.txt");
        fs::write(&deep_file, "deep content").unwrap();

        assert!(deep_file.exists());
        assert_eq!(fs::read_to_string(&deep_file).unwrap(), "deep content");
    }
}
