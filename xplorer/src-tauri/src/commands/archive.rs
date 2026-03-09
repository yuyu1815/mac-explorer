//! アーカイブ操作のTauriコマンド（薄いラッパー）
//!
//! ビジネスロジックは `archive_core` モジュールに分離されています。
//! このファイルはTauriとの統合のみを担当します。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::SystemTime;

use dashmap::DashMap;
use once_cell::sync::Lazy;

use super::archive_core::{
    compress_archive_core, extract_archive_core, list_archive_entries_core,
    ArchiveEntry,
};
use super::types::{
    CompressionProgress, CompressionResultWithErrors, ExtractionProgress,
    ExtractionResult,
};

// キャッシュの再エクスポート（互換性維持）
pub use super::archive_core::{
    collect_files_to_compress, find_common_path, get_common_parent, is_archive_file, parse_format,
    system_time_to_timestamp, SUPPORTED_ARCHIVE_EXTENSIONS,
};

/// エントリキャッシュ（Tauriコマンド用）
static ARCHIVE_CACHE: Lazy<DashMap<String, (SystemTime, Vec<ArchiveEntry>)>> =
    Lazy::new(DashMap::new);

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

// OperationControlAccess の実装は ipc.rs で行う

// =============================================================================
// Tauriコマンド（薄いラッパー）
// =============================================================================

#[tauri::command]
pub fn pause_operation(state: tauri::State<Arc<OperationControl>>) {
    state.paused.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn resume_operation(state: tauri::State<Arc<OperationControl>>) {
    state.paused.store(false, Ordering::Relaxed);
}

#[tauri::command]
pub fn cancel_operation(state: tauri::State<Arc<OperationControl>>) {
    state.cancelled.store(true, Ordering::Relaxed);
    state.paused.store(false, Ordering::Relaxed);
}

/// 指定されたファイルやフォルダを一つのアーカイブファイルに圧縮します。
///
/// ビジネスロジックは `archive_core::compress_archive_core` に委譲します。
#[tauri::command]
pub async fn compress_archive(
    sources: Vec<String>,
    dest_archive_path: String,
    format: String,
    channel: tauri::ipc::Channel<CompressionProgress>,
    state: tauri::State<'_, Arc<OperationControl>>,
) -> Result<CompressionResultWithErrors, String> {
    state.reset();
    let control = state.inner().clone();

    tokio::task::spawn_blocking(move || {
        compress_archive_core(sources, dest_archive_path, format, channel, control.as_ref())
    })
    .await
    .map_err(|e| format!("圧縮タスクエラー: {}", e))?
}

/// アーカイブファイルを指定されたディレクトリに展開します。
///
/// ビジネスロジックは `archive_core::extract_archive_core` に委譲します。
#[tauri::command]
pub async fn extract_archive(
    archive_path: String,
    dest_dir: String,
    channel: tauri::ipc::Channel<ExtractionProgress>,
    state: tauri::State<'_, Arc<OperationControl>>,
) -> Result<ExtractionResult, String> {
    state.reset();
    let control = state.inner().clone();

    tokio::task::spawn_blocking(move || {
        extract_archive_core(archive_path, dest_dir, channel, control.as_ref())
    })
    .await
    .map_err(|e| format!("展開タスクエラー: {}", e))?
}

/// アーカイブのエントリ一覧を取得します。
///
/// キャッシュ機能付きで、同じアーカイブに対する再取得を高速化します。
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
        let mtime = std::fs::metadata(&src)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::now());

        let entries = list_archive_entries_core(src.clone())?;

        // キャッシュに保存
        ARCHIVE_CACHE.insert(src, (mtime, entries.clone()));

        Ok(entries)
    })
    .await
    .map_err(|e| format!("エントリ一覧取得エラー: {}", e))?
}

// =============================================================================
// 再エクスポート（互換性維持）
// =============================================================================

pub use super::archive_core::is_archive_file as is_archive_file_public;
