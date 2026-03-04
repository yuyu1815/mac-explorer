// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
