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
            let decoded_path = percent_encoding::percent_decode_str(path).decode_utf8_lossy();
            
            // ルーティング
            let icon_id = if decoded_path.starts_with("/localhost/") {
                &decoded_path["/localhost/".len() - 1..]
            } else {
                &decoded_path
            };

            // IDからバイナリ(TIFF)を直接取得
            if let Some(data) = commands::filesystem::get_icon_binary(&icon_id[1..]) {
                tauri::http::Response::builder()
                    .header("Content-Type", "image/tiff")
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
