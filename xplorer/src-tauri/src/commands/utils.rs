use std::time::SystemTime;

/// バイトサイズを人間が読みやすい形式（B, KB, MB, GB）にフォーマットします。
///
/// # Arguments
/// * `bytes` - フォーマット対象のサイズ（バイト）
#[tauri::command]
pub fn format_size(bytes: u64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
    let mut size = bytes as f64;
    let mut idx = 0;

    while size >= 1024.0 && idx < units.len() - 1 {
        size /= 1024.0;
        idx += 1;
    }

    if idx == 0 {
        format!("{} {}", bytes, units[idx])
    } else {
        format!("{:.1} {}", size, units[idx])
    }
}

/// 速度（バイト/秒）を人間が読みやすい形式にフォーマットします。
///
/// # Arguments
/// * `bytes_per_sec` - 速度（バイト/秒）
pub fn format_speed(bytes_per_sec: u64) -> String {
    format!("{}{}", format_size(bytes_per_sec), "/s")
}

/// 残り時間（秒）を人間が読みやすい形式にフォーマットします。
///
/// # Arguments
/// * `seconds` - 残り時間（秒）
pub fn format_eta(seconds: u64) -> String {
    if seconds == 0 {
        return "計算中...".to_string();
    }

    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;

    if hours > 0 {
        format!("{}時間{}分", hours, minutes)
    } else if minutes > 0 {
        format!("{}分{}秒", minutes, secs)
    } else {
        format!("{}秒", secs)
    }
}

/// Unixタイムスタンプをローカル日時の文字列（YYYY/MM/DD HH:MM）に変換します。
///
/// 0が渡された場合は空文字列を返します。
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

/// ユーザーのホームディレクトリパスを取得します。
///
/// 環境変数 `HOME` を参照します。取得できない場合はエラーを返します。
#[tauri::command]
pub async fn get_home_dir() -> Result<String, String> {
    std::env::var("HOME").map_err(|_| "Could not determine home directory".to_string())
}

/// 指定されたパスの親ディレクトリパスを計算します。
///
/// パストラバーサルを防ぐため、単純な文字列操作ではなくセグメント分割によって計算を行います。
/// ルート直下の要素の場合は `/` を返します。
#[tauri::command]
pub async fn get_parent_path(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);

    // ルートディレクトリの場合は自身を返す、あるいはパス構成がない場合はエラー
    if path == "/" {
        return Ok("/".to_string());
    }

    p.parent()
        .map(|parent| {
            let s = parent.to_string_lossy().into_owned();
            if s.is_empty() {
                ".".to_string()
            } else {
                s
            }
        })
        .ok_or_else(|| "No parent directory".to_string())
}

/// 指定されたパスを、OS標準のアプリケーションとして開きます。
///
/// macOSでは `open` コマンドを使用します。
#[tauri::command]
pub async fn open_file_default(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 指定されたディレクトリでターミナル（Terminal.app）を開きます。
///
/// AppleScript経由でターミナルを起動し、対象ディレクトリへ `cd` を実行させます。
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
