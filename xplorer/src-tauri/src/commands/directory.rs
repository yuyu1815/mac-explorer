//! ディレクトリおよびアーカイブ内部のコンテンツ一覧取得を行うコマンド。
//!
//! 通常の物理的なファイルシステムパスに加えて、アーカイブファイル内部を
//! 仮想的なディレクトリとして扱うためのパス分割・探索ロジックを含みます。

use std::fs;
use std::os::darwin::fs::MetadataExt as DarwinMetadataExt;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use super::archive::{is_archive_file, list_archive_entries};
use super::icons::get_icon_binary;
use super::types::FileEntry;
use super::utils::{format_size, format_timestamp};

/// エントリのアイコンIDを取得します。
///
/// ディレクトリ、.appバンドル、および拡張子に応じたIDを生成します。
/// エントリのアイコンIDを取得します。
fn get_entry_icon_id(is_dir: bool, path_str: &str, extension: Option<String>) -> String {
    if is_dir {
        return if path_str.ends_with(".app") {
            format!("app:{}", path_str)
        } else {
            "dir".to_string()
        };
    }
    format!("ext:{}", extension.unwrap_or_default())
}

/// パス文字列を「物理的なアーカイブファイルパス」と「その内部の相対パス」に分割します。
///
/// 例えば `/path/to/archive.zip/inner/folder` を
/// `(/path/to/archive.zip, inner/folder)` に分割します。
pub fn split_archive_path(path: &str) -> Option<(String, String)> {
    PathBuf::from(path)
        .ancestors()
        .find(|p| p.is_file() && is_archive_file(&p.to_string_lossy()))
        .map(|p| {
            let p_str = p.to_string_lossy();
            (
                p_str.to_string(),
                path.strip_prefix(p_str.as_ref())
                    .unwrap_or("")
                    .trim_start_matches('/')
                    .to_string(),
            )
        })
}

/// アーカイブ内の特定階層にあるファイル・ディレクトリ一覧を `FileEntry` 形式で取得します。
///
/// アーカイブ全体のエントリをフラットに取得した後、共通の接頭辞（パス）を持つものにフィルタリングし、
/// かつ現在の階層直下に見える要素のみを抽出します。
pub async fn list_archive_internal(
    archive_path: &str,
    inner_path: &str,
) -> Result<Vec<FileEntry>, String> {
    let entries = list_archive_entries(archive_path.to_string()).await?;
    let mut seen_dirs = std::collections::HashSet::with_capacity(64);
    let prefix = if inner_path.is_empty() {
        String::new()
    } else {
        format!("{}/", inner_path)
    };

    let results = entries
        .into_iter()
        .filter_map(|entry| {
            let entry_path = entry.path.trim_start_matches('/');
            if !prefix.is_empty() && !entry_path.starts_with(&prefix) {
                return None;
            }

            let relative = entry_path.strip_prefix(&prefix).unwrap_or(entry_path);
            if relative.is_empty() {
                return None;
            }

            let name = relative.split('/').next()?;
            if name.is_empty() {
                return None;
            }

            let is_dir = relative.contains('/') || entry.is_directory;
            if is_dir && !seen_dirs.insert(name.to_string()) {
                return None;
            }

            let full_virtual_path = format!(
                "{}/{}",
                archive_path,
                if inner_path.is_empty() {
                    name.to_string()
                } else {
                    format!("{}/{}", inner_path, name)
                }
            );
            let ext = Path::new(name)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase());

            Some(FileEntry {
                name: name.to_string(),
                path: full_virtual_path,
                is_dir,
                size: if is_dir { 0 } else { entry.size },
                size_formatted: if is_dir {
                    String::new()
                } else {
                    format_size(entry.size)
                },
                modified: entry.modified,
                modified_formatted: format_timestamp(entry.modified),
                created: 0,
                created_formatted: String::new(),
                file_type: if is_dir {
                    "folder".to_string()
                } else {
                    ext.clone().unwrap_or_default()
                },
                is_hidden: name.starts_with('.'),
                is_symlink: false,
                is_archive: false, // アーカイブ内部のエントリはアーカイブではない
                permissions: if is_dir {
                    "755".to_string()
                } else {
                    "644".to_string()
                },
                icon_id: if is_dir {
                    "dir".to_string()
                } else {
                    get_entry_icon_id(false, &entry.path, ext)
                },
                is_noaccess: false, // アーカイブ内部のエントリは常にアクセス可能
            })
        })
        .collect();

    Ok(results)
}

/// 指定されたディレクトリ（またはアーカイブ内のディレクトリ）の生のエントリ一覧を取得します。
///
/// 物理パスと仮想パス（アーカイブ内パス）の両方を自動的に判定して処理します。
#[tauri::command]
pub async fn list_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    // アーカイブ内のパスであれば内部リストアを返す
    if let Some((archive_path, inner_path)) = split_archive_path(&path) {
        if !Path::new(&path).is_dir() {
            return list_archive_internal(&archive_path, &inner_path).await;
        }
    }

    Ok(fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let has_hidden_flag = DarwinMetadataExt::st_flags(&meta) & 0x8000 != 0;
            if !show_hidden && (name.starts_with('.') || has_hidden_flag) {
                return None;
            }
            let path_buf = entry.path();
            let path_str = path_buf.to_string_lossy().into_owned();
            let is_dir = meta.is_dir();
            let ext = path_buf
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase());
            let mtime = meta
                .modified()
                .unwrap_or(UNIX_EPOCH)
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            let ctime = meta
                .created()
                .unwrap_or(UNIX_EPOCH)
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;

            let is_hidden = has_hidden_flag || name.starts_with('.');

            // ディレクトリの場合、実際にアクセスできるか確認
            let is_noaccess = if is_dir {
                fs::read_dir(&path_buf).is_err()
            } else {
                false
            };

            Some(FileEntry {
                name,
                path: path_str.clone(),
                is_dir,
                size: meta.len(),
                size_formatted: if is_dir {
                    String::new()
                } else {
                    format_size(meta.len())
                },
                modified: mtime,
                modified_formatted: format_timestamp(mtime),
                created: ctime,
                created_formatted: format_timestamp(ctime),
                file_type: if is_dir {
                    "folder".to_string()
                } else {
                    ext.clone().unwrap_or_default()
                },
                is_hidden,
                is_symlink: meta.file_type().is_symlink(),
                is_archive: is_archive_file(&path_str),
                permissions: format!("{:o}", meta.permissions().mode() & 0o777),
                icon_id: get_entry_icon_id(is_dir, &path_str, ext),
                is_noaccess,
            })
        })
        .collect())
}

/// フィルタリング・ソート済みのファイルエントリ一覧を取得します。
///
/// 検索クエリによる絞り込み、指定カラム（名前、日付、サイズ等）でのソートを行います。
/// また、表示パフォーマンス向上のため、.appフォルダのアイコンバイナリを
/// バックグラウンドのスレッドプール（rayon）で並列に先読みします。
#[tauri::command]
pub async fn list_files_sorted(
    path: String,
    show_hidden: bool,
    sort_by: String,
    sort_desc: bool,
    search_query: String,
) -> Result<Vec<FileEntry>, String> {
    let mut entries = list_directory(path, show_hidden).await?;

    // フィルタリング
    if !search_query.is_empty() {
        let query = search_query.to_lowercase();
        entries.retain(|e| e.name.to_lowercase().contains(&query));
    }

    // ソート
    entries.sort_by(|a, b| {
        // ディレクトリを優先（ファイルタイプ順の場合を除く）
        if sort_by != "file_type" && a.is_dir != b.is_dir {
            return if a.is_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }

        let ord = match sort_by.as_str() {
            "name" => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            "modified" => a.modified.cmp(&b.modified),
            "file_type" => a.file_type.to_lowercase().cmp(&b.file_type.to_lowercase()),
            "size" => a.size.cmp(&b.size),
            _ => std::cmp::Ordering::Equal,
        };

        if sort_desc {
            ord.reverse()
        } else {
            ord
        }
    });

    // アイコン（特に対象が .app の場合）を並列でプリウォーム
    prewarm_icons(&entries);

    Ok(entries)
}

/// アイコンのプリウォーム処理
fn prewarm_icons(entries: &[FileEntry]) {
    let app_ids: Vec<String> = entries
        .iter()
        .filter(|e| e.icon_id.starts_with("app:"))
        // 仮想パス（アーカイブ内）は実体がないためスキップ
        .filter(|e| {
            !e.path.contains(".zip/") && !e.path.contains(".7z/") && !e.path.contains(".tar")
        })
        .map(|e| e.icon_id.clone())
        .collect();

    if !app_ids.is_empty() {
        use rayon::prelude::*;
        app_ids.par_iter().for_each(|id| {
            let _ = get_icon_binary(id);
        });
    }
}

/// パス補完候補を返す
#[tauri::command]
pub async fn complete_path(
    dir_path: String,
    prefix: String,
    show_hidden: bool,
) -> Result<Vec<FileEntry>, String> {
    let prefix_lower = prefix.to_lowercase();
    let mut entries = list_directory(dir_path, show_hidden).await?;

    // ディレクトリかつ前方一致するものだけを残す
    entries.retain(|e| e.is_dir && e.name.to_lowercase().starts_with(&prefix_lower));

    // 名前（小文字）でソート
    entries.sort_unstable_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::tempdir;

    /// ディレクトリのアクセス権限チェックのテスト
    /// 注: macOSでは所有者は権限ビットに関係なくアクセス可能
    /// そのため、所有者が作成したディレクトリは常に is_noaccess=false になる
    #[tokio::test]
    async fn test_is_noaccess_owner_always_accessible() {
        let dir = tempdir().expect("Failed to create temp dir");
        let base_path = dir.path().to_string_lossy().to_string();

        // 所有者として実行権限あり (rwx------)
        let owner_exec = dir.path().join("owner_exec");
        fs::create_dir(&owner_exec).expect("Failed to create dir");
        fs::set_permissions(&owner_exec, fs::Permissions::from_mode(0o700)).ok();

        // 所有者として実行権限なし (rw-------)
        // macOSでは所有者は権限ビットに関係なくアクセス可能
        let owner_no_exec = dir.path().join("owner_no_exec");
        fs::create_dir(&owner_no_exec).expect("Failed to create dir");
        fs::set_permissions(&owner_no_exec, fs::Permissions::from_mode(0o600)).ok();

        // 通常ファイル (実行ビットなしでも読める)
        let regular_file = dir.path().join("regular.txt");
        fs::write(&regular_file, "test").expect("Failed to create file");

        // list_directoryを実行
        let entries = list_directory(base_path, true).await.expect("Failed to list directory");

        // macOSでは所有者は常にアクセス可能
        let exec_entry = entries.iter().find(|e| e.name == "owner_exec").expect("exec dir not found");
        assert!(!exec_entry.is_noaccess, "owner_exec should have is_noaccess=false");

        // macOSでは所有者は権限ビットに関係なくアクセス可能
        let no_exec_entry = entries.iter().find(|e| e.name == "owner_no_exec").expect("no_exec dir not found");
        assert!(!no_exec_entry.is_noaccess, "owner_no_exec should have is_noaccess=false on macOS (owner always has access)");

        // ファイルは常にis_noaccess=false
        let file_entry = entries.iter().find(|e| e.name == "regular.txt").expect("regular file not found");
        assert!(!file_entry.is_noaccess, "regular file should have is_noaccess=false");
    }

    /// シンボリックリンクのテスト
    /// 注: macOSでは所有者は権限ビットに関係なくアクセス可能
    #[tokio::test]
    async fn test_symlink_is_noaccess() {
        let dir = tempdir().expect("Failed to create temp dir");
        let base_path = dir.path().to_string_lossy().to_string();

        // ディレクトリを作成（権限設定）
        let target_dir = dir.path().join("target_dir");
        fs::create_dir(&target_dir).expect("Failed to create dir");
        fs::set_permissions(&target_dir, fs::Permissions::from_mode(0o600)).ok();

        // そのディレクトリへのシンボリックリンクを作成
        let symlink_path = dir.path().join("symlink_to_target");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target_dir, &symlink_path).expect("Failed to create symlink");

        let entries = list_directory(base_path, true).await.expect("Failed to list directory");

        // シンボリックリンク自体はアクセス可能（リンク先の権限とは無関係）
        let symlink_entry = entries.iter().find(|e| e.name == "symlink_to_target").expect("symlink not found");
        assert!(!symlink_entry.is_noaccess, "symlink itself should have is_noaccess=false");
        assert!(symlink_entry.is_symlink, "symlink should have is_symlink=true");

        // ターゲットディレクトリはmacOSでは所有者なのでアクセス可能
        let target_entry = entries.iter().find(|e| e.name == "target_dir").expect("target not found");
        assert!(!target_entry.is_noaccess, "target dir should have is_noaccess=false on macOS (owner always has access)");
    }

    /// システムディレクトリのアクセス権限テスト
    /// root所有のディレクトリで現在のユーザーがアクセスできないケースをテスト
    #[tokio::test]
    async fn test_system_noaccess_directory() {
        // /private/var/agentx は root 所有で drwx------ (700)
        // 現在のユーザーが root でなければアクセス不可
        let entries = list_directory("/private/var".to_string(), true).await;

        if let Ok(entries) = entries {
            if let Some(agentx_entry) = entries.iter().find(|e| e.name == "agentx") {
                // root以外のユーザーならアクセス不可のはず
                let can_access = fs::read_dir("/private/var/agentx").is_ok();
                assert_eq!(
                    agentx_entry.is_noaccess, !can_access,
                    "agentx is_noaccess should match actual accessibility"
                );
            }
        }
    }

    /// /var/root ディレクトリのテスト
    #[tokio::test]
    async fn test_var_root_noaccess() {
        // /var/root は root のホームディレクトリ
        let entries = list_directory("/var".to_string(), true).await;

        if let Ok(entries) = entries {
            if let Some(root_entry) = entries.iter().find(|e| e.name == "root") {
                let can_access = fs::read_dir("/var/root").is_ok();
                assert_eq!(
                    root_entry.is_noaccess, !can_access,
                    "root dir is_noaccess should match actual accessibility"
                );
            }
        }
    }
}
