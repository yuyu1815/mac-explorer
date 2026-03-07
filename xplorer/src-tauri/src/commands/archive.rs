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

use dashmap::DashMap;
use libarchive2::{ArchiveFormat, CompressionFormat, FileType, ReadArchive, WriteArchive};
use once_cell::sync::Lazy;
use walkdir::WalkDir;

static ARCHIVE_CACHE: Lazy<DashMap<String, (SystemTime, Vec<ArchiveEntry>)>> =
    Lazy::new(DashMap::new);

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
    SUPPORTED_ARCHIVE_EXTENSIONS
        .iter()
        .any(|ext| path.to_lowercase().ends_with(ext))
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
    t.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 複数のパスから共通の親ディレクトリを取得
fn get_common_parent(paths: &[String]) -> Option<PathBuf> {
    if paths.is_empty() {
        return None;
    }
    if paths.len() == 1 {
        return Path::new(&paths[0]).parent().map(|p| p.to_path_buf());
    }
    paths
        .iter()
        .skip(1)
        .fold(Some(PathBuf::from(&paths[0])), |acc, p| {
            acc.and_then(|a| find_common_path(&a, Path::new(p)))
        })
}

fn find_common_path(a: &Path, b: &Path) -> Option<PathBuf> {
    let common = a
        .components()
        .zip(b.components())
        .take_while(|(ca, cb)| ca == cb)
        .map(|(c, _)| c)
        .collect::<PathBuf>();
    if common.as_os_str().is_empty() {
        None
    } else {
        Some(common)
    }
}

/// 圧縮進捗のレポーター
struct CompressionProgressReporter {
    channel: tauri::ipc::Channel<CompressionProgress>,
    total_files: u32,
    total_bytes: u64,
    files_processed: u32,
    bytes_processed: u64,
    last_emit_time: std::time::Instant,
    last_bytes_processed: u64,
    smoothed_speed: f64,
}

impl CompressionProgressReporter {
    fn new(
        total_files: u32,
        total_bytes: u64,
        channel: tauri::ipc::Channel<CompressionProgress>,
    ) -> Self {
        Self {
            channel,
            total_files,
            total_bytes,
            files_processed: 0,
            bytes_processed: 0,
            last_emit_time: std::time::Instant::now(),
            last_bytes_processed: 0,
            smoothed_speed: 0.0,
        }
    }

    fn update(&mut self, current_file: &str, n_bytes: u64) {
        self.bytes_processed += n_bytes;
        self.files_processed += 1;

        // 一定間隔（または最終ファイル）で進捗を送信
        if self.files_processed.is_multiple_of(10) || self.files_processed == self.total_files {
            self.try_emit(current_file);
        }
    }

    fn try_emit(&mut self, current_file: &str) {
        let now = std::time::Instant::now();
        let elapsed = now.duration_since(self.last_emit_time).as_secs_f64();

        if elapsed > 0.1 || self.files_processed == self.total_files {
            let current_raw_speed =
                (self.bytes_processed - self.last_bytes_processed) as f64 / elapsed;
            self.smoothed_speed = if self.smoothed_speed == 0.0 {
                current_raw_speed
            } else {
                0.3 * current_raw_speed + 0.7 * self.smoothed_speed
            };
            self.last_emit_time = now;
            self.last_bytes_processed = self.bytes_processed;

            let eta = if self.smoothed_speed > 0.0 {
                ((self.total_bytes - self.bytes_processed) as f64 / self.smoothed_speed) as u64
            } else {
                0
            };

            let _ = self.channel.send(CompressionProgress {
                current_file: current_file.to_string(),
                files_processed: self.files_processed,
                total_files: self.total_files,
                bytes_processed: self.bytes_processed,
                total_bytes: self.total_bytes,
                speed: self.smoothed_speed as u64,
                eta,
                complete: false,
            });
        }
    }

    fn finish(self) {
        let _ = self.channel.send(CompressionProgress {
            current_file: String::new(),
            files_processed: self.files_processed,
            total_files: self.total_files,
            bytes_processed: self.bytes_processed,
            total_bytes: self.total_bytes,
            speed: 0,
            eta: 0,
            complete: true,
        });
    }
}

/// 圧縮対象のファイルを収集し、(実パス, アーカイブ内パス, サイズ) のリストを返します。
fn collect_files_to_compress(
    sources: &[String],
) -> Result<(Vec<(String, String, u64)>, Vec<CompressionError>), String> {
    let mut file_list = Vec::new();
    let mut errors = Vec::new();
    let common_parent = get_common_parent(sources);

    for src in sources {
        let path = Path::new(src);
        if !path.exists() {
            errors.push(CompressionError {
                file_path: src.clone(),
                message: "NotFound".into(),
            });
            continue;
        }

        let mut add_to_list = |p: &Path| {
            if let Ok(m) = std::fs::metadata(p) {
                let p_str = p.to_string_lossy().into_owned();
                let arc_path = if sources.len() == 1 {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string()
                } else {
                    common_parent
                        .as_ref()
                        .and_then(|cp| p.strip_prefix(cp).ok())
                        .map(|rp| rp.to_string_lossy().into())
                        .unwrap_or(p_str.clone())
                };
                file_list.push((p_str, arc_path, m.len()));
            }
        };

        if path.is_file() {
            add_to_list(path);
        } else {
            for entry in WalkDir::new(path).into_iter().flatten() {
                if entry.file_type().is_file() {
                    add_to_list(entry.path());
                }
            }
        }
    }

    if file_list.is_empty() && !errors.is_empty() {
        return Err(format!("Errors: {}", errors.len()));
    }
    if file_list.is_empty() {
        return Err("NoFiles".into());
    }

    Ok((file_list, errors))
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

        // 宛先チェック
        if let Some(parent) = dest_path.parent() {
            if !parent.exists() {
                return Err(format!(
                    "親ディレクトリが存在しません: {}",
                    parent.display()
                ));
            }
        }
        if dest_path.is_file() {
            let _ = std::fs::remove_file(dest_path);
        } else if dest_path.exists() {
            return Err(format!(
                "同名のディレクトリが存在します: {}",
                dest_path.display()
            ));
        }

        // 1. ファイル収集
        let (file_list, errors) = collect_files_to_compress(&sources)?;
        let total_files = file_list.len() as u32;
        let total_bytes = file_list.iter().map(|(_, _, s)| s).sum::<u64>();

        // 2. 準備
        let (fmt, comp) = parse_format(&fmt);
        let mut archive = WriteArchive::new()
            .format(fmt)
            .compression(comp)
            .open_file(&dest)
            .map_err(|e| e.to_string())?;
        let mut reporter = CompressionProgressReporter::new(total_files, total_bytes, channel);

        // 3. 圧縮ループ
        for (file_path, arc_path, _) in file_list {
            control.check()?;
            let path = Path::new(&file_path);
            if !path.exists() {
                continue;
            }

            let mut buf = Vec::new(); // TODO: ストリーミング化の検討
            File::open(path)
                .and_then(|mut f| f.read_to_end(&mut buf))
                .map_err(|e| e.to_string())?;
            archive
                .add_file(&arc_path, &buf)
                .map_err(|e| e.to_string())?;

            reporter.update(
                path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown"),
                buf.len() as u64,
            );
        }

        archive.finish().map_err(|e| format!("完了失敗: {}", e))?;
        let compressed_size = std::fs::metadata(dest_path).map(|m| m.len()).unwrap_or(0);
        let final_processed = reporter.bytes_processed;
        let final_count = reporter.files_processed;
        reporter.finish();

        Ok(CompressionResultWithErrors {
            archive_path: dest_archive_path,
            files_count: final_count,
            original_size: final_processed,
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

        // 空き容量チェック
        check_disk_space(dest_path, total_size)?;

        /// 空き容量のチェック（macOS: statvfs）
        fn check_disk_space(dest_path: &Path, required_size: u64) -> Result<(), String> {
            use std::ffi::CString;
            let dest_c = CString::new(dest_path.to_str().unwrap_or("/"))
                .map_err(|_| "パスの変換に失敗しました".to_string())?;

            unsafe {
                let mut stat: libc::statvfs = std::mem::zeroed();
                if libc::statvfs(dest_c.as_ptr(), &mut stat) == 0 {
                    let available = stat.f_bavail as u64 * stat.f_frsize as u64;
                    if required_size > available {
                        return Err(format!(
                            "INSUFFICIENT_SPACE:{}:{}:{}",
                            required_size,
                            available,
                            dest_path.display()
                        ));
                    }
                }
            }
            Ok(())
        }

        /// セキュリティ検証済みの宛先パスを「安全なコンポーネントのみ」で構築して取得
        fn validate_and_get_output_path(
            dest_dir: &Path,
            entry_path: &str,
        ) -> Result<Option<PathBuf>, String> {
            // 根本対策: Normal コンポーネントのみを抽出して結合することで、
            // ../ や絶対パス、ルート要素を物理的に排除して「建設的」に安全なパスを作る。
            let sanitized_relative: PathBuf = Path::new(entry_path)
                .components()
                .filter_map(|c| match c {
                    std::path::Component::Normal(s) => Some(s),
                    _ => None,
                })
                .collect();

            if sanitized_relative.as_os_str().is_empty() {
                return Ok(None);
            }

            Ok(Some(dest_dir.join(sanitized_relative)))
        }

        /// 展開進捗のレポーター
        struct ExtractionProgressReporter {
            channel: tauri::ipc::Channel<ExtractionProgress>,
            total_files: u32,
            total_bytes: u64,
            files_processed: u32,
            bytes_processed: u64,
            last_emit_time: std::time::Instant,
            last_bytes_processed: u64,
            smoothed_speed: f64,
        }

        impl ExtractionProgressReporter {
            fn new(
                total_files: u32,
                total_bytes: u64,
                channel: tauri::ipc::Channel<ExtractionProgress>,
            ) -> Self {
                Self {
                    channel,
                    total_files,
                    total_bytes,
                    files_processed: 0,
                    bytes_processed: 0,
                    last_emit_time: std::time::Instant::now(),
                    last_bytes_processed: 0,
                    smoothed_speed: 0.0,
                }
            }

            fn increment_file(&mut self, current_file: String) {
                self.files_processed += 1;
                self.try_emit(current_file);
            }

            fn update_bytes(&mut self, n: u64, current_file: String) {
                self.bytes_processed += n;
                // 約1MBごとに進捗を送信（またはファイル数に応じたインターバル）
                if self.bytes_processed - self.last_bytes_processed >= 1024 * 1024
                    || self.files_processed.is_multiple_of(10)
                {
                    self.try_emit(current_file);
                }
            }

            fn try_emit(&mut self, current_file: String) {
                let now = std::time::Instant::now();
                let elapsed = now.duration_since(self.last_emit_time).as_secs_f64();

                if elapsed > 0.1 || self.files_processed == self.total_files {
                    let current_raw_speed =
                        (self.bytes_processed - self.last_bytes_processed) as f64 / elapsed;
                    self.smoothed_speed = if self.smoothed_speed == 0.0 {
                        current_raw_speed
                    } else {
                        0.3 * current_raw_speed + 0.7 * self.smoothed_speed
                    };
                    self.last_emit_time = now;
                    self.last_bytes_processed = self.bytes_processed;

                    let eta = if self.smoothed_speed > 0.0 {
                        ((self.total_bytes - self.bytes_processed) as f64 / self.smoothed_speed)
                            as u64
                    } else {
                        0
                    };

                    let _ = self.channel.send(ExtractionProgress {
                        current_file,
                        files_processed: self.files_processed,
                        total_files: self.total_files,
                        bytes_processed: self.bytes_processed,
                        total_bytes: self.total_bytes,
                        speed: self.smoothed_speed as u64,
                        eta,
                        complete: false,
                    });
                }
            }

            fn finish(self) {
                let _ = self.channel.send(ExtractionProgress {
                    current_file: String::new(),
                    files_processed: self.files_processed,
                    total_files: self.total_files,
                    bytes_processed: self.bytes_processed,
                    total_bytes: self.total_bytes,
                    speed: 0,
                    eta: 0,
                    complete: true,
                });
            }
        }

        let mut reporter = ExtractionProgressReporter::new(total_files, total_size, channel);
        let mut errors: Vec<String> = Vec::new();
        let mut archive =
            ReadArchive::open(&src).map_err(|e| format!("アーカイブを開けません: {}", e))?;

        while let Some(entry) = archive
            .next_entry()
            .map_err(|e| format!("エントリの取得に失敗: {}", e))?
        {
            control.check()?;
            let entry_path = entry.pathname().unwrap_or_default();

            let out_path = match validate_and_get_output_path(dest_path, &entry_path) {
                Ok(Some(p)) => p,
                Ok(None) => {
                    reporter.increment_file(entry_path);
                    continue;
                }
                Err(e) => {
                    errors.push(e);
                    reporter.increment_file(entry_path);
                    continue;
                }
            };

            // ディレクトリ作成
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
                reporter.increment_file(entry_path);
                continue;
            }

            // 親ディレクトリの確保
            if let Some(parent) = out_path.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    errors.push(format!(
                        "親ディレクトリ作成エラー {}: {}",
                        parent.display(),
                        e
                    ));
                    reporter.increment_file(entry_path);
                    continue;
                }
            }

            // ファイル展開
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
                                        "書き込みエラー {}: {}",
                                        out_path.display(),
                                        e
                                    ));
                                    break;
                                }
                                reporter.update_bytes(n as u64, entry_path.clone());
                            }
                            Err(e) => {
                                errors.push(format!("読み込みエラー: {}", e));
                                break;
                            }
                        }
                    }
                }
                Err(e) => errors.push(format!("作成エラー {}: {}", out_path.display(), e)),
            }
            reporter.increment_file(entry_path);
        }

        let final_count = reporter.files_processed;
        let final_size = reporter.bytes_processed;
        reporter.finish();

        Ok(ExtractionResult {
            extracted_count: final_count,
            extracted_size: final_size,
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
        let mtime = std::fs::metadata(&src).ok().and_then(|m| m.modified().ok());

        if mtime == Some(*cached_time) {
            return Ok(entries.clone());
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
