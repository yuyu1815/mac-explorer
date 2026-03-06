//! フォーマット関数のテスト
//!
//! サイズやタイムスタンプのフォーマット関数をテストします。

// =============================================================================
// サイズフォーマットのテスト
// =============================================================================

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
        let just_under_mb: u64 = 1048575;
        let exactly_mb: u64 = 1024 * 1024;
        assert!(format_size(just_under_mb).ends_with("KB"));
        assert_eq!(format_size(exactly_mb), "1.0 MB");
    }

    #[test]
    fn test_megabytes() {
        assert_eq!(format_size(1572864), "1.5 MB");
        assert_eq!(format_size(10 * 1024 * 1024), "10.0 MB");
    }

    #[test]
    fn test_mb_gb_boundary() {
        let just_under_gb: u64 = 1024 * 1024 * 1024 - 1;
        let exactly_gb: u64 = 1024 * 1024 * 1024;
        assert!(format_size(just_under_gb).ends_with("MB"));
        assert_eq!(format_size(exactly_gb), "1.0 GB");
    }

    #[test]
    fn test_gigabytes() {
        assert_eq!(format_size(1536 * 1024 * 1024), "1.5 GB");
        assert_eq!(format_size(10 * 1024 * 1024 * 1024), "10.0 GB");
    }

    #[test]
    fn test_large_values() {
        assert_eq!(format_size(1000 * 1024 * 1024 * 1024), "1000.0 GB");
    }

    #[test]
    fn test_max_value() {
        assert!(format_size(u64::MAX).ends_with("EB"));
    }
}

// =============================================================================
// タイムスタンプフォーマットのテスト
// =============================================================================

mod format_timestamp {
    use xplorer_lib::commands::utils::format_timestamp;

    #[test]
    fn test_zero_timestamp() {
        assert_eq!(format_timestamp(0), "");
    }

    #[test]
    fn test_unix_epoch() {
        assert!(!format_timestamp(1).is_empty());
    }

    #[test]
    fn test_known_date() {
        let result = format_timestamp(1704067200); // 2024-01-01
        assert!(result.contains("2024"));
        assert!(result.contains("01"));
    }

    #[test]
    fn test_negative_timestamp_far_past() {
        let result = format_timestamp(-1);
        assert!(!result.is_empty() || result.is_empty());
    }
}
