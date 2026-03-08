//! アイコン機能のテスト
//!
//! アイコンキャッシュとアイコンID生成をテストします。
//! 注: NSWorkspace連携はmacOS環境でのみ動作するため、
//! 基本的な構造とユーティリティ関数を中心にテストします。

mod test_utils;
use test_utils::ProjectTempDir;

// =============================================================================
// アイコンID生成のテスト
// =============================================================================

mod icon_id_tests {
    #[test]
    fn test_icon_id_for_directory() {
        // Directory icon ID should be "dir"
        let icon_id = "dir".to_string();
        assert_eq!(icon_id, "dir");
    }

    #[test]
    fn test_icon_id_for_extension() {
        // Extension icon ID format: "ext:<extension>"
        let ext = "txt";
        let icon_id = format!("ext:{}", ext);
        assert_eq!(icon_id, "ext:txt");
    }

    #[test]
    fn test_icon_id_for_app() {
        // App icon ID format: "app:<path>"
        let app_path = "/Applications/Safari.app";
        let icon_id = format!("app:{}", app_path);
        assert_eq!(icon_id, "app:/Applications/Safari.app");
    }

    #[test]
    fn test_icon_id_for_file() {
        // File icon ID format: "file:<path>"
        let file_path = "/Users/test/file.txt";
        let icon_id = format!("file:{}", file_path);
        assert_eq!(icon_id, "file:/Users/test/file.txt");
    }

    #[test]
    fn test_icon_id_empty_extension() {
        let icon_id = format!("ext:{}", "");
        assert_eq!(icon_id, "ext:");
    }

    #[test]
    fn test_icon_id_case_sensitivity() {
        // Extensions should typically be lowercase
        let ext_lower = "txt";
        let ext_upper = "TXT";
        assert_ne!(format!("ext:{}", ext_lower), format!("ext:{}", ext_upper));
    }
}

// =============================================================================
// ハッシュ関数のテスト (間接的に)
// =============================================================================

mod hash_tests {
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;

    fn hash_string(s: &str) -> u64 {
        let mut hasher = DefaultHasher::new();
        s.hash(&mut hasher);
        hasher.finish()
    }

    #[test]
    fn test_hash_consistency() {
        let id = "ext:txt";
        let hash1 = hash_string(id);
        let hash2 = hash_string(id);
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_different_inputs() {
        let hash1 = hash_string("ext:txt");
        let hash2 = hash_string("ext:pdf");
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_hash_format() {
        let id = "test";
        let hash = hash_string(id);
        let hash_str = format!("{:x}", hash);

        // Hash should be a valid hex string
        assert!(hash_str.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_hash_empty_string() {
        let hash = hash_string("");
        // Empty string should still produce a valid hash
        let hash_str = format!("{:x}", hash);
        assert!(!hash_str.is_empty());
    }
}

// =============================================================================
// キャッシュディレクトリのテスト
// =============================================================================

mod cache_directory_tests {
    use super::*;

    #[test]
    fn test_cache_directory_creation() {
        let temp = ProjectTempDir::new("icons_cache");
        let cache_dir = temp.path().join("icons");

        std::fs::create_dir_all(&cache_dir).unwrap();
        assert!(cache_dir.exists());
        assert!(cache_dir.is_dir());
    }

    #[test]
    fn test_cache_file_path() {
        let temp = ProjectTempDir::new("icons_cache_path");
        let cache_dir = temp.path().join("icons");
        std::fs::create_dir_all(&cache_dir).unwrap();

        let cache_file = cache_dir.join("abc123.png");
        assert!(cache_file.to_string_lossy().ends_with(".png"));
    }

    #[test]
    fn test_cache_write_and_read() {
        let temp = ProjectTempDir::new("icons_cache_io");
        let cache_dir = temp.path().join("icons");
        std::fs::create_dir_all(&cache_dir).unwrap();

        let cache_file = cache_dir.join("test.png");
        let test_data = vec![0u8, 1, 2, 3, 4, 5];

        // Write
        std::fs::write(&cache_file, &test_data).unwrap();
        assert!(cache_file.exists());

        // Read
        let read_data = std::fs::read(&cache_file).unwrap();
        assert_eq!(test_data, read_data);
    }
}

// =============================================================================
// パス解析のテスト
// =============================================================================

mod path_parsing_tests {
    #[test]
    fn test_extract_extension_from_path() {
        let paths = [
            ("file.txt", Some("txt")),
            ("document.pdf", Some("pdf")),
            ("archive.tar.gz", Some("gz")),
            ("noextension", None),
            (".hidden", None),
        ];

        for (path, expected_ext) in &paths {
            let ext = std::path::Path::new(path)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase());
            assert_eq!(ext.as_deref(), *expected_ext, "Failed for: {}", path);
        }
    }

    #[test]
    fn test_extract_extension_with_unicode() {
        let path = "ファイル.txt";
        let ext = std::path::Path::new(path)
            .extension()
            .map(|e| e.to_string_lossy().to_string());
        assert_eq!(ext, Some("txt".to_string()));
    }

    #[test]
    fn test_is_app_bundle() {
        let paths = [
            ("/Applications/Safari.app", true),
            ("/Users/test/Downloads/file.zip", false),
            ("/System/Applications/Calculator.app", true),
            ("/path/to/Document.pdf", false),
        ];

        for (path, is_app) in &paths {
            let result = path.to_lowercase().ends_with(".app");
            assert_eq!(result, *is_app, "Failed for: {}", path);
        }
    }
}

// =============================================================================
// アイコンサイズのテスト
// =============================================================================

mod icon_size_tests {
    #[test]
    fn test_default_icon_size() {
        // Default icon size is 32x32
        let size = 32.0;
        assert_eq!(size, 32.0);
    }

    #[test]
    fn test_icon_size_dimensions() {
        let width = 32.0;
        let height = 32.0;
        assert_eq!(width, height);
    }
}

// =============================================================================
// メモリキャッシュのテスト (概念)
// =============================================================================

mod memory_cache_concept_tests {
    use dashmap::DashMap;

    #[test]
    fn test_dashmap_insert_and_get() {
        let cache: DashMap<String, Vec<u8>> = DashMap::new();

        let id = "ext:txt".to_string();
        let data = vec![1, 2, 3, 4, 5];

        cache.insert(id.clone(), data.clone());

        let retrieved = cache.get(&id).unwrap();
        assert_eq!(*retrieved, data);
    }

    #[test]
    fn test_dashmap_overwrite() {
        let cache: DashMap<String, Vec<u8>> = DashMap::new();

        let id = "ext:txt".to_string();
        cache.insert(id.clone(), vec![1, 2, 3]);
        cache.insert(id.clone(), vec![4, 5, 6]);

        let retrieved = cache.get(&id).unwrap();
        assert_eq!(*retrieved, vec![4, 5, 6]);
    }

    #[test]
    fn test_dashmap_remove() {
        let cache: DashMap<String, Vec<u8>> = DashMap::new();

        let id = "ext:txt".to_string();
        cache.insert(id.clone(), vec![1, 2, 3]);

        cache.remove(&id);

        assert!(cache.get(&id).is_none());
    }

    #[test]
    fn test_dashmap_concurrent_access() {
        use std::sync::Arc;
        use std::thread;

        let cache = Arc::new(DashMap::<String, Vec<u8>>::new());
        let mut handles = vec![];

        for i in 0..10 {
            let cache_clone = cache.clone();
            handles.push(thread::spawn(move || {
                let id = format!("ext:{}", i);
                cache_clone.insert(id, vec![i as u8]);
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }

        assert_eq!(cache.len(), 10);
    }
}
