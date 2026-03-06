use std::fs;

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    let normalized = path.replace('\\', "/");
    fs::create_dir_all(&normalized).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    let normalized = path.replace('\\', "/");
    fs::File::create(&normalized).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn copy_files(sources: Vec<String>, dest: String) -> Result<(), String> {
    let dest_normalized = dest.replace('\\', "/");
    for src in sources {
        let src_normalized = src.replace('\\', "/");
        let src_path = std::path::Path::new(&src_normalized);
        if !src_path.exists() {
            continue;
        }
        let file_name = src_path.file_name().ok_or("Invalid file name")?;
        let dest_path = std::path::Path::new(&dest_normalized).join(file_name);

        // 単純化のため、ディレクトリの再帰的コピーはPhase2の要件として一旦除外（またはここではファイルのみをサポート
        if src_path.is_file() {
            fs::copy(&src, &dest_path).map_err(|e| format!("Failed to copy {}: {}", src, e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn move_files(sources: Vec<String>, dest: String) -> Result<(), String> {
    let dest_normalized = dest.replace('\\', "/");
    for src in sources {
        let src_normalized = src.replace('\\', "/");
        let src_path = std::path::Path::new(&src_normalized);
        if !src_path.exists() {
            continue;
        }
        let file_name = src_path.file_name().ok_or("Invalid file name")?;
        let dest_path = std::path::Path::new(&dest_normalized).join(file_name);

        fs::rename(&src, &dest_path).map_err(|e| format!("Failed to move {}: {}", src, e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_files(paths: Vec<String>, to_trash: bool) -> Result<(), String> {
    if to_trash {
        let normalized_paths: Vec<String> = paths.iter().map(|p| p.replace('\\', "/")).collect();
        trash::delete_all(&normalized_paths).map_err(|e| format!("Failed to move to trash: {}", e))?;
    } else {
        for path in paths {
            let normalized = path.replace('\\', "/");
            let p = std::path::Path::new(&normalized);
            if !p.exists() {
                continue;
            }
            if p.is_dir() {
                fs::remove_dir_all(&path)
                    .map_err(|e| format!("Failed to delete dir {}: {}", path, e))?;
            } else {
                fs::remove_file(&path)
                    .map_err(|e| format!("Failed to delete file {}: {}", path, e))?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let normalized = path.replace('\\', "/");
    let p = std::path::Path::new(&normalized);
    let parent = p.parent().ok_or("No parent directory")?;
    let new_path = parent.join(new_name);
    fs::rename(&normalized, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_exists(path: String) -> Result<bool, String> {
    let normalized = path.replace('\\', "/");
    Ok(std::path::Path::new(&normalized).exists())
}
