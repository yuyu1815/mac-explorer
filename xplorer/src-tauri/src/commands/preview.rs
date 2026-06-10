//! プレビューペイン用に、指定パスのプレビューデータを返すコマンド。
//!
//! 種別判定は拡張子テーブル駆動。テキストは先頭のみ返し、画像は表示を
//! フロント（asset protocol）に委ねてパスのみ返す。

use std::fs::File;
use std::io::Read;
use std::path::Path;

use super::types::{FilePreview, PreviewKind};
use super::utils::format_size;

const TEXT_PREVIEW_BYTES: usize = 64 * 1024;

/// 拡張子からプレビュー種別を引く。未知の拡張子はNone（=テキスト試行 or バイナリ）。
fn kind_from_extension(ext: &str) -> Option<PreviewKind> {
    match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "heic" => {
            Some(PreviewKind::Image)
        }
        "pdf" => Some(PreviewKind::Pdf),
        "mp4" | "mov" | "m4v" | "avi" | "mkv" | "webm" => Some(PreviewKind::Video),
        "mp3" | "wav" | "aac" | "flac" | "m4a" | "ogg" => Some(PreviewKind::Audio),
        _ => None,
    }
}

/// 指定ファイルのプレビューデータを返します。
#[tauri::command]
pub async fn get_file_preview(path: String) -> Result<FilePreview, String> {
    tokio::task::spawn_blocking(move || preview_blocking(&path))
        .await
        .map_err(|e| format!("プレビュータスクエラー: {}", e))?
}

fn preview_blocking(path: &str) -> Result<FilePreview, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("メタデータ取得失敗 ({}): {}", path, e))?;
    if meta.is_dir() {
        return Err("ディレクトリはプレビューできません".to_string());
    }
    let size = meta.len();

    let ext = Path::new(path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    // 拡張子で確定する種別（画像/PDF/動画/音声）は中身を読まず返す
    if let Some(kind) = kind_from_extension(&ext) {
        return Ok(media_preview(kind, path, size));
    }

    // それ以外は中身を読んでテキスト/バイナリを判定する
    read_text_or_binary(path, size)
}

/// 中身を読まずに返すメディア系プレビュー。
fn media_preview(kind: PreviewKind, path: &str, size: u64) -> FilePreview {
    FilePreview {
        kind,
        path: path.to_string(),
        size,
        size_formatted: format_size(size),
        content: None,
        truncated: false,
    }
}

/// 先頭バイトを読み、バイナリ（NUL含む）かテキストかを判定して返す。
fn read_text_or_binary(path: &str, size: u64) -> Result<FilePreview, String> {
    let mut file = File::open(path).map_err(|e| format!("ファイルを開けません ({}): {}", path, e))?;
    let mut buf = vec![0u8; TEXT_PREVIEW_BYTES];
    let n = file.read(&mut buf).map_err(|e| e.to_string())?;
    let head = &buf[..n];

    if head.contains(&0) {
        return Ok(FilePreview {
            kind: PreviewKind::Binary,
            path: path.to_string(),
            size,
            size_formatted: format_size(size),
            content: None,
            truncated: false,
        });
    }

    Ok(FilePreview {
        kind: PreviewKind::Text,
        path: path.to_string(),
        size,
        size_formatted: format_size(size),
        content: Some(String::from_utf8_lossy(head).into_owned()),
        truncated: size > n as u64,
    })
}
