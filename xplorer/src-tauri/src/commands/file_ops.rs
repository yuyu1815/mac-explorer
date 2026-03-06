//! ファイルおよびディレクトリの基本操作（新規作成、コピー、移動、削除、リネーム）を提供するコマンド。
//! 
//! macOS固有のゴミ箱（Trash）機能の統合や、バッチリネーム機能を含みます。

use std::fs;

/// 新しいディレクトリを作成します。親ディレクトリが存在しない場合は再帰的に作成します。
#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    fs::File::create(&path)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// 指定された複数のファイルを宛先ディレクトリにコピーします。
/// 
/// 現状ではファイルのみをサポートしており、ディレクトリの再帰的コピーは未実装です。
#[tauri::command]
pub async fn copy_files(sources: Vec<String>, dest: String) -> Result<(), String> {
    for src in sources.iter().filter(|s| std::path::Path::new(s).exists()) {
        let path = std::path::Path::new(src);
        if path.is_file() {
            let dest_path = std::path::Path::new(&dest).join(path.file_name().unwrap());
            fs::copy(src, dest_path).map_err(|e| format!("Failed to copy {}: {}", src, e))?;
        }
    }
    Ok(())
}

/// 指定された複数のファイルを宛先ディレクトリに移動します。
/// 
/// `std::fs::rename` を使用しており、同一ファイルシステム内の移動はアトミックに行われます。
#[tauri::command]
pub async fn move_files(sources: Vec<String>, dest: String) -> Result<(), String> {
    for src in sources.iter().filter(|s| std::path::Path::new(s).exists()) {
        let path = std::path::Path::new(src);
        let dest_path = std::path::Path::new(&dest).join(path.file_name().unwrap());
        fs::rename(src, dest_path).map_err(|e| format!("Failed to move {}: {}", src, e))?;
    }
    Ok(())
}

/// 指定されたファイルを削除、またはゴミ箱へ移動します。
/// 
/// `to_trash` が真の場合は `trash` クレートを使用して安全にゴミ箱へ送ります。
/// 偽の場合はファイルシステムから物理的に削除（復旧不能）します。
#[tauri::command]
pub async fn delete_files(paths: Vec<String>, to_trash: bool) -> Result<(), String> {
    if to_trash {
        return trash::delete_all(&paths).map_err(|e| format!("Failed to move to trash: {}", e));
    }
    for path in paths.iter().filter(|p| std::path::Path::new(p).exists()) {
        let p = std::path::Path::new(path);
        if p.is_dir() { fs::remove_dir_all(path).map_err(|e| format!("Failed to delete dir {}: {}", path, e))?; }
        else { fs::remove_file(path).map_err(|e| format!("Failed to delete file {}: {}", path, e))?; }
    }
    Ok(())
}

#[tauri::command]
pub async fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let new_path = p.parent().ok_or("No parent directory")?.join(new_name);
    fs::rename(&path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_rename(paths: Vec<String>, new_names: Vec<String>) -> Result<(), String> {
    if paths.len() != new_names.len() { return Err("Path and name counts do not match".to_string()); }
    for (path, new_name) in paths.into_iter().zip(new_names.into_iter()) {
        let new_path = std::path::Path::new(&path).parent().ok_or("No parent directory")?.join(new_name);
        fs::rename(&path, &new_path).map_err(|e| format!("Failed to rename {}: {}", path, e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn check_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}
