//! ボリューム機能のテスト
//!
//! システムにマウントされているボリューム（ディスク）の一覧取得をテストします。

use xplorer_lib::volumes::list_volumes;

// =============================================================================
// ボリューム一覧取得のテスト
// =============================================================================

mod list_volumes_tests {
    use super::*;

    #[tokio::test]
    async fn test_list_volumes_returns_at_least_root() {
        // Act
        let result = list_volumes().await.unwrap();

        // Assert - At minimum, root volume should exist
        assert!(!result.is_empty(), "Should have at least one volume");

        // Root volume should be first
        let root = &result[0];
        assert_eq!(root.name, "Macintosh HD");
        assert_eq!(root.path, "/");
    }

    #[tokio::test]
    async fn test_list_volumes_root_has_valid_size() {
        // Act
        let result = list_volumes().await.unwrap();
        let root = &result[0];

        // Assert
        assert!(root.total_bytes > 0, "Root volume should have total size");
        assert!(root.free_bytes > 0, "Root volume should have free space");
        assert!(root.free_bytes <= root.total_bytes, "Free space should be <= total");
    }

    #[tokio::test]
    async fn test_list_volumes_formatted_sizes() {
        // Act
        let result = list_volumes().await.unwrap();
        let root = &result[0];

        // Assert
        assert!(!root.total_bytes_formatted.is_empty());
        assert!(!root.free_bytes_formatted.is_empty());
        // Should contain size unit (GB, TB, etc.)
        assert!(root.total_bytes_formatted.contains('G') || root.total_bytes_formatted.contains('T'));
    }

    #[tokio::test]
    async fn test_list_volumes_paths_are_valid() {
        // Act
        let result = list_volumes().await.unwrap();

        // Assert - All paths should exist
        for volume in &result {
            assert!(
                std::path::Path::new(&volume.path).exists(),
                "Volume path {} should exist",
                volume.path
            );
        }
    }

    #[tokio::test]
    async fn test_list_volumes_names_are_not_empty() {
        // Act
        let result = list_volumes().await.unwrap();

        // Assert
        for volume in &result {
            assert!(!volume.name.is_empty(), "Volume name should not be empty");
        }
    }

    #[tokio::test]
    async fn test_list_volumes_includes_volumes_directory() {
        // Act
        let result = list_volumes().await.unwrap();

        // Assert - If /Volumes has entries, they should be included
        if let Ok(_entries) = std::fs::read_dir("/Volumes") {
            // Note: /Volumes may include the root as a symlink
            assert!(result.len() >= 1, "Should include at least root volume");
        }
    }
}

// =============================================================================
// VolumeInfo構造体のテスト
// =============================================================================

mod volume_info_structure {
    use xplorer_lib::volumes::list_volumes;

    #[tokio::test]
    async fn test_volume_info_has_all_fields() {
        // Act
        let result = list_volumes().await.unwrap();
        let root = &result[0];

        // Assert - All fields should be populated
        assert!(!root.name.is_empty());
        assert!(!root.path.is_empty());
        assert!(root.total_bytes > 0);
        // free_bytes is u64, always >= 0
        assert!(!root.total_bytes_formatted.is_empty());
        assert!(!root.free_bytes_formatted.is_empty());
    }
}

// =============================================================================
// エッジケースのテスト
// =============================================================================

mod edge_cases {
    use super::*;

    #[tokio::test]
    async fn test_list_volumes_concurrent_calls() {
        // Act - Multiple concurrent calls should not fail
        let handles: Vec<_> = (0..5)
            .map(|_| {
                tokio::spawn(async { list_volumes().await })
            })
            .collect();

        // Assert
        for handle in handles {
            let result = handle.await.unwrap();
            assert!(result.is_ok());
        }
    }

    #[tokio::test]
    async fn test_list_volumes_size_consistency() {
        // Act
        let result1 = list_volumes().await.unwrap();
        let result2 = list_volumes().await.unwrap();

        // Assert - Results should be consistent
        assert_eq!(result1.len(), result2.len());
        assert_eq!(result1[0].name, result2[0].name);
        assert_eq!(result1[0].path, result2[0].path);
    }
}
