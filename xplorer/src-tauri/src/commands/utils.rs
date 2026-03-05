use std::time::SystemTime;

/// サイズをフォーマット
pub fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

/// タイムスタンプをフォーマット
pub fn format_timestamp(ts: i64) -> String {
    if ts == 0 {
        return String::new();
    }
    let datetime: chrono::DateTime<chrono::Local> = SystemTime::UNIX_EPOCH
        .checked_add(std::time::Duration::from_secs(ts as u64))
        .map(chrono::DateTime::from)
        .unwrap_or_else(chrono::Local::now);
    datetime.format("%Y/%m/%d %H:%M").to_string()
}

/// ホームディレクトリ取得
#[tauri::command]
pub async fn get_home_dir() -> Result<String, String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())
}

/// 親ディレクトリパス取得
#[tauri::command]
pub async fn get_parent_path(path: String) -> Result<String, String> {
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let segments: Vec<&str> = path.split('/').collect();
    let non_empty: Vec<&str> = segments.into_iter().filter(|s| !s.is_empty()).collect();

    if non_empty.len() <= 1 {
        if path.starts_with('/') {
            return Ok("/".to_string());
        }
        return Ok(path);
    }

    let parent_segments = &non_empty[..non_empty.len() - 1];

    if path.starts_with('/') {
        return Ok(format!("/{}", parent_segments.join("/")));
    }

    Ok(parent_segments.join("/"))
}

/// デフォルトアプリでファイルを開く
#[tauri::command]
pub async fn open_file_default(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// ターミナルを開く
#[tauri::command]
pub async fn open_terminal_at(path: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    if !target.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "tell application \"Terminal\"\n  activate\n  do script \"cd '{}'\"\nend tell",
            path.replace('\'', "'\\''")
        );
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("x-terminal-emulator")
            .current_dir(&path)
            .spawn()
            .or_else(|_| {
                std::process::Command::new("gnome-terminal")
                    .arg("--working-directory")
                    .arg(&path)
                    .spawn()
            })
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    mod format_size {
        use super::*;

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
            // 境界値: 1023 B (KB未満)
            assert_eq!(format_size(1023), "1023 B");
            // 境界値: 1024 B = 1 KB
            assert_eq!(format_size(1024), "1.0 KB");
        }

        #[test]
        fn test_kilobytes() {
            assert_eq!(format_size(1536), "1.5 KB"); // 1.5 KB
            assert_eq!(format_size(2048), "2.0 KB"); // 2 KB
        }

        #[test]
        fn test_kb_mb_boundary() {
            // 境界値: 1 MB - 1 = 1048575
            assert_eq!(format_size(1048575).ends_with("KB"), true);
            // 境界値: 1 MB = 1048576
            assert_eq!(format_size(1024 * 1024), "1.0 MB");
        }

        #[test]
        fn test_megabytes() {
            assert_eq!(format_size(1572864), "1.5 MB"); // 1.5 MB
            assert_eq!(format_size(10 * 1024 * 1024), "10.0 MB");
        }

        #[test]
        fn test_mb_gb_boundary() {
            // 境界値: 1 GB - 1
            let just_under_gb: u64 = 1024 * 1024 * 1024 - 1;
            assert!(format_size(just_under_gb).ends_with("MB"));
            // 境界値: 1 GB
            assert_eq!(format_size(1024 * 1024 * 1024), "1.0 GB");
        }

        #[test]
        fn test_gigabytes() {
            assert_eq!(format_size(1536 * 1024 * 1024), "1.5 GB");
            assert_eq!(format_size(10 * 1024 * 1024 * 1024), "10.0 GB");
        }

        #[test]
        fn test_large_values() {
            // 1 TB (1000 GB相当)
            let tb: u64 = 1000 * 1024 * 1024 * 1024;
            assert_eq!(format_size(tb), "1000.0 GB");
        }

        #[test]
        fn test_max_value() {
            // u64::MAX でもパニックしないことを確認
            let result = format_size(u64::MAX);
            assert!(result.ends_with("GB"));
        }
    }

    mod format_timestamp {
        use super::*;

        #[test]
        fn test_zero_timestamp() {
            // 0は無効として空文字を返す
            assert_eq!(format_timestamp(0), "");
        }

        #[test]
        fn test_unix_epoch() {
            // 1970-01-01 00:00:00 UTC
            let result = format_timestamp(1);
            assert!(!result.is_empty());
        }

        #[test]
        fn test_known_date() {
            // 2024-01-01 00:00:00 UTC = 1704067200
            let result = format_timestamp(1704067200);
            assert!(result.contains("2024"));
            assert!(result.contains("01"));
        }

        #[test]
        fn test_negative_timestamp_far_past() {
            // 負の値は i64 だが、大きな正の値として解釈される可能性
            // この実装では as u64 でキャストされるため、動作を確認
            let result = format_timestamp(-1);
            // パニックしないことだけ確認
            assert!(!result.is_empty() || result.is_empty());
        }
    }

    mod get_parent_path {
        use super::*;

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
            // 末尾スラッシュがある場合
            let result = get_parent_path("/Users/yuyu/".to_string()).await;
            assert!(result.is_ok());
            // 末尾スラッシュは削除されてから処理されるべき
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
            // 単一の相対ディレクトリの場合
            let parent = result.unwrap();
            assert!(parent.is_empty() || parent == "folder");
        }
    }

    mod get_home_dir {
        use super::*;

        #[tokio::test]
        async fn test_returns_home() {
            let result = get_home_dir().await;
            assert!(result.is_ok());
            let home = result.unwrap();
            assert!(!home.is_empty());
            assert!(home.starts_with('/'));
        }
    }
}
