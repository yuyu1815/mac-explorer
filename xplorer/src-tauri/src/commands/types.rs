//! フロントエンドとバックエンド間でやり取りされるデータ構造を定義するモジュール。

use serde::{Deserialize, Serialize};

/// ファイルまたはディレクトリの基本情報を保持する構造体。
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub size_formatted: String,
    pub modified: i64,
    pub modified_formatted: String,
    pub created: i64,
    pub created_formatted: String,
    pub file_type: String,
    pub is_hidden: bool,
    pub is_symlink: bool,
    pub is_archive: bool,
    pub permissions: String,
    pub icon_id: String,
}

/// プロパティ進捗（ストリーミング用）
#[derive(Serialize, Clone)]
pub struct PropertyProgress {
    pub size_bytes: u64,
    pub size_formatted: String,
    pub size_on_disk_bytes: u64,
    pub size_on_disk_formatted: String,
    pub contains_files: u32,
    pub contains_folders: u32,
    pub complete: bool,
}

/// 詳細プロパティ
#[derive(Serialize)]
pub struct DetailedProperties {
    pub name: String,
    pub path: String,
    pub file_type: String,
    pub location: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub size_on_disk_bytes: u64,
    pub size_on_disk_formatted: String,
    pub contains_files: u32,
    pub contains_folders: u32,
    pub created_formatted: String,
    pub modified_formatted: String,
    pub accessed_formatted: String,
    pub is_readonly: bool,
    pub is_hidden: bool,
}

/// ボリューム情報
#[derive(Serialize)]
pub struct VolumeInfo {
    pub name: String,
    pub path: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub total_bytes_formatted: String,
    pub free_bytes_formatted: String,
}

/// 圧縮進捗（ストリーミング用）
#[derive(Debug, Serialize, Clone)]
pub struct CompressionProgress {
    pub current_file: String,
    pub files_processed: u32,
    pub total_files: u32,
    pub bytes_processed: u64,
    pub bytes_processed_formatted: String,
    pub total_bytes: u64,
    pub total_bytes_formatted: String,
    pub speed: u64,
    pub speed_formatted: String,
    pub eta: u64,
    pub eta_formatted: String,
    pub progress_percent: f64,
    pub complete: bool,
}

/// 圧縮結果
#[derive(Serialize)]
pub struct CompressionResult {
    pub archive_path: String,
    pub files_count: u32,
    pub original_size: u64,
    pub compressed_size: u64,
}

/// 解凍進捗（ストリーミング用）
#[derive(Debug, Serialize, Clone)]
pub struct ExtractionProgress {
    pub current_file: String,
    pub files_processed: u32,
    pub total_files: u32,
    pub bytes_processed: u64,
    pub bytes_processed_formatted: String,
    pub total_bytes: u64,
    pub total_bytes_formatted: String,
    pub speed: u64,
    pub speed_formatted: String,
    pub eta: u64,
    pub eta_formatted: String,
    pub progress_percent: f64,
    pub complete: bool,
}

/// 解凍結果
#[derive(Debug, Serialize)]
pub struct ExtractionResult {
    pub extracted_count: u32,
    pub extracted_size: u64,
    pub destination: String,
    pub errors: Vec<String>,
}

/// 圧縮エラー情報
#[derive(Debug, Serialize)]
pub struct CompressionError {
    pub file_path: String,
    pub message: String,
}

/// 圧縮結果（エラー付き）
#[derive(Debug, Serialize)]
pub struct CompressionResultWithErrors {
    pub archive_path: String,
    pub files_count: u32,
    pub original_size: u64,
    pub compressed_size: u64,
    pub errors: Vec<CompressionError>,
}
