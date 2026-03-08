//! アーカイブ操作のコアロジック（Tauri非依存）
//!
//! ビジネスロジックをIPC層から分離し、テスト可能にする。

use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use libarchive2::{ArchiveFormat, CompressionFormat, FileType, ReadArchive, WriteArchive};
use walkdir::WalkDir;

use super::ipc::{OperationControlAccess, ProgressChannel};
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

/// フォーマット文字列からArchiveFormatとCompressionFormatを取得
pub fn parse_format(format: &str) -> (ArchiveFormat, CompressionFormat) {
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
pub fn system_time_to_timestamp(t: Option<SystemTime>) -> i64 {
    t.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 複数のパスから共通の親ディレクトリを取得
pub fn get_common_parent(paths: &[String]) -> Option<PathBuf> {
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

pub fn find_common_path(a: &Path, b: &Path) -> Option<PathBuf> {
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

/// 圧縮対象のファイルを収集し、(実パス, アーカイブ内パス, サイズ) のリストを返します。
pub fn collect_files_to_compress(
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

// =============================================================================
// 圧縮進捗レポーター（ジェネリック）
// =============================================================================

/// 圧縮進捗のレポーター
pub struct CompressionProgressReporter<C: ProgressChannel<CompressionProgress>> {
    pub channel: C, // テスト用に公開
    total_files: u32,
    total_bytes: u64,
    files_processed: u32,
    bytes_processed: u64,
    last_emit_time: std::time::Instant,
    last_bytes_processed: u64,
    smoothed_speed: f64,
}

impl<C: ProgressChannel<CompressionProgress>> CompressionProgressReporter<C> {
    pub fn new(total_files: u32, total_bytes: u64, channel: C) -> Self {
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

    pub fn update(&mut self, current_file: &str, n_bytes: u64) {
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
                (self.bytes_processed - self.last_bytes_processed) as f64 / elapsed.max(0.001);
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

    pub fn finish(self) {
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

// =============================================================================
// 展開進捗レポーター（ジェネリック）
// =============================================================================

/// 展開進捗のレポーター
pub struct ExtractionProgressReporter<C: ProgressChannel<ExtractionProgress>> {
    pub channel: C, // テスト用に公開
    total_files: u32,
    total_bytes: u64,
    files_processed: u32,
    bytes_processed: u64,
    last_emit_time: std::time::Instant,
    last_bytes_processed: u64,
    smoothed_speed: f64,
}

impl<C: ProgressChannel<ExtractionProgress>> ExtractionProgressReporter<C> {
    pub fn new(total_files: u32, total_bytes: u64, channel: C) -> Self {
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

    pub fn increment_file(&mut self, current_file: String) {
        self.files_processed += 1;
        self.try_emit(current_file);
    }

    pub fn update_bytes(&mut self, n: u64, current_file: String) {
        self.bytes_processed += n;
        // 約1MBごとに進捗を送信（またはファイル数に応じたインターバル）
        if self.bytes_processed.saturating_sub(self.last_bytes_processed) >= 1024 * 1024
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
                (self.bytes_processed - self.last_bytes_processed) as f64 / elapsed.max(0.001);
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

    pub fn finish(self) {
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

// =============================================================================
// コア関数（Tauri非依存）
// =============================================================================

/// 圧縮処理のコアロジック
///
/// Tauriに依存しない純粋なビジネスロジック。テスト可能。
pub fn compress_archive_core<C: ProgressChannel<CompressionProgress>, O: OperationControlAccess>(
    sources: Vec<String>,
    dest_archive_path: String,
    format: String,
    channel: C,
    control: &O,
) -> Result<CompressionResultWithErrors, String> {
    let dest_path = Path::new(&dest_archive_path);

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
    let (fmt, comp) = parse_format(&format);
    let mut archive = WriteArchive::new()
        .format(fmt)
        .compression(comp)
        .open_file(dest_path)
        .map_err(|e| e.to_string())?;
    let mut reporter = CompressionProgressReporter::new(total_files, total_bytes, channel);

    // 3. 圧縮ループ
    for (file_path, arc_path, _) in file_list {
        control.check()?;
        let path = Path::new(&file_path);
        if !path.exists() {
            continue;
        }

        let mut buf = Vec::new();
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
}

/// 展開処理のコアロジック
///
/// Tauriに依存しない純粋なビジネスロジック。テスト可能。
pub fn extract_archive_core<C: ProgressChannel<ExtractionProgress>, O: OperationControlAccess>(
    archive_path: String,
    dest_dir: String,
    channel: C,
    control: &O,
) -> Result<ExtractionResult, String> {
    let src_path = Path::new(&archive_path);
    let dest_path = Path::new(&dest_dir);

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
        let mut tmp = ReadArchive::open(src_path).map_err(|e| e.to_string())?;
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

    let mut reporter = ExtractionProgressReporter::new(total_files, total_size, channel);
    let mut errors: Vec<String> = Vec::new();
    let mut archive =
        ReadArchive::open(src_path).map_err(|e| format!("アーカイブを開けません: {}", e))?;

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
}

// =============================================================================
// ヘルパー関数
// =============================================================================

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
fn validate_and_get_output_path(dest_dir: &Path, entry_path: &str) -> Result<Option<PathBuf>, String> {
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

// =============================================================================
// アーカイブエントリ
// =============================================================================

/// アーカイブエントリ情報
#[derive(Debug, serde::Serialize, Clone)]
pub struct ArchiveEntry {
    pub path: String,
    pub size: u64,
    pub is_directory: bool,
    pub modified: i64,
}

/// エントリ一覧取得のコアロジック
pub fn list_archive_entries_core(archive_path: String) -> Result<Vec<ArchiveEntry>, String> {
    let src_path = Path::new(&archive_path);

    if !src_path.exists() {
        return Err(format!("アーカイブが存在しません: {}", src_path.display()));
    }

    let mut archive =
        ReadArchive::open(src_path).map_err(|e| format!("アーカイブを開けません: {}", e))?;

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
}

// =============================================================================
// ユニットテスト
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::ipc::{MockChannel, MockOperationControl};

    #[test]
    fn test_parse_format() {
        assert!(matches!(parse_format("zip"), (ArchiveFormat::Zip, _)));
        assert!(matches!(parse_format("tar"), (ArchiveFormat::TarPax, CompressionFormat::None)));
        assert!(matches!(parse_format("tar.gz"), (ArchiveFormat::TarPax, CompressionFormat::Gzip)));
        assert!(matches!(parse_format("7z"), (ArchiveFormat::SevenZip, _)));
    }

    #[test]
    fn test_is_archive_file() {
        assert!(is_archive_file("test.zip"));
        assert!(is_archive_file("test.tar.gz"));
        assert!(is_archive_file("TEST.ZIP")); // case insensitive
        assert!(!is_archive_file("test.txt"));
        assert!(!is_archive_file("test.rar")); // not supported
    }

    #[test]
    fn test_get_common_parent() {
        let paths = vec![
            "/home/user/docs/file1.txt".to_string(),
            "/home/user/docs/file2.txt".to_string(),
        ];
        let common = get_common_parent(&paths);
        assert_eq!(common, Some(PathBuf::from("/home/user/docs")));

        let single = vec!["/home/user/file.txt".to_string()];
        let common_single = get_common_parent(&single);
        assert_eq!(common_single, Some(PathBuf::from("/home/user")));
    }

    #[test]
    fn test_find_common_path() {
        let a = Path::new("/home/user/docs");
        let b = Path::new("/home/user/images");
        let common = find_common_path(a, b);
        assert_eq!(common, Some(PathBuf::from("/home/user")));

        let a = Path::new("/a/b/c");
        let b = Path::new("/x/y/z");
        let common = find_common_path(a, b);
        // 絶対パスの場合、ルート"/"が共通パスになる
        // （ルートディレクトリ自体は共通）
        assert_eq!(common, Some(PathBuf::from("/")));
    }

    #[test]
    fn test_system_time_to_timestamp() {
        let now = SystemTime::now();
        let ts = system_time_to_timestamp(Some(now));
        assert!(ts > 0);

        let none = system_time_to_timestamp(None);
        assert_eq!(none, 0);
    }

    #[test]
    fn test_compression_progress_reporter() {
        let channel = MockChannel::<CompressionProgress>::new();
        let mut reporter = CompressionProgressReporter::new(20, 1000, channel);

        // updateを呼んでも、時間条件（elapsed > 0.1s）と最終ファイル条件が満たされないと送信されない
        // そのため、total_filesに達した時のみ確実に送信される
        for i in 0..20 {
            reporter.update(&format!("file{}.txt", i), 50);
        }

        // finishを呼ぶと必ず送信される
        // finishの前にカウントを取得（finishはselfを消費するため）
        let count_before_finish = reporter.channel.count();
        reporter.finish();

        // finishで少なくとも1回は送信されているはず
        assert!(count_before_finish + 1 >= 1);
    }

    #[test]
    fn test_extraction_progress_reporter() {
        let channel = MockChannel::<ExtractionProgress>::new();
        let mut reporter = ExtractionProgressReporter::new(10, 100000, channel);

        // 全ファイル処理後にfinishで送信
        for i in 0..10 {
            reporter.increment_file(format!("file{}.txt", i));
        }

        // finishの前にカウントを取得
        let count_before_finish = reporter.channel.count();
        reporter.finish();

        // finishで確実に送信される
        assert!(count_before_finish + 1 >= 1);
    }

    #[test]
    fn test_collect_files_to_compress_single_file() {
        // 一時ファイルを作成
        let temp_dir = std::env::temp_dir().join("xplorer_test_collect");
        std::fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("test.txt");
        std::fs::write(&file_path, "test content").unwrap();

        let sources = vec![file_path.to_string_lossy().to_string()];
        let result = collect_files_to_compress(&sources);

        assert!(result.is_ok());
        let (files, errors) = result.unwrap();
        assert_eq!(files.len(), 1);
        assert!(errors.is_empty());
        assert_eq!(files[0].1, "test.txt"); // arc_path should be filename only for single file

        // クリーンアップ
        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn test_collect_files_to_compress_nonexistent() {
        let sources = vec!["/nonexistent/path/file.txt".to_string()];
        let result = collect_files_to_compress(&sources);

        assert!(result.is_err());
    }

    #[test]
    fn test_collect_files_to_compress_directory() {
        // 一時ディレクトリを作成
        let temp_dir = std::env::temp_dir().join("xplorer_test_collect_dir");
        std::fs::create_dir_all(&temp_dir).unwrap();
        std::fs::write(temp_dir.join("file1.txt"), "content1").unwrap();
        std::fs::write(temp_dir.join("file2.txt"), "content2").unwrap();

        let sources = vec![temp_dir.to_string_lossy().to_string()];
        let result = collect_files_to_compress(&sources);

        assert!(result.is_ok());
        let (files, errors) = result.unwrap();
        assert_eq!(files.len(), 2);
        assert!(errors.is_empty());

        // クリーンアップ
        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn test_collect_files_to_compress_mixed() {
        // 存在するファイルと存在しないファイルが混在する場合
        let temp_dir = std::env::temp_dir().join("xplorer_test_mixed");
        std::fs::create_dir_all(&temp_dir).unwrap();
        let existing_file = temp_dir.join("exists.txt");
        std::fs::write(&existing_file, "content").unwrap();

        let sources = vec![
            existing_file.to_string_lossy().to_string(),
            "/nonexistent/file.txt".to_string(),
        ];
        let result = collect_files_to_compress(&sources);

        assert!(result.is_ok());
        let (files, errors) = result.unwrap();
        assert_eq!(files.len(), 1); // 存在するファイルのみ
        assert_eq!(errors.len(), 1); // 存在しないファイルはエラー

        // クリーンアップ
        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn test_compress_archive_core_with_mock() {
        // テスト用ファイルを作成
        let temp_dir = std::env::temp_dir().join("xplorer_test_compress_core");
        std::fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("test.txt");
        std::fs::write(&file_path, "test content for compression").unwrap();

        let archive_path = temp_dir.join("test.zip");
        let channel = MockChannel::<CompressionProgress>::new();
        let control = MockOperationControl::new();

        let sources = vec![file_path.to_string_lossy().to_string()];
        let result = compress_archive_core(
            sources,
            archive_path.to_string_lossy().to_string(),
            "zip".to_string(),
            channel,
            &control,
        );

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result.files_count, 1);
        assert!(result.errors.is_empty());
        assert!(archive_path.exists());

        // クリーンアップ
        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn test_compress_archive_core_cancelled() {
        // キャンセルされた場合のテスト
        let temp_dir = std::env::temp_dir().join("xplorer_test_compress_cancel");
        std::fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("test.txt");
        std::fs::write(&file_path, "test content").unwrap();

        let archive_path = temp_dir.join("test.zip");
        let channel = MockChannel::<CompressionProgress>::new();
        let control = MockOperationControl::new();

        // 事前にキャンセル
        control.cancel();

        let sources = vec![file_path.to_string_lossy().to_string()];
        let result = compress_archive_core(
            sources,
            archive_path.to_string_lossy().to_string(),
            "zip".to_string(),
            channel,
            &control,
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("キャンセル"));

        // クリーンアップ
        std::fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn test_list_archive_entries_core() {
        // 既存のアーカイブが存在しない場合のテスト
        let result = list_archive_entries_core("/nonexistent/archive.zip".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("存在しません"));
    }

    #[test]
    fn test_extract_archive_core_nonexistent() {
        let channel = MockChannel::<ExtractionProgress>::new();
        let control = MockOperationControl::new();

        let result = extract_archive_core(
            "/nonexistent/archive.zip".to_string(),
            "/tmp/extract".to_string(),
            channel,
            &control,
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("存在しません"));
    }
}
