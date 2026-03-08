//! utils モジュールのテスト
//!
//! format_size, format_speed, format_eta などのフォーマット関数をテストします。

mod format_size_tests {
    use xplorer_lib::utils::format_size;

    #[test]
    fn test_format_size_bytes() {
        assert_eq!(format_size(0), "0 B");
        assert_eq!(format_size(1), "1 B");
        assert_eq!(format_size(512), "512 B");
        assert_eq!(format_size(1023), "1023 B");
    }

    #[test]
    fn test_format_size_kilobytes() {
        assert_eq!(format_size(1024), "1.0 KB");
        assert_eq!(format_size(1536), "1.5 KB");
        assert_eq!(format_size(1024 * 100), "100.0 KB");
        assert_eq!(format_size(1024 * 1023), "1023.0 KB");
    }

    #[test]
    fn test_format_size_megabytes() {
        assert_eq!(format_size(1024 * 1024), "1.0 MB");
        assert_eq!(format_size(1024 * 1024 * 512), "512.0 MB");
        assert_eq!(format_size(1024 * 1024 * 1023), "1023.0 MB");
    }

    #[test]
    fn test_format_size_gigabytes() {
        assert_eq!(format_size(1024 * 1024 * 1024), "1.0 GB");
        assert_eq!(format_size(1024 * 1024 * 1024 * 10), "10.0 GB");
    }

    #[test]
    fn test_format_size_terabytes() {
        assert_eq!(format_size(1024u64.pow(4)), "1.0 TB");
    }
}

mod format_speed_tests {
    use xplorer_lib::utils::format_speed;

    #[test]
    fn test_format_speed_zero() {
        assert_eq!(format_speed(0), "0 B/s");
    }

    #[test]
    fn test_format_speed_bytes() {
        assert_eq!(format_speed(100), "100 B/s");
        assert_eq!(format_speed(1023), "1023 B/s");
    }

    #[test]
    fn test_format_speed_kilobytes() {
        assert_eq!(format_speed(1024), "1.0 KB/s");
        assert_eq!(format_speed(1024 * 512), "512.0 KB/s");
        assert_eq!(format_speed(1024 * 1023), "1023.0 KB/s");
    }

    #[test]
    fn test_format_speed_megabytes() {
        assert_eq!(format_speed(1024 * 1024), "1.0 MB/s");
        assert_eq!(format_speed(1024 * 1024 * 50), "50.0 MB/s");
        assert_eq!(format_speed(1024 * 1024 * 100), "100.0 MB/s");
    }

    #[test]
    fn test_format_speed_gigabytes() {
        assert_eq!(format_speed(1024 * 1024 * 1024), "1.0 GB/s");
        assert_eq!(format_speed(1024 * 1024 * 1024 * 5), "5.0 GB/s");
    }
}

mod format_eta_tests {
    use xplorer_lib::utils::format_eta;

    #[test]
    fn test_format_eta_zero() {
        assert_eq!(format_eta(0), "計算中...");
    }

    #[test]
    fn test_format_eta_seconds() {
        assert_eq!(format_eta(1), "1秒");
        assert_eq!(format_eta(30), "30秒");
        assert_eq!(format_eta(59), "59秒");
    }

    #[test]
    fn test_format_eta_minutes() {
        assert_eq!(format_eta(60), "1分0秒");
        assert_eq!(format_eta(90), "1分30秒");
        assert_eq!(format_eta(120), "2分0秒");
        assert_eq!(format_eta(3599), "59分59秒");
    }

    #[test]
    fn test_format_eta_hours() {
        assert_eq!(format_eta(3600), "1時間0分");
        assert_eq!(format_eta(3661), "1時間1分");
        assert_eq!(format_eta(7325), "2時間2分");
        assert_eq!(format_eta(3600 * 10 + 1800), "10時間30分");
    }

    #[test]
    fn test_format_eta_large_values() {
        assert_eq!(format_eta(3600 * 24), "24時間0分");
        assert_eq!(format_eta(3600 * 100), "100時間0分");
    }
}
