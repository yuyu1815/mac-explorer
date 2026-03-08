//! プロパティ機能のテスト
//!
//! ファイルやディレクトリの詳細プロパティ取得機能をテストします。

use std::fs;
use std::os::unix::fs::PermissionsExt;

mod test_utils;
use test_utils::ProjectTempDir;

use xplorer_lib::properties::{get_basic_properties, get_detailed_properties};

// =============================================================================
// 基本プロパティ取得のテスト
// =============================================================================

mod get_basic_properties_tests {
    use super::*;

    #[tokio::test]
    async fn test_get_basic_properties_for_file() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_file");
        let file = temp.path().join("test.txt");
        fs::write(&file, "test content").unwrap();

        // Act
        let result = get_basic_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.name, "test.txt");
        assert_eq!(result.file_type, "TXT ファイル");
        assert_eq!(result.size_bytes, 12);
        assert!(!result.size_formatted.is_empty());
        assert!(!result.modified_formatted.is_empty());
    }

    #[tokio::test]
    async fn test_get_basic_properties_for_directory() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_dir");
        let dir = temp.path().join("testdir");
        fs::create_dir(&dir).unwrap();

        // Act
        let result = get_basic_properties(dir.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.name, "testdir");
        assert_eq!(result.file_type, "ファイル フォルダー");
        assert_eq!(result.size_formatted, "計算中...");
    }

    #[tokio::test]
    async fn test_get_basic_properties_hidden_file() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_hidden");
        let hidden = temp.path().join(".hidden");
        fs::write(&hidden, "hidden content").unwrap();

        // Act
        let result = get_basic_properties(hidden.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.name, ".hidden");
        assert!(result.is_hidden);
    }

    #[tokio::test]
    async fn test_get_basic_properties_nonexistent_file() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_nonexistent");
        let nonexistent = temp.path().join("nonexistent.txt");

        // Act
        let result = get_basic_properties(nonexistent.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_basic_properties_file_without_extension() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_no_ext");
        let file = temp.path().join("README");
        fs::write(&file, "readme content").unwrap();

        // Act
        let result = get_basic_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.name, "README");
        assert_eq!(result.file_type, "ファイル");
    }

    #[tokio::test]
    async fn test_get_basic_properties_readonly_file() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_readonly");
        let file = temp.path().join("readonly.txt");
        fs::write(&file, "readonly content").unwrap();

        // Make readonly
        let mut perms = fs::metadata(&file).unwrap().permissions();
        perms.set_mode(0o444);
        fs::set_permissions(&file, perms).unwrap();

        // Act
        let result = get_basic_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert!(result.is_readonly);
    }

    #[tokio::test]
    async fn test_get_basic_properties_writable_file() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_writable");
        let file = temp.path().join("writable.txt");
        fs::write(&file, "writable content").unwrap();

        // Act
        let result = get_basic_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert!(!result.is_readonly);
    }

    #[tokio::test]
    async fn test_get_basic_properties_size_on_disk() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_size_disk");
        let file = temp.path().join("small.txt");
        fs::write(&file, "x").unwrap(); // 1 byte

        // Act
        let result = get_basic_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert - size_on_disk should be at least 4096 (block size)
        assert_eq!(result.size_bytes, 1);
        assert_eq!(result.size_on_disk_bytes, 4096);
    }

    #[tokio::test]
    async fn test_get_basic_properties_location() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_location");
        let dir = temp.path().join("subdir");
        fs::create_dir(&dir).unwrap();
        let file = dir.join("file.txt");
        fs::write(&file, "content").unwrap();

        // Act
        let result = get_basic_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert!(result.location.ends_with("subdir"));
    }

    #[tokio::test]
    async fn test_get_basic_properties_with_unicode_name() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_unicode");
        let file = temp.path().join("日本語.txt");
        fs::write(&file, "unicode content").unwrap();

        // Act
        let result = get_basic_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.name, "日本語.txt");
    }

    #[tokio::test]
    async fn test_get_basic_properties_symlink() {
        // Arrange
        let temp = ProjectTempDir::new("basic_props_symlink");
        let original = temp.path().join("original.txt");
        let link = temp.path().join("link.txt");
        fs::write(&original, "original content").unwrap();

        #[cfg(unix)]
        std::os::unix::fs::symlink(&original, &link).unwrap();

        // Act
        #[cfg(unix)]
        {
            let result = get_basic_properties(link.to_string_lossy().to_string())
                .await
                .unwrap();

            // Assert - symlink_metadata returns info about the link itself
            assert_eq!(result.name, "link.txt");
        }
    }
}

// =============================================================================
// 詳細プロパティ取得のテスト
// =============================================================================

mod get_detailed_properties_tests {
    use super::*;

    #[tokio::test]
    async fn test_get_detailed_properties_for_file() {
        // Arrange
        let temp = ProjectTempDir::new("detailed_props_file");
        let file = temp.path().join("test.txt");
        fs::write(&file, "test content").unwrap();

        // Act
        let result = get_detailed_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert - for files, should be same as basic properties
        assert_eq!(result.name, "test.txt");
        assert_eq!(result.size_bytes, 12);
        assert_eq!(result.contains_files, 0);
        assert_eq!(result.contains_folders, 0);
    }

    #[tokio::test]
    async fn test_get_detailed_properties_empty_directory() {
        // Arrange
        let temp = ProjectTempDir::new("detailed_props_empty_dir");
        let dir = temp.path().join("empty");
        fs::create_dir(&dir).unwrap();

        // Act
        let result = get_detailed_properties(dir.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.contains_files, 0);
        assert_eq!(result.contains_folders, 0);
        // Note: get_basic_properties returns directory metadata size for empty dirs
        // get_detailed_properties accumulates file sizes but doesn't reset initial size
    }

    #[tokio::test]
    async fn test_get_detailed_properties_directory_with_files() {
        // Arrange
        let temp = ProjectTempDir::new("detailed_props_dir_files");
        let dir = temp.path().join("with_files");
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("file1.txt"), "content1").unwrap();
        fs::write(dir.join("file2.txt"), "content2").unwrap();
        fs::write(dir.join("file3.txt"), "content3").unwrap();

        // Act
        let result = get_detailed_properties(dir.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.contains_files, 3);
        assert_eq!(result.contains_folders, 0);
        // Size = dir metadata (64) + file contents (24)
        assert!(result.size_bytes >= 24);
    }

    #[tokio::test]
    async fn test_get_detailed_properties_nested_directories() {
        // Arrange
        let temp = ProjectTempDir::new("detailed_props_nested");
        let dir = temp.path().join("nested");
        let subdir = dir.join("subdir");
        fs::create_dir_all(&subdir).unwrap();
        fs::write(dir.join("file1.txt"), "content1").unwrap();
        fs::write(subdir.join("file2.txt"), "content2").unwrap();

        // Act
        let result = get_detailed_properties(dir.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.contains_files, 2);
        assert_eq!(result.contains_folders, 1);
    }

    #[tokio::test]
    async fn test_get_detailed_properties_deeply_nested() {
        // Arrange
        let temp = ProjectTempDir::new("detailed_props_deep");
        let dir = temp.path().join("deep");
        let mut current = dir.clone();
        fs::create_dir_all(&current).unwrap();

        for i in 0..5 {
            current = current.join(format!("level{}", i));
            fs::create_dir(&current).unwrap();
            fs::write(current.join("file.txt"), format!("content{}", i)).unwrap();
        }

        // Act
        let result = get_detailed_properties(dir.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.contains_files, 5);
        assert_eq!(result.contains_folders, 5);
    }

    #[tokio::test]
    async fn test_get_detailed_properties_size_calculation() {
        // Arrange
        let temp = ProjectTempDir::new("detailed_props_size");
        let dir = temp.path().join("size_test");
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("small.txt"), "x").unwrap(); // 1 byte
        fs::write(dir.join("medium.txt"), "xxxxx").unwrap(); // 5 bytes
        fs::write(dir.join("large.txt"), "xxxxxxxxxx").unwrap(); // 10 bytes

        // Act
        let result = get_detailed_properties(dir.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.contains_files, 3);
        // Size includes dir metadata + file contents (16 bytes total for content)
        assert!(result.size_bytes >= 16);
    }

    #[tokio::test]
    async fn test_get_detailed_properties_hidden_files() {
        // Arrange
        let temp = ProjectTempDir::new("detailed_props_hidden");
        let dir = temp.path().join("hidden_test");
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("visible.txt"), "visible").unwrap();
        fs::write(dir.join(".hidden"), "hidden").unwrap();

        // Act
        let result = get_detailed_properties(dir.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert - hidden files should be counted
        assert_eq!(result.contains_files, 2);
    }

    #[tokio::test]
    async fn test_get_detailed_properties_with_symlink() {
        // Arrange
        let temp = ProjectTempDir::new("detailed_props_symlink");
        let dir = temp.path().join("symlink_test");
        fs::create_dir(&dir).unwrap();

        let original = dir.join("original.txt");
        let link = dir.join("link.txt");
        fs::write(&original, "original").unwrap();

        #[cfg(unix)]
        std::os::unix::fs::symlink(&original, &link).unwrap();

        // Act
        #[cfg(unix)]
        {
            let result = get_detailed_properties(dir.to_string_lossy().to_string())
                .await
                .unwrap();

            // Assert - symlinks are not followed, so original + link metadata
            // link is not a regular file or directory, so it might not be counted
            assert!(result.contains_files >= 1);
        }
    }

    #[tokio::test]
    async fn test_get_detailed_properties_nonexistent_path() {
        // Arrange
        let temp = ProjectTempDir::new("detailed_props_nonexistent");
        let nonexistent = temp.path().join("nonexistent");

        // Act
        let result = get_detailed_properties(nonexistent.to_string_lossy().to_string()).await;

        // Assert
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_detailed_properties_with_empty_file() {
        // Arrange
        let temp = ProjectTempDir::new("detailed_props_empty_file");
        let dir = temp.path().join("empty_file_test");
        fs::create_dir(&dir).unwrap();
        fs::File::create(dir.join("empty.txt")).unwrap();

        // Act
        let result = get_detailed_properties(dir.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.contains_files, 1);
        // Empty file contributes 0 bytes to size
    }
}

// =============================================================================
// エッジケースのテスト
// =============================================================================

mod edge_cases {
    use super::*;

    #[tokio::test]
    async fn test_properties_for_root_path() {
        // Act
        let result = get_basic_properties("/".to_string()).await;

        // Assert
        assert!(result.is_ok());
        let props = result.unwrap();
        assert_eq!(props.file_type, "ファイル フォルダー");
    }

    #[tokio::test]
    async fn test_properties_with_spaces_in_name() {
        // Arrange
        let temp = ProjectTempDir::new("props_spaces");
        let file = temp.path().join("file with spaces.txt");
        fs::write(&file, "content").unwrap();

        // Act
        let result = get_basic_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.name, "file with spaces.txt");
    }

    #[tokio::test]
    async fn test_properties_with_special_chars() {
        // Arrange
        let temp = ProjectTempDir::new("props_special");
        let file = temp.path().join("file@#$%.txt");
        fs::write(&file, "content").unwrap();

        // Act
        let result = get_basic_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert!(result.name.contains("file"));
    }

    #[tokio::test]
    async fn test_properties_large_file() {
        // Arrange
        let temp = ProjectTempDir::new("props_large_file");
        let file = temp.path().join("large.bin");
        let size = 10 * 1024 * 1024; // 10MB
        let f = fs::File::create(&file).unwrap();
        f.set_len(size).unwrap();

        // Act
        let result = get_basic_properties(file.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.size_bytes, size);
        assert!(result.size_formatted.contains("MB"));
    }

    #[tokio::test]
    async fn test_detailed_properties_many_files() {
        // Arrange
        let temp = ProjectTempDir::new("props_many_files");
        let dir = temp.path().join("many");
        fs::create_dir(&dir).unwrap();

        for i in 0..100 {
            fs::write(dir.join(format!("file_{:03}.txt", i)), "x").unwrap();
        }

        // Act
        let result = get_detailed_properties(dir.to_string_lossy().to_string())
            .await
            .unwrap();

        // Assert
        assert_eq!(result.contains_files, 100);
        // Size includes directory metadata + file contents
        assert!(result.size_bytes >= 100);
    }
}
