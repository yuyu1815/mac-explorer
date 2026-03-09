//! システムにマウントされているボリューム（ディスク）の一覧を取得するモジュール。
//!
//! Macintosh HD（ルート）および `/Volumes` 直下の外部ドライブをスキャンし、
//! `statvfs` を使用して空き容量や合計サイズを取得します。

use std::fs;

use super::types::VolumeInfo;
use super::utils::format_size;

#[tauri::command]
pub async fn list_volumes() -> Result<Vec<VolumeInfo>, String> {
    let root_fs_id = get_fs_id("/");

    let mut volumes: Vec<VolumeInfo> = fs::read_dir("/Volumes")
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| {
                    if let Some(root_id) = root_fs_id {
                        let path = entry.path();
                        if let Some(vol_id) = get_fs_id(path.to_str().unwrap_or_default()) {
                            return vol_id != root_id;
                        }
                    }
                    true
                })
                .map(|entry| {
                    let path = entry.path().to_string_lossy().into_owned();
                    let (total, free) = get_statvfs_info(&path);
                    VolumeInfo {
                        name: entry.file_name().to_string_lossy().into_owned(),
                        path: path.clone(),
                        total_bytes: total,
                        free_bytes: free,
                        total_bytes_formatted: format_size(total),
                        free_bytes_formatted: format_size(free),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

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

fn get_fs_id(path: &str) -> Option<u64> {
    use std::ffi::CString;
    use std::mem::MaybeUninit;
    let c_path = CString::new(path).unwrap_or_default();
    unsafe {
        let mut stat = MaybeUninit::<libc::statvfs>::uninit();
        if libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) == 0 {
            let stat = stat.assume_init();
            Some(stat.f_fsid)
        } else {
            None
        }
    }
}
