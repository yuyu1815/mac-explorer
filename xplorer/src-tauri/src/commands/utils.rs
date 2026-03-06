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
        .map_err(|_| "Could not determine home directory".to_string())
}

/// 親ディレクトリパス取得
#[tauri::command]
pub async fn get_parent_path(path: String) -> Result<String, String> {
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let normalized = path.replace('\\', "/");
    let segments: Vec<&str> = normalized.split('/').collect();
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
    std::process::Command::new("open")
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

    let script = format!(
        "tell application \"Terminal\"\n  activate\n  do script \"cd '{}'\"\nend tell",
        path.replace('\'', "'\\''")
    );
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| format!("Failed to open terminal: {}", e))?;

    Ok(())
}
