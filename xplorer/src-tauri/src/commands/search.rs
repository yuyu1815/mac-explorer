//! ディレクトリ配下のテキストファイル内容を再帰的に検索するコマンド。
//!
//! バイナリファイル・大容量ファイル・隠しディレクトリはスキップし、
//! 結果は上限件数で打ち切る（打ち切り発生は `truncated` で通知）。

use std::fs;
use std::io::{BufRead, BufReader};

use walkdir::WalkDir;

use super::types::{ContentMatch, ContentSearchResult};

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB超のファイルはスキップ
const MAX_MATCHES: usize = 500;
const SNIPPET_MAX_CHARS: usize = 200;
const BINARY_SNIFF_BYTES: usize = 8 * 1024; // 先頭8KBにNULがあればバイナリ判定

/// 指定ディレクトリ以下を再帰走査し、テキストファイル内容に `query` を含む行を返します。
///
/// 大文字小文字は区別しません。
#[tauri::command]
pub async fn search_file_contents(
    dir: String,
    query: String,
) -> Result<ContentSearchResult, String> {
    if query.is_empty() {
        return Err("検索クエリが空です".to_string());
    }

    tokio::task::spawn_blocking(move || search_blocking(&dir, &query))
        .await
        .map_err(|e| format!("検索タスクエラー: {}", e))?
}

fn search_blocking(dir: &str, query: &str) -> Result<ContentSearchResult, String> {
    let needle = query.to_lowercase();
    let mut matches = Vec::new();

    let walker = WalkDir::new(dir)
        .into_iter()
        .filter_entry(|e| !is_hidden_dir(e));

    for entry in walker.flatten() {
        if matches.len() >= MAX_MATCHES {
            return Ok(ContentSearchResult { matches, truncated: true });
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.len() > MAX_FILE_SIZE {
            continue;
        }
        if is_binary(path) {
            continue;
        }

        let path_str = path.to_string_lossy().into_owned();
        scan_file(&path_str, &needle, &mut matches);
    }

    let truncated = matches.len() >= MAX_MATCHES;
    matches.truncate(MAX_MATCHES);
    Ok(ContentSearchResult { matches, truncated })
}

/// 隠しディレクトリ（先頭が `.`）かどうか。ファイルは対象外。
fn is_hidden_dir(entry: &walkdir::DirEntry) -> bool {
    entry.file_type().is_dir()
        && entry
            .file_name()
            .to_str()
            .is_some_and(|n| n.starts_with('.'))
}

/// 先頭バイトにNULを含むかでバイナリを簡易判定する。
fn is_binary(path: &std::path::Path) -> bool {
    use std::io::Read;
    let Ok(mut file) = fs::File::open(path) else {
        return true;
    };
    let mut buf = [0u8; BINARY_SNIFF_BYTES];
    let Ok(n) = file.read(&mut buf) else {
        return true;
    };
    buf[..n].contains(&0)
}

/// 単一ファイルを行ごとに走査し、マッチをpushする。
fn scan_file(path: &str, needle: &str, matches: &mut Vec<ContentMatch>) {
    let Ok(file) = fs::File::open(path) else { return };
    let reader = BufReader::new(file);

    for (idx, line) in reader.lines().enumerate() {
        if matches.len() >= MAX_MATCHES {
            return;
        }
        let Ok(line) = line else { return }; // 不正UTF-8行に当たったら以降は走査しない
        if !line.to_lowercase().contains(needle) {
            continue;
        }
        matches.push(ContentMatch {
            path: path.to_string(),
            line_number: (idx + 1) as u32,
            snippet: make_snippet(&line),
        });
    }
}

/// マッチ行をトリムし、最大文字数で切り詰めたスニペットを作る。
fn make_snippet(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.chars().count() <= SNIPPET_MAX_CHARS {
        return trimmed.to_string();
    }
    let cut: String = trimmed.chars().take(SNIPPET_MAX_CHARS).collect();
    format!("{}…", cut)
}
