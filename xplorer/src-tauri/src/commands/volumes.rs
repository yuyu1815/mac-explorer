//! システムにマウントされているボリューム（ディスク）の一覧を取得するモジュール。
//!
//! `getfsstat` システムコールを使用して、すべてのマウント済みファイルシステムを列挙します。
//! ローカルボリュームおよびNFS/SMB等のネットワークボリュームを含みます。
//! Google DriveやiCloud Drive等のクラウドストレージも検出します。

use std::ffi::CString;
use std::mem::MaybeUninit;
use std::os::raw::c_char;

use super::types::{DiskProperties, VolumeInfo};
use super::utils::format_size;

mod mount_utils {
    use super::*;

    /// MNT_NETWORK flag from sys/mount.h
    pub const MNT_NETWORK: u32 = 0x00001000;

    /// File system types to exclude from the volume list
    pub const FILTERED_FS_TYPES: &[&str] = &[
        "devfs",
        "procfs",
        "autofs",
        "tmpfs",
        "fdeswapfs",
        "filecoordfs",
        "com.apple.filesystems.userfs",
        "mtmfs",
        "durofs",
    ];

    /// Path prefixes to exclude
    pub const FILTERED_PATH_PREFIXES: &[&str] = &["/System/Volumes/", "/dev/"];

    /// Check if a mount point should be included in the volume list
    pub fn should_include_mount(mount_on: &str, fs_type: &str, flags: u32) -> bool {
        // Exclude specific file system types
        if FILTERED_FS_TYPES.iter().any(|&t| t.eq_ignore_ascii_case(fs_type)) {
            return false;
        }

        // Exclude specific path prefixes
        if FILTERED_PATH_PREFIXES
            .iter()
            .any(|&p| mount_on.starts_with(p))
        {
            return false;
        }

        // Always include network mounts
        if (flags & MNT_NETWORK) != 0 {
            return true;
        }

        // Include local mounts that are actual volumes
        true
    }

    /// Convert C string to Rust String, handling invalid UTF-8
    pub fn cstr_to_string(c_str: &[c_char]) -> String {
        let bytes: Vec<u8> = c_str
            .iter()
            .take_while(|&&c| c != 0)
            .map(|&c| c as u8)
            .collect();
        String::from_utf8_lossy(&bytes).into_owned()
    }

    /// Format network volume display name from mount_from field
    /// Examples:
    ///   "OrbStack:/OrbStack" -> "nfs://OrbStack/"
    ///   "//server/share" -> "smb://server/share"
    pub fn format_network_name(mount_from: &str, fs_type: &str) -> String {
        match fs_type.to_lowercase().as_str() {
            "nfs" => {
                // "host:path" format -> "nfs://host/"
                let parts: Vec<&str> = mount_from.split(':').collect();
                if !parts.is_empty() {
                    format!("nfs://{}/", parts[0])
                } else {
                    mount_from.to_string()
                }
            }
            "smbfs" | "cifs" => {
                // SMB paths may start with "//" or "\\"
                let clean_path = mount_from.replace('\\', "/");
                if clean_path.starts_with("//") {
                    format!("smb:{}", clean_path)
                } else {
                    format!("smb://{}", clean_path)
                }
            }
            "webdav" | "webdavfs" | "webdavfs2" => {
                format!("http://{}", mount_from.trim_start_matches('/'))
            }
            "nfs_v4" => {
                let parts: Vec<&str> = mount_from.split(':').collect();
                if !parts.is_empty() {
                    format!("nfs4://{}/", parts[0])
                } else {
                    mount_from.to_string()
                }
            }
            _ => mount_from.to_string(),
        }
    }

    /// Get all mounted file systems using getfsstat
    pub fn get_all_mounts() -> Result<Vec<MountInfo>, String> {
        // Phase 1: Get the count of mounted file systems
        let count = unsafe { libc::getfsstat(std::ptr::null_mut(), 0, libc::MNT_NOWAIT) };
        if count < 0 {
            return Err("Failed to get mount count".to_string());
        }
        let count = count as usize;

        if count == 0 {
            return Ok(Vec::new());
        }

        // Phase 2: Allocate buffer and retrieve actual data
        let mut mounts: Vec<libc::statfs> = vec![unsafe { std::mem::zeroed() }; count];
        let buf_size = (count * std::mem::size_of::<libc::statfs>()) as i32;

        let actual = unsafe {
            libc::getfsstat(
                mounts.as_mut_ptr(),
                buf_size,
                libc::MNT_NOWAIT,
            )
        };

        if actual < 0 {
            return Err("Failed to get mount information".to_string());
        }

        let actual = actual as usize;
        mounts.truncate(actual);

        let result: Vec<MountInfo> = mounts
            .into_iter()
            .map(|m| MountInfo::from_statfs(m))
            .collect();

        Ok(result)
    }

    /// Information about a single mount point
    pub struct MountInfo {
        pub mount_on: String,
        pub mount_from: String,
        pub fs_type: String,
        pub is_network: bool,
        pub flags: u32,
    }

    impl MountInfo {
        fn from_statfs(stat: libc::statfs) -> Self {
            let mount_on = cstr_to_string(&stat.f_mntonname);
            let mount_from = cstr_to_string(&stat.f_mntfromname);
            let fs_type = cstr_to_string(&stat.f_fstypename);
            let flags = stat.f_flags;

            Self {
                mount_on,
                mount_from,
                fs_type,
                is_network: (flags & MNT_NETWORK) != 0,
                flags,
            }
        }
    }
}

mod cloud_utils {
    use std::fs;
    use std::path::PathBuf;

    #[derive(Clone, Copy)]
    pub enum CloudProvider {
        GoogleDrive,
        ICloudDrive,
    }

    impl CloudProvider {
        pub fn name(&self) -> &'static str {
            match self {
                CloudProvider::GoogleDrive => "Google Drive",
                CloudProvider::ICloudDrive => "iCloud Drive",
            }
        }

        pub fn detect_paths(&self) -> Vec<PathBuf> {
            let home = std::env::var("HOME").unwrap_or_default();
            let home_path = PathBuf::from(home);

            match self {
                CloudProvider::GoogleDrive => {
                    let base = home_path.join("Library/CloudStorage");
                    fs::read_dir(base.as_path())
                        .ok()
                        .into_iter()
                        .flatten()
                        .filter_map(|e| e.ok())
                        .filter(|e| e.file_name().to_string_lossy().starts_with("GoogleDrive-"))
                        .map(|e| e.path())
                        .collect()
                }
                CloudProvider::ICloudDrive => {
                    let path = home_path.join("Library/Mobile Documents/com~apple~CloudDocs");
                    if path.exists() { vec![path] } else { vec![] }
                }
            }
        }
    }

    pub fn get_cloud_drives() -> Vec<(PathBuf, CloudProvider)> {
        [CloudProvider::GoogleDrive, CloudProvider::ICloudDrive]
            .iter()
            .flat_map(|p| p.detect_paths().into_iter().map(move |path| (path, *p)))
            .collect()
    }
}

#[tauri::command]
pub async fn list_volumes() -> Result<Vec<VolumeInfo>, String> {
    use mount_utils::*;

    let mounts = get_all_mounts()?;
    let cloud_drives = cloud_utils::get_cloud_drives();

    let mut volumes: Vec<VolumeInfo> = Vec::new();
    let mut root_volume: Option<VolumeInfo> = None;
    let mut cloud_volumes: Vec<VolumeInfo> = Vec::new();

    for mount in mounts {
        if !should_include_mount(&mount.mount_on, &mount.fs_type, mount.flags) {
            continue;
        }

        let (total, free) = get_statvfs_info(&mount.mount_on);

        // Determine display name
        let name = if mount.mount_on == "/" {
            "Macintosh HD".to_string()
        } else if mount.is_network {
            // For network volumes, use formatted network name
            format_network_name(&mount.mount_from, &mount.fs_type)
        } else {
            // Extract last component of path
            std::path::Path::new(&mount.mount_on)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| mount.mount_on.clone())
        };

        let volume = VolumeInfo {
            name,
            path: mount.mount_on.clone(),
            total_bytes: total,
            free_bytes: free,
            total_bytes_formatted: format_size(total),
            free_bytes_formatted: format_size(free),
            is_network: mount.is_network,
            file_system: mount.fs_type.to_uppercase(),
            is_cloud: false,
            cloud_provider: String::new(),
        };

        if mount.mount_on == "/" {
            root_volume = Some(volume);
        } else {
            volumes.push(volume);
        }
    }

    // Process cloud drives
    for (path, provider) in cloud_drives {
        let path_str = path.to_string_lossy().to_string();
        let (total, free) = get_statvfs_info(&path_str);

        cloud_volumes.push(VolumeInfo {
            name: provider.name().to_string(),
            path: path_str,
            total_bytes: total,
            free_bytes: free,
            total_bytes_formatted: format_size(total),
            free_bytes_formatted: format_size(free),
            is_network: false,
            file_system: "CloudStorage".into(),
            is_cloud: true,
            cloud_provider: provider.name().to_string(),
        });
    }

    // Sort local volumes alphabetically
    volumes.sort_by(|a, b| {
        match (a.is_network, b.is_network) {
            (false, true) => std::cmp::Ordering::Less,
            (true, false) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    // Sort cloud volumes alphabetically
    cloud_volumes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    // Insert cloud volumes between local and network volumes
    let network_start = volumes.iter().position(|v| v.is_network);
    match network_start {
        Some(idx) => {
            for (i, cv) in cloud_volumes.into_iter().enumerate() {
                volumes.insert(idx + i, cv);
            }
        }
        None => {
            volumes.extend(cloud_volumes);
        }
    }

    // Insert root volume at the beginning
    if let Some(root) = root_volume {
        volumes.insert(0, root);
    }

    Ok(volumes)
}

fn get_statvfs_info(path: &str) -> (u64, u64) {
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

#[tauri::command]
pub async fn get_disk_properties(path: String) -> Result<DiskProperties, String> {
    let c_path = CString::new(path.clone()).unwrap_or_default();

    // First check if this is a network volume using getfsstat
    let is_network = is_network_volume(&path);

    unsafe {
        let mut stat = MaybeUninit::<libc::statvfs>::uninit();
        if libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) == 0 {
            let stat = stat.assume_init();
            let total = u64::from(stat.f_blocks) * stat.f_frsize;
            let free = u64::from(stat.f_bavail) * stat.f_frsize;
            let used = total.saturating_sub(free);

            let mut sfs = MaybeUninit::<libc::statfs>::uninit();
            let fs_type = if libc::statfs(c_path.as_ptr(), sfs.as_mut_ptr()) == 0 {
                let sfs = sfs.assume_init();
                let bytes = std::slice::from_raw_parts(sfs.f_fstypename.as_ptr() as *const u8, 16);
                let name = std::str::from_utf8(bytes)
                    .unwrap_or("Unknown")
                    .trim_matches(char::from(0));
                name.to_uppercase()
            } else {
                "APFS".to_string()
            };

            let name = if path == "/" {
                "Macintosh HD".to_string()
            } else {
                std::path::Path::new(&path)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| path.clone())
            };

            Ok(DiskProperties {
                name,
                path,
                file_system: fs_type,
                total_bytes: total,
                free_bytes: free,
                used_bytes: used,
                total_bytes_formatted: format_size(total),
                free_bytes_formatted: format_size(free),
                used_bytes_formatted: format_size(used),
                is_network,
            })
        } else {
            Err("Failed to get disk properties".to_string())
        }
    }
}

/// Check if the given path is a network volume
fn is_network_volume(path: &str) -> bool {
    use mount_utils::*;

    if let Ok(mounts) = get_all_mounts() {
        for mount in mounts {
            if mount.mount_on == path {
                return mount.is_network;
            }
        }
    }
    false
}
