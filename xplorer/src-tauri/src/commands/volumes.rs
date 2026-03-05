use std::fs;

use super::types::VolumeInfo;
use super::utils::format_size;

#[tauri::command]
pub async fn list_volumes() -> Result<Vec<VolumeInfo>, String> {
    let mut volumes = Vec::new();

    if let Ok(entries) = fs::read_dir("/Volumes") {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let path_str = path.to_string_lossy().into_owned();

            let (total, free) = get_statvfs_info(&path_str);
            volumes.push(VolumeInfo {
                name,
                path: path_str,
                total_bytes: total,
                free_bytes: free,
                total_bytes_formatted: format_size(total),
                free_bytes_formatted: format_size(free),
            });
        }
    }
    let (total, free) = get_statvfs_info("/");
    volumes.insert(
        0,
        VolumeInfo {
            name: "Macintosh HD".to_string(),
            path: "/".to_string(),
            total_bytes: total,
            free_bytes: free,
            total_bytes_formatted: format_size(total),
            free_bytes_formatted: format_size(free),
        },
    );

    Ok(volumes)
}

fn get_statvfs_info(path: &str) -> (u64, u64) {
    use std::ffi::CString;
    use std::mem::MaybeUninit;
    let c_path = CString::new(path).unwrap_or_default();
    unsafe {
        let mut stat = MaybeUninit::<libc::statvfs>::uninit();
        if libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) == 0 {
            let stat = stat.assume_init();
            let total = u64::from(stat.f_blocks) * stat.f_frsize;
            let free = u64::from(stat.f_bavail) * stat.f_frsize;
            (total, free)
        } else {
            (0, 0)
        }
    }
}
