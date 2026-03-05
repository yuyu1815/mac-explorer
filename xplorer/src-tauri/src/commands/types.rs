use serde::Serialize;

/// ファイル一覧のエントリ
#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub size_formatted: String,
    pub modified: i64,
    pub modified_formatted: String,
    pub created: i64,
    pub created_formatted: String,
    pub file_type: String,
    pub is_hidden: bool,
    pub is_symlink: bool,
    pub permissions: String,
    pub icon_id: String,
}

/// プロパティ進捗（ストリーミング用）
#[derive(Serialize, Clone)]
pub struct PropertyProgress {
    pub size_bytes: u64,
    pub size_formatted: String,
    pub size_on_disk_bytes: u64,
    pub size_on_disk_formatted: String,
    pub contains_files: u32,
    pub contains_folders: u32,
    pub complete: bool,
}

/// 詳細プロパティ
#[derive(Serialize)]
pub struct DetailedProperties {
    pub name: String,
    pub path: String,
    pub file_type: String,
    pub location: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub size_on_disk_bytes: u64,
    pub size_on_disk_formatted: String,
    pub contains_files: u32,
    pub contains_folders: u32,
    pub created_formatted: String,
    pub modified_formatted: String,
    pub accessed_formatted: String,
    pub is_readonly: bool,
    pub is_hidden: bool,
}

/// ボリューム情報
#[derive(Serialize)]
pub struct VolumeInfo {
    pub name: String,
    pub path: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub total_bytes_formatted: String,
    pub free_bytes_formatted: String,
}
