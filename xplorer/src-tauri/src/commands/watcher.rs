//! ファイルシステムの変化を監視し、フロントエンドに通知するコマンド。
//!
//! notify クレートを使用して OS レベルのイベント（作成、削除、変更等）をキャッチし、
//! Tauri のイベントシステムを通じてフロントエンドに通知します。

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// フロントエンドに送信する変更イベントのデータ構造
#[derive(Debug, Clone, Serialize)]
pub struct FsChangeEvent {
    pub path: String,
}

/// ウォッチャーの状態を管理する構造体
pub struct WatcherState {
    /// 現在アクティブなウォッチャー。パスごとに管理するのではなく、
    /// 基本的に「現在表示中のディレクトリ」1つを監視することを想定。
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    /// 現在監視中のパス。
    pub current_watch_path: Mutex<Option<PathBuf>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self::default()
    }
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
            current_watch_path: Mutex::new(None),
        }
    }
}

/// 指定されたパスの監視を開始します。
///
/// 既に別のパスを監視している場合は、古い監視を停止して新しいパスへの監視に切り替えます。
#[tauri::command]
pub async fn watch_path(
    app: AppHandle,
    state: State<'_, Arc<WatcherState>>,
    path: String,
) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    
    // 物理的なディレクトリでない場合は監視しない（アーカイブ内など）
    if !path_buf.is_dir() {
        // アーカイブ内などの場合は、監視を停止して終了
        stop_watching(&state);
        return Ok(());
    }

    let mut current_path_lock = state.current_watch_path.lock().unwrap();
    
    // 既に同じパスを監視中なら何もしない
    if let Some(ref current) = *current_path_lock {
        if current == &path_buf {
            return Ok(());
        }
    }

    // 古いウォッチャーを破棄
    let mut watcher_lock = state.watcher.lock().unwrap();
    *watcher_lock = None;

    // 新しいウォッチャーを作成
    let app_handle = app.clone();
    let event_path = path.clone();
    
    let mut watcher = RecommendedWatcher::new(
        move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                // デバッグ用にイベント内容を出力しても良いが、
                // 基本的には「何かが変わった」ことさえ分かれば一覧を再取得するので
                // 詳細なフィルタリングは最小限にする
                if event.need_rescan() || 
                   event.kind.is_modify() || 
                   event.kind.is_create() || 
                   event.kind.is_remove() {
                    let _ = app_handle.emit("fs-change", FsChangeEvent {
                        path: event_path.clone(),
                    });
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    // 監視を開始
    watcher
        .watch(&path_buf, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *watcher_lock = Some(watcher);
    *current_path_lock = Some(path_buf);

    Ok(())
}

/// 現在のパスの監視を停止します。
#[tauri::command]
pub async fn unwatch_path(state: State<'_, Arc<WatcherState>>) -> Result<(), String> {
    stop_watching(&state);
    Ok(())
}

/// 監視を停止するための内部ヘルパー
pub fn stop_watching(state: &WatcherState) {
    let mut watcher_lock = state.watcher.lock().unwrap();
    let mut current_path_lock = state.current_watch_path.lock().unwrap();
    *watcher_lock = None;
    *current_path_lock = None;
}

