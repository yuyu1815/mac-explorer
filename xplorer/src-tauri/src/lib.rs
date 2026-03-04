#![allow(unexpected_cfgs)]
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            // アイコンキャッシュの初期化
            if let Ok(cache_dir) = app.path().app_cache_dir() {
                let icon_cache_dir = cache_dir.join("icons");
                commands::filesystem::init_icon_cache(icon_cache_dir);
            }

            // /Applications のアイコンをバックグラウンドで先読み
            std::thread::spawn(|| {
                if let Ok(entries) = std::fs::read_dir("/Applications") {
                    let app_ids: Vec<String> = entries.flatten()
                        .filter(|e| e.path().extension().map_or(false, |ext| ext == "app"))
                        .map(|e| format!("app:{}", e.path().display()))
                        .collect();

                    use rayon::prelude::*;
                    app_ids.par_iter().for_each(|id| {
                        let _ = commands::filesystem::get_icon_binary(id);
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

            // IDからバイナリを取得（PNG or TIFF）
            if let Some(data) = commands::filesystem::get_icon_binary(&icon_id[1..]) {
                // PNG先頭マジックバイトで Content-Type を判定
                let content_type = if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
                    "image/png"
                } else {
                    "image/tiff"
                };
                tauri::http::Response::builder()
                    .header("Content-Type", content_type)
                    .header("Cache-Control", "public, max-age=300")
                    .body(data)
                    .unwrap()
            } else {
                tauri::http::Response::builder().status(404).body(Vec::new()).unwrap()
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::filesystem::list_directory,
            commands::filesystem::list_files_sorted,
            commands::filesystem::open_file_default,
            commands::filesystem::show_properties,
            commands::filesystem::get_detailed_properties,
            commands::filesystem::create_directory,
            commands::filesystem::copy_files,
            commands::filesystem::move_files,
            commands::filesystem::delete_files,
            commands::filesystem::rename_file,
            commands::filesystem::create_file,
            commands::filesystem::get_home_dir,
            commands::filesystem::list_volumes,
            commands::filesystem::get_parent_path,
            commands::filesystem::complete_path,
            commands::filesystem::open_terminal_at,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
