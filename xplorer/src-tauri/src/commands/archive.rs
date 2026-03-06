//https://github.com/AllenDang/libarchive-rs
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use libarchive2::{ArchiveFormat, CompressionFormat, FileType, ReadArchive, WriteArchive};
use walkdir::WalkDir;

use super::types::{
    CompressionError, CompressionProgress, CompressionResultWithErrors,
    ExtractionProgress, ExtractionResult,
};

/// 操作の一時停止/キャンセル制御用の共有ステート
pub struct OperationControl {
    pub paused: AtomicBool,
    pub cancelled: AtomicBool,
}

impl OperationControl {
    pub fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            cancelled: AtomicBool::new(false),
        }
    }

    /// ポーズ中はブロック、キャンセル時はErrを返す
    pub fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::Relaxed) {
            return Err("操作がキャンセルされました".to_string());
        }
        while self.paused.load(Ordering::Relaxed) {
            if self.cancelled.load(Ordering::Relaxed) {
                return Err("操作がキャンセルされました".to_string());
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        Ok(())
    }

    pub fn reset(&self) {
        self.paused.store(false, Ordering::Relaxed);
        self.cancelled.store(false, Ordering::Relaxed);
    }
}

impl Default for OperationControl {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub fn pause_operation(state: tauri::State<std::sync::Arc<OperationControl>>) {
    state.paused.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn resume_operation(state: tauri::State<std::sync::Arc<OperationControl>>) {
    state.paused.store(false, Ordering::Relaxed);
}

#[tauri::command]
pub fn cancel_operation(state: tauri::State<std::sync::Arc<OperationControl>>) {
    state.cancelled.store(true, Ordering::Relaxed);
    // ポーズ中の場合に備えて解除
    state.paused.store(false, Ordering::Relaxed);
}

/// フォーマット文字列からArchiveFormatとCompressionFormatを取得
fn parse_format(format: &str) -> (ArchiveFormat, CompressionFormat) {
    match format {
        "zip" => (ArchiveFormat::Zip, CompressionFormat::None),
        "tar" => (ArchiveFormat::TarPax, CompressionFormat::None),
        "tar.gz" | "tgz" => (ArchiveFormat::TarPax, CompressionFormat::Gzip),
        "tar.bz2" => (ArchiveFormat::TarPax, CompressionFormat::Bzip2),
        "tar.xz" => (ArchiveFormat::TarPax, CompressionFormat::Xz),
        "tar.zst" => (ArchiveFormat::TarPax, CompressionFormat::Zstd),
        "7z" => (ArchiveFormat::SevenZip, CompressionFormat::None),
        _ => (ArchiveFormat::Zip, CompressionFormat::None),
    }
}

/// SystemTimeをUnixタイムスタンプに変換
fn system_time_to_timestamp(time: Option<SystemTime>) -> i64 {
    time.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// パストラバーサル攻撃を検出（macOSのみ）
fn is_path_traversal_attempt(path: &str) -> bool {
    // "../" を含むパスは拒否
    path.contains("../")
        // 絶対パスも拒否（macOS）
        || path.starts_with('/')
}

/// 複数のパスから共通の親ディレクトリを取得
fn get_common_parent(paths: &[String]) -> Option<PathBuf> {
    if paths.is_empty() {
        return None;
    }
    if paths.len() == 1 {
        return Some(Path::new(&paths[0]).parent()?.to_path_buf());
    }

    let mut common = PathBuf::from(&paths[0]);
    for path in &paths[1..] {
        let current = Path::new(path);
        // 共通部分を取得
        common = find_common_path(&common, current)?;
    }
    Some(common)
}

/// 2つのパスの共通部分を見つける
fn find_common_path(a: &Path, b: &Path) -> Option<PathBuf> {
    let mut common = PathBuf::new();
    for comp in a.components() {
        let temp = common.join(comp);
        if b.starts_with(&temp) {
            common = temp;
        } else {
            break;
        }
    }
    if common.as_os_str().is_empty() {
        None
    } else {
        Some(common)
    }
}

/// ファイル/フォルダをアーカイブに圧縮
#[tauri::command]
pub async fn compress_archive(
    sources: Vec<String>,
    dest_archive_path: String,
    format: String,
    channel: tauri::ipc::Channel<CompressionProgress>,
    state: tauri::State<'_, std::sync::Arc<OperationControl>>,
) -> Result<CompressionResultWithErrors, String> {
    state.reset();
    let control = state.inner().clone();
    let sources = sources.clone();
    let dest = dest_archive_path.clone();
    let fmt = format.clone();

    tokio::task::spawn_blocking(move || {
        let dest_path = Path::new(&dest);

        if let Some(parent) = dest_path.parent() {
            if !parent.exists() {
                return Err(format!(
                    "親ディレクトリが存在しません: {}",
                    parent.display()
                ));
            }
        }

        if dest_path.exists() {
            if dest_path.is_file() {
                if let Err(e) = std::fs::remove_file(dest_path) {
                    return Err(format!("既存のファイルを上書きのために削除できません: {}", e));
                }
            } else {
                return Err(format!("同名のディレクトリが既に存在します: {}", dest_path.display()));
            }
        }

        // 共通の親ディレクトリを取得（相対パス計算用）
        let common_parent = get_common_parent(&sources);

        let mut total_files = 0u32;
        let mut total_bytes = 0u64;
        let mut file_list: Vec<(String, u64)> = Vec::new();
        let mut errors: Vec<CompressionError> = Vec::new();

        // ファイル一覧を作成
        for src in &sources {
            let src_path = Path::new(src);
            if !src_path.exists() {
                errors.push(CompressionError {
                    file_path: src.clone(),
                    message: "ファイルが存在しません".to_string(),
                });
                continue;
            }

            if src_path.is_file() {
                if let Ok(metadata) = std::fs::metadata(src_path) {
                    total_files += 1;
                    total_bytes += metadata.len();
                    file_list.push((src.clone(), metadata.len()));
                }
            } else if src_path.is_dir() {
                for entry in WalkDir::new(src_path)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if entry.file_type().is_file() {
                        if let Ok(metadata) = entry.metadata() {
                            total_files += 1;
                            total_bytes += metadata.len();
                            file_list.push((entry.path().display().to_string(), metadata.len()));
                        }
                    }
                }
            }
        }

        if total_files == 0 && !errors.is_empty() {
            return Err(format!(
                "圧縮するファイルがありません: {}個のエラー",
                errors.len()
            ));
        }

        if total_files == 0 {
            return Err("圧縮するファイルがありません".to_string());
        }

        let (archive_format, compression_format) = parse_format(&fmt);

        let mut archive = WriteArchive::new()
            .format(archive_format)
            .compression(compression_format)
            .open_file(&dest)
            .map_err(|e| format!("アーカイブを作成できません: {}", e))?;

        let mut files_processed = 0u32;
        let mut bytes_processed = 0u64;
        let emit_interval = 10;

        for (file_path, _file_size) in file_list {
            control.check()?;
            let path = Path::new(&file_path);
            if !path.exists() || !path.is_file() {
                continue;
            }

            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");

            // 相対パスを計算（共通親ディレクトリがある場合）
            let archive_path = if sources.len() == 1 {
                file_name.to_string()
            } else if let Some(ref parent) = common_parent {
                path.strip_prefix(parent)
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| file_path.clone())
            } else {
                file_path.clone()
            };

            match File::open(path) {
                Ok(mut input) => {
                    let mut buffer = Vec::new();
                    match input.read_to_end(&mut buffer) {
                        Ok(_) => {
                            if let Err(e) = archive.add_file(&archive_path, &buffer) {
                                errors.push(CompressionError {
                                    file_path: file_path.clone(),
                                    message: format!("アーカイブ書き込みエラー: {}", e),
                                });
                                continue;
                            }
                            bytes_processed += buffer.len() as u64;
                        }
                        Err(e) => {
                            errors.push(CompressionError {
                                file_path: file_path.clone(),
                                message: format!("ファイル読み込みエラー: {}", e),
                            });
                            continue;
                        }
                    }
                }
                Err(e) => {
                    errors.push(CompressionError {
                        file_path: file_path.clone(),
                        message: format!("ファイルオープンエラー: {}", e),
                    });
                    continue;
                }
            }

            files_processed += 1;

            if files_processed % emit_interval == 0 || files_processed == total_files {
                let _ = channel.send(CompressionProgress {
                    current_file: file_name.to_string(),
                    files_processed,
                    total_files,
                    bytes_processed,
                    total_bytes,
                    complete: false,
                });
            }
        }

        archive
            .finish()
            .map_err(|e| format!("アーカイブの完了に失敗: {}", e))?;

        let compressed_size =
            std::fs::metadata(dest_path).map(|m| m.len()).unwrap_or(0);

        let _ = channel.send(CompressionProgress {
            current_file: String::new(),
            files_processed,
            total_files,
            bytes_processed,
            total_bytes,
            complete: true,
        });

        Ok(CompressionResultWithErrors {
            archive_path: dest_archive_path,
            files_count: files_processed,
            original_size: bytes_processed,
            compressed_size,
            errors,
        })
    })
    .await
    .map_err(|e| format!("圧縮タスクエラー: {}", e))?
}

/// アーカイブを展開
#[tauri::command]
pub async fn extract_archive(
    archive_path: String,
    dest_dir: String,
    channel: tauri::ipc::Channel<ExtractionProgress>,
    state: tauri::State<'_, std::sync::Arc<OperationControl>>,
) -> Result<ExtractionResult, String> {
    state.reset();
    let control = state.inner().clone();
    let src = archive_path.clone();
    let dest = dest_dir.clone();

    tokio::task::spawn_blocking(move || {
        let src_path = Path::new(&src);
        let dest_path = Path::new(&dest);

        if !src_path.exists() {
            return Err(format!("アーカイブが存在しません: {}", src_path.display()));
        }

        if !dest_path.exists() {
            std::fs::create_dir_all(dest_path)
                .map_err(|e| format!("展開先ディレクトリを作成できません: {}", e))?;
        }

        // エントリ数と解凍後の合計サイズを事前に取得
        let mut total_files = 0u32;
        let mut total_uncompressed_bytes = 0u64;

        {
            let mut temp_archive =
                ReadArchive::open(&src).map_err(|e| format!("アーカイブを開けません: {}", e))?;

            while let Some(entry) = temp_archive
                .next_entry()
                .map_err(|e| format!("エントリの取得に失敗: {}", e))?
            {
                total_files += 1;
                total_uncompressed_bytes += entry.size().max(0) as u64;
            }
        }

        if total_files == 0 {
            return Err("アーカイブが空です".to_string());
        }

        // ディスク空き容量のチェック（macOS: statvfs）
        {
            use std::ffi::CString;
            let dest_c = CString::new(dest_path.to_str().unwrap_or("/"))
                .map_err(|_| "パスの変換に失敗しました".to_string())?;
            unsafe {
                let mut stat: libc::statvfs = std::mem::zeroed();
                if libc::statvfs(dest_c.as_ptr(), &mut stat) == 0 {
                    let available = stat.f_bavail as u64 * stat.f_frsize as u64;
                    if total_uncompressed_bytes > available {
                        return Err(format!(
                            "INSUFFICIENT_SPACE:{}:{}:{}",
                            total_uncompressed_bytes, available, dest_path.display()
                        ));
                    }
                }
            }
        }

        let mut files_processed = 0u32;
        let mut bytes_processed = 0u64;
        let mut errors: Vec<String> = Vec::new();
        let emit_interval = 10;

        // アーカイブ内のファイルの解凍後合計サイズをプログレスの分母とする
        let total_bytes = total_uncompressed_bytes;

        let mut archive =
            ReadArchive::open(&src).map_err(|e| format!("アーカイブを開けません: {}", e))?;

        while let Some(entry) = archive
            .next_entry()
            .map_err(|e| format!("エントリの取得に失敗: {}", e))?
        {
            control.check()?;
            let entry_path = entry.pathname().unwrap_or_default();

            // パストラバーサル攻撃の検出
            if is_path_traversal_attempt(&entry_path) {
                errors.push(format!(
                    "パストラバーサル攻撃を検出: {} (スキップしました)",
                    entry_path
                ));
                files_processed += 1;
                continue;
            }

            let out_path = dest_path.join(&entry_path);

            // 出力パスが宛先ディレクトリ外であることを確認
            if let Ok(canon_out) = out_path.canonicalize() {
                if let Ok(canon_dest) = dest_path.canonicalize() {
                    if !canon_out.starts_with(&canon_dest) {
                        errors.push(format!(
                            "パスが宛先ディレクトリ外: {} (スキップしました)",
                            entry_path
                        ));
                        files_processed += 1;
                        continue;
                    }
                }
            }

            if entry.file_type() == FileType::Directory || entry_path.ends_with('/') || entry_path.is_empty() {
                if let Err(e) = std::fs::create_dir_all(&out_path) {
                    errors.push(format!(
                        "ディレクトリ作成エラー {}: {}",
                        out_path.display(),
                        e
                    ));
                }
                files_processed += 1;

                if files_processed % emit_interval == 0 || files_processed == total_files {
                    let _ = channel.send(ExtractionProgress {
                        current_file: entry_path.to_string(),
                        files_processed,
                        total_files,
                        bytes_processed,
                        total_bytes,
                        complete: false,
                    });
                }
                continue;
            }

            if let Some(parent) = out_path.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    errors.push(format!(
                        "親ディレクトリ作成エラー {}: {}",
                        parent.display(),
                        e
                    ));
                    continue;
                }
            }

            match File::create(&out_path) {
                Ok(mut output) => {
                    let mut buf = [0u8; 65536];
                    let mut last_emit_bytes = bytes_processed;
                    loop {
                        match archive.read_data(&mut buf) {
                            Ok(0) => break,
                            Ok(n) => {
                                control.check()?;
                                if let Err(e) = output.write_all(&buf[..n]) {
                                    errors.push(format!(
                                        "ファイル書き込みエラー {}: {}",
                                        out_path.display(),
                                        e
                                    ));
                                    break;
                                }
                                bytes_processed += n as u64;

                                // 約1MBごとに進捗を送信（リアルタイム性向上のため50MBから1MBへ）
                                if bytes_processed - last_emit_bytes >= 1024 * 1024 {
                                    let _ = channel.send(ExtractionProgress {
                                        current_file: entry_path.to_string(),
                                        files_processed,
                                        total_files,
                                        bytes_processed,
                                        total_bytes,
                                        complete: false,
                                    });
                                    last_emit_bytes = bytes_processed;
                                }
                            }
                            Err(e) => {
                                errors.push(format!("ファイル読み込みエラー: {}", e));
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    errors.push(format!(
                        "ファイル作成エラー {}: {}",
                        out_path.display(),
                        e
                    ));
                    continue;
                }
            }

            files_processed += 1;

            if files_processed % emit_interval == 0 || files_processed == total_files {
                let _ = channel.send(ExtractionProgress {
                    current_file: entry_path.to_string(),
                    files_processed,
                    total_files,
                    bytes_processed,
                    total_bytes,
                    complete: false,
                });
            }
        }

        let _ = channel.send(ExtractionProgress {
            current_file: String::new(),
            files_processed,
            total_files,
            bytes_processed,
            total_bytes,
            complete: true,
        });

        Ok(ExtractionResult {
            extracted_count: files_processed,
            extracted_size: bytes_processed,
            destination: dest_dir,
            errors,
        })
    })
    .await
    .map_err(|e| format!("展開タスクエラー: {}", e))?
}

/// アーカイブ内のエントリ一覧を取得
#[tauri::command]
pub async fn list_archive_entries(archive_path: String) -> Result<Vec<ArchiveEntry>, String> {
    let src = archive_path.clone();

    tokio::task::spawn_blocking(move || {
        let src_path = Path::new(&src);

        if !src_path.exists() {
            return Err(format!("アーカイブが存在しません: {}", src_path.display()));
        }

        let mut archive =
            ReadArchive::open(&src).map_err(|e| format!("アーカイブを開けません: {}", e))?;

        let mut entries = Vec::new();

        while let Some(entry) = archive
            .next_entry()
            .map_err(|e| format!("エントリの取得に失敗: {}", e))?
        {
            let path = entry.pathname().unwrap_or_default().to_string();
            let size = entry.size().max(0) as u64;
            let is_directory = entry.file_type() == FileType::Directory;
            let modified = system_time_to_timestamp(entry.mtime());

            entries.push(ArchiveEntry {
                path,
                size,
                is_directory,
                modified,
            });
        }

        Ok(entries)
    })
    .await
    .map_err(|e| format!("エントリ一覧取得エラー: {}", e))?
}

/// アーカイブエントリ情報
#[derive(serde::Serialize)]
pub struct ArchiveEntry {
    pub path: String,
    pub size: u64,
    pub is_directory: bool,
    pub modified: i64,
}
