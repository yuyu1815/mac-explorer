//! Xplorerバックエンドのメインエントリーポイント。
//!
//! このモジュールでは、Tauriアプリケーションの起動、プラグインの初期化、
//! カスタムURIスキームの登録、およびフロントエンドから呼び出されるコマンドの登録を行います。

#![allow(unexpected_cfgs)]
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
pub mod commands;
pub mod utils;

// Re-export for integration tests
pub use commands::{archive, directory, file_ops, icons, properties, utils as commands_utils, volumes, watcher};

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Tauriアプリケーションの実行を開始します。
///
/// プラグインの初期化、ステートの登録、アイコンキャッシュのセットアップ、
/// および並列でのアイコンプリウォーム処理などを含みます。
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            // アーカイブ操作の一時停止/キャンセル制御用のステートを登録
            app.manage(std::sync::Arc::new(
                commands::archive::OperationControl::new(),
            ));

            // ファイルシステム監視用のステートを登録
            app.manage(std::sync::Arc::new(
                commands::watcher::WatcherState::new(),
            ));

            // アイコンキャッシュの初期化
            if let Ok(cache_dir) = app.path().app_cache_dir() {
                let icon_cache_dir = cache_dir.join("icons");
                commands::icons::init_icon_cache(icon_cache_dir);
            }

            // /Applications のアイコンをバックグラウンドで先読み
            std::thread::spawn(|| {
                if let Ok(entries) = std::fs::read_dir("/Applications") {
                    let app_ids: Vec<String> = entries
                        .flatten()
                        .filter(|e| e.path().extension().is_some_and(|ext| ext == "app"))
                        .map(|e| format!("app:{}", e.path().display()))
                        .collect();

                    use rayon::prelude::*;
                    app_ids.par_iter().for_each(|id| {
                        let _ = commands::icons::get_icon_binary(id);
                    });
                }
            });

            Ok(())
        })
        .register_uri_scheme_protocol("icon", |_app, request| {
            let path = request.uri().path();
            let decoded_path = percent_encoding::percent_decode_str(path).decode_utf8_lossy();

            // ルーティング
            let icon_id = if decoded_path.starts_with("/localhost/") {
                &decoded_path["/localhost/".len() - 1..]
            } else {
                &decoded_path
            };

            // IDからバイナリを取得（常にPNG形式）
            if let Some(data) = commands::icons::get_icon_binary(&icon_id[1..]) {
                tauri::http::Response::builder()
                    .header("Content-Type", "image/png")
                    .header("Cache-Control", "public, max-age=300")
                    .body(data)
                    .unwrap()
            } else {
                tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap()
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::directory::list_directory,
            commands::directory::list_files_sorted,
            commands::utils::open_file_default,
            commands::properties::show_properties,
            commands::properties::get_basic_properties,
            commands::properties::get_detailed_properties,
            commands::properties::get_detailed_properties_streaming,
            commands::properties::get_applications_for_file,
            commands::properties::set_default_application,
            commands::file_ops::create_directory,
            commands::file_ops::copy_files,
            commands::file_ops::move_files,
            commands::file_ops::delete_files,
            commands::file_ops::rename_file,
            commands::file_ops::batch_rename,
            commands::file_ops::create_file,
            commands::file_ops::check_exists,
            commands::utils::get_home_dir,
            commands::volumes::list_volumes,
            commands::utils::get_parent_path,
            commands::directory::complete_path,
            commands::utils::open_terminal_at,
            commands::archive::compress_archive,
            commands::archive::extract_archive,
            commands::archive::list_archive_entries,
            commands::archive::pause_operation,
            commands::archive::resume_operation,
            commands::archive::cancel_operation,
            commands::utils::format_size,
            commands::watcher::watch_path,
            commands::watcher::unwatch_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
