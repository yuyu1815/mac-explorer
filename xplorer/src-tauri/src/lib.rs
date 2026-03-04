#![allow(unexpected_cfgs)]
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .register_uri_scheme_protocol("icon", |_app, request| {
            let path = request.uri().path();
            // URLデコード
            let decoded_path = percent_encoding::percent_decode_str(path).decode_utf8_lossy();
            
            // ルーティング: /extension/[ext] または /[full_path]
            let icon_data = if decoded_path.starts_with("/extension/") {
                let ext = &decoded_path["/extension/".len()..];
                commands::filesystem::get_icon_by_extension(ext)
            } else {
                // パスから直接取得（/localhost/path... の localhost 部分を除去）
                let clean_path = if decoded_path.starts_with("/localhost/") {
                    &decoded_path["/localhost/".len() - 1..] // 先頭のスラッシュを残す
                } else {
                    &decoded_path
                };
                commands::filesystem::get_file_icon_raw(clean_path)
            };

            if let Some(data) = icon_data {
                tauri::http::Response::builder()
                    .header("Content-Type", "image/png")
                    .header("Cache-Control", "public, max-age=300") // 5分間キャッシュ
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
