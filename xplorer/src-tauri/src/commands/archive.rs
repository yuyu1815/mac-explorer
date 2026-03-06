//! アーカイブ操作（圧縮、展開、エントリ一覧取得）およびその制御を行うコマンド。
//! 
//! `libarchive2` を使用して、ZIP, 7z, TARなどの多様なフォーマットをサポートします。
//! 長時間の操作を中断・再開するための `OperationControl` や、セキュリティのための
//! パストラバーサル防止ロジックを含みます。

//https://github.com/AllenDang/libarchive-rs
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use libarchive2::{ArchiveFormat, CompressionFormat, FileType, ReadArchive, WriteArchive};
use dashmap::DashMap;
use once_cell::sync::Lazy;
use walkdir::WalkDir;

static ARCHIVE_CACHE: Lazy<DashMap<String, (SystemTime, Vec<ArchiveEntry>)>> = Lazy::new(DashMap::new);

use super::types::{
    CompressionError, CompressionProgress, CompressionResultWithErrors, ExtractionProgress,
    ExtractionResult,
};

/// サポートされているアーカイブ拡張子の一覧
pub const SUPPORTED_ARCHIVE_EXTENSIONS: &[&str] = &[
    ".zip", ".7z", ".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz", ".tar.zst",
];

/// 指定されたパスがサポート対象のアーカイブかどうかを判定
pub fn is_archive_file(path: &str) -> bool {
    SUPPORTED_ARCHIVE_EXTENSIONS.iter().any(|ext| path.to_lowercase().ends_with(ext))
}

/// 操作の一時停止（Pause）およびキャンセル（Cancel）を制御するためのアトミックなフラグ。
/// 
/// アーカイブ操作のループ内で定期的に `check()` が呼び出され、
/// フラグの状態に応じてスレッドをブロックまたはエラー終了させます。
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
fn system_time_to_timestamp(t: Option<SystemTime>) -> i64 {
    t.and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// セキュリティ上のリスクがあるパスを検出します。
fn is_path_traversal_attempt(path: &str) -> bool {
    path.contains("../") || path.starts_with('/')
}

/// 複数のパスから共通の親ディレクトリを取得
fn get_common_parent(paths: &[String]) -> Option<PathBuf> {
    if paths.is_empty() { return None; }
    if paths.len() == 1 { return Path::new(&paths[0]).parent().map(|p| p.to_path_buf()); }
    paths.iter().skip(1).fold(Some(PathBuf::from(&paths[0])), |acc, p| acc.and_then(|a| find_common_path(&a, Path::new(p))))
}

fn find_common_path(a: &Path, b: &Path) -> Option<PathBuf> {
    let common = a.components().zip(b.components()).take_while(|(ca, cb)| ca == cb).map(|(c, _)| c).collect::<PathBuf>();
    if common.as_os_str().is_empty() { None } else { Some(common) }
}

/// 指定されたファイルやフォルダを一つのアーカイブファイルに圧縮します。
/// 
/// この関数は `tokio::task::spawn_blocking` を使用してバックグラウンドスレッドで実行され、
/// `Channel` を通じてフロントエンドに進捗状況（ファイル数、バイト数、速度等）をリアルタイムに送信します。
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
                    return Err(format!(
                        "既存のファイルを上書きのために削除できません: {}",
                        e
                    ));
                }
            } else {
                return Err(format!(
                    "同名のディレクトリが既に存在します: {}",
                    dest_path.display()
                ));
            }
        }

        // 共通の親ディレクトリを取得（相対パス計算用）
        let common_parent = get_common_parent(&sources);

        let mut file_list: Vec<(String, u64)> = Vec::new();
        let mut errors: Vec<CompressionError> = Vec::new();
        for src in &sources {
            let path = Path::new(src);
            if !path.exists() {
                errors.push(CompressionError {
                    file_path: src.clone(),
                    message: "NotFound".into(),
                });
                continue;
            }

            if path.is_file() {
                if let Ok(m) = std::fs::metadata(path) {
                    file_list.push((src.clone(), m.len()));
                }
            } else {
                let walk = WalkDir::new(path).into_iter().flatten();
                for e in walk.filter(|e| e.file_type().is_file()) {
                    if let Ok(m) = e.metadata() {
                        file_list.push((e.path().to_string_lossy().into(), m.len()));
                    }
                }
            }
        }

        if file_list.is_empty() {
            return if errors.is_empty() {
                Err("NoFiles".into())
            } else {
                Err(format!("Errors: {}", errors.len()))
            };
        }

        let total_files = file_list.len() as u32;
        let total_bytes = file_list.iter().map(|(_, s)| s).sum::<u64>();
        let (fmt, comp) = parse_format(&fmt);
        let mut archive = WriteArchive::new().format(fmt).compression(comp).open_file(&dest).map_err(|e| e.to_string())?;

        let mut files_processed = 0u32;
        let mut bytes_processed = 0u64;
        let emit_interval = 10;
        let mut last_emit_time = std::time::Instant::now();
        let mut last_bytes_processed = 0u64;
        let mut smoothed_speed = 0.0f64;

        for (file_path, _) in file_list {
            control.check()?;
            let path = Path::new(&file_path);
            if !path.exists() || !path.is_file() { continue; }
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown");
            let arc_path = if sources.len() == 1 { name.into() } else { common_parent.as_ref().and_then(|p| path.strip_prefix(p).ok()).map(|p| p.to_string_lossy().into()).unwrap_or(file_path.clone()) };

            let mut buf = Vec::new();
            File::open(path).and_then(|mut f| f.read_to_end(&mut buf)).map_err(|e| e.to_string())?;
            archive.add_file(&arc_path, &buf).map_err(|e| e.to_string())?;

            bytes_processed += buf.len() as u64;
            files_processed += 1;

            if files_processed.is_multiple_of(emit_interval) || files_processed == total_files {
                let now = std::time::Instant::now();
                let elapsed = now.duration_since(last_emit_time).as_secs_f64();
                if elapsed > 0.1 {
                    let current_raw_speed = (bytes_processed - last_bytes_processed) as f64 / elapsed;
                    smoothed_speed = if smoothed_speed == 0.0 { current_raw_speed } else { 0.3 * current_raw_speed + 0.7 * smoothed_speed };
                    last_emit_time = now;
                    last_bytes_processed = bytes_processed;
                }

                let eta = if smoothed_speed > 0.0 {
                    ((total_bytes - bytes_processed) as f64 / smoothed_speed) as u64
                } else {
                    0
                };

                let _ = channel.send(CompressionProgress {
                    current_file: name.to_string(),
                    files_processed,
                    total_files,
                    bytes_processed,
                    total_bytes,
                    speed: smoothed_speed as u64,
                    eta,
                    complete: false,
                });
            }
        }

        archive
            .finish()
            .map_err(|e| format!("アーカイブの完了に失敗: {}", e))?;

        let compressed_size = std::fs::metadata(dest_path).map(|m| m.len()).unwrap_or(0);

        let _ = channel.send(CompressionProgress {
            current_file: String::new(),
            files_processed,
            total_files,
            bytes_processed,
            total_bytes,
            speed: 0,
            eta: 0,
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

/// アーカイブファイルを指定されたディレクトリに展開します。
/// 
/// 展開前にディスク空き容量のチェックを行い、不足している場合は `INSUFFICIENT_SPACE` エラーを返します。
/// セキュリティのため、各エントリのパスが宛先ディレクトリを逸脱していないか検証します。
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

        let mut total_files = 0u32;
        let mut total_size = 0u64;

        {
            let mut tmp = ReadArchive::open(&src).map_err(|e| e.to_string())?;
            while let Some(e) = tmp.next_entry().map_err(|e| e.to_string())? {
                total_files += 1;
                total_size += e.size().max(0) as u64;
            }
        }

        if total_files == 0 {
            return Err("Empty".into());
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
                    if total_size > available {
                        return Err(format!(
                            "INSUFFICIENT_SPACE:{}:{}:{}",
                            total_size,
                            available,
                            dest_path.display()
                        ));
                    }
                }
            }
        }

        let mut files_processed = 0u32;
        let mut bytes_processed = 0u64;
        let mut errors: Vec<String> = Vec::new();
        let emit_interval = 10;
        let mut last_emit_time = std::time::Instant::now();
        let mut last_bytes_processed = 0u64;
        let mut smoothed_speed = 0.0f64;

        // アーカイブ内のファイルの解凍後合計サイズをプログレスの分母とする
        let total_bytes = total_size;

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

            if entry.file_type() == FileType::Directory
                || entry_path.ends_with('/')
                || entry_path.is_empty()
            {
                if let Err(e) = std::fs::create_dir_all(&out_path) {
                    errors.push(format!(
                        "ディレクトリ作成エラー {}: {}",
                        out_path.display(),
                        e
                    ));
                }
                files_processed += 1;

                if files_processed.is_multiple_of(emit_interval) || files_processed == total_files {
                    let now = std::time::Instant::now();
                    let elapsed = now.duration_since(last_emit_time).as_secs_f64();
                    if elapsed > 0.1 {
                        let current_raw_speed = (bytes_processed - last_bytes_processed) as f64 / elapsed;
                        smoothed_speed = if smoothed_speed == 0.0 { current_raw_speed } else { 0.3 * current_raw_speed + 0.7 * smoothed_speed };
                        last_emit_time = now;
                        last_bytes_processed = bytes_processed;
                    }

                    let eta = if smoothed_speed > 0.0 {
                        ((total_bytes - bytes_processed) as f64 / smoothed_speed) as u64
                    } else {
                        0
                    };

                    let _ = channel.send(ExtractionProgress {
                        current_file: entry_path.to_string(),
                        files_processed,
                        total_files,
                        bytes_processed,
                        total_bytes,
                        speed: smoothed_speed as u64,
                        eta,
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

                                // 約1MBごとに進捗を送信
                                if bytes_processed - last_bytes_processed >= 1024 * 1024 {
                                    let now = std::time::Instant::now();
                                    let elapsed = now.duration_since(last_emit_time).as_secs_f64();
                                    if elapsed > 0.1 {
                                        let current_raw_speed = (bytes_processed - last_bytes_processed) as f64 / elapsed;
                                        smoothed_speed = if smoothed_speed == 0.0 { current_raw_speed } else { 0.3 * current_raw_speed + 0.7 * smoothed_speed };
                                        last_emit_time = now;
                                        last_bytes_processed = bytes_processed;
                                    }

                                    let eta = if smoothed_speed > 0.0 {
                                        ((total_bytes - bytes_processed) as f64 / smoothed_speed) as u64
                                    } else {
                                        0
                                    };

                                    let _ = channel.send(ExtractionProgress {
                                        current_file: entry_path.to_string(),
                                        files_processed,
                                        total_files,
                                        bytes_processed,
                                        total_bytes,
                                        speed: smoothed_speed as u64,
                                        eta,
                                        complete: false,
                                    });
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
                    errors.push(format!("ファイル作成エラー {}: {}", out_path.display(), e));
                    continue;
                }
            }

            files_processed += 1;

            if files_processed.is_multiple_of(emit_interval) || files_processed == total_files {
                let now = std::time::Instant::now();
                let elapsed = now.duration_since(last_emit_time).as_secs_f64();
                if elapsed > 0.1 {
                    let current_raw_speed = (bytes_processed - last_bytes_processed) as f64 / elapsed;
                    smoothed_speed = if smoothed_speed == 0.0 { current_raw_speed } else { 0.3 * current_raw_speed + 0.7 * smoothed_speed };
                    last_emit_time = now;
                    last_bytes_processed = bytes_processed;
                }

                let eta = if smoothed_speed > 0.0 {
                    ((total_bytes - bytes_processed) as f64 / smoothed_speed) as u64
                } else {
                    0
                };

                let _ = channel.send(ExtractionProgress {
                    current_file: entry_path.to_string(),
                    files_processed,
                    total_files,
                    bytes_processed,
                    total_bytes,
                    speed: smoothed_speed as u64,
                    eta,
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
            speed: 0,
            eta: 0,
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

#[tauri::command]
pub async fn list_archive_entries(archive_path: String) -> Result<Vec<ArchiveEntry>, String> {
    let src = archive_path.clone();

    // 1. キャッシュチェック
    if let Some(cached) = ARCHIVE_CACHE.get(&src) {
        let (cached_time, entries) = cached.value();
        if let Ok(metadata) = std::fs::metadata(&src) {
            if let Ok(mtime) = metadata.modified() {
                if mtime == *cached_time {
                    return Ok(entries.clone());
                }
            }
        }
    }

    tokio::task::spawn_blocking(move || {
        let src_path = Path::new(&src);

        if !src_path.exists() {
            return Err(format!("アーカイブが存在しません: {}", src_path.display()));
        }

        let mtime = std::fs::metadata(&src)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::now());

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

        // キャッシュに保存
        ARCHIVE_CACHE.insert(src, (mtime, entries.clone()));

        Ok(entries)
    })
    .await
    .map_err(|e| format!("エントリ一覧取得エラー: {}", e))?
}

/// アーカイブエントリ情報
#[derive(serde::Serialize, Clone)]
pub struct ArchiveEntry {
    pub path: String,
    pub size: u64,
    pub is_directory: bool,
    pub modified: i64,
}
