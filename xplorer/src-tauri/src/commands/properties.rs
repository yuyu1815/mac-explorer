//! ファイルやディレクトリの詳細なプロパティ（メタデータ）を取得するモジュール。
//!
//! 基本情報（名前、パス、種類）に加えて、macOSのFinder風の情報ウィンドウ表示や、
//! フォルダサイズの再帰的な計算（ストリーミング含む）をサポートします。

use std::os::unix::fs::PermissionsExt;
use std::time::UNIX_EPOCH;

use serde::Serialize;

use super::types::DetailedProperties;
use super::types::PropertyProgress;
use super::utils::{format_size, format_timestamp};

/// アプリケーション情報
#[derive(Serialize, Clone)]
pub struct ApplicationInfo {
    pub name: String,
    pub path: String,
    pub icon_id: String,
    pub bundle_identifier: String,
}

/// ファイルを開くデフォルトアプリケーションの情報を取得
/// 戻り値: (アプリ名, アイコンID)
#[cfg(target_os = "macos")]
fn get_default_application(path: &str) -> Option<(String, String)> {
    use cocoa::base::{id as cocoa_id, nil};
    use cocoa::foundation::NSString;
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CStr;
    use std::path::Path;

    // ディレクトリの場合は取得しない
    if Path::new(path).is_dir() {
        return None;
    }

    unsafe {
        let pool: cocoa_id = msg_send![objc::class!(NSAutoreleasePool), new];

        // NSURL.fileURLWithPath:
        let ns_path = NSString::alloc(nil).init_str(path);
        let url: cocoa_id = msg_send![objc::class!(NSURL), fileURLWithPath: ns_path];

        // NSWorkspace.sharedWorkspace
        let workspace: cocoa_id = msg_send![objc::class!(NSWorkspace), sharedWorkspace];

        // [workspace URLForApplicationToOpenURL:url]
        let app_url: cocoa_id = msg_send![workspace, URLForApplicationToOpenURL: url];

        let result = if app_url == nil {
            None
        } else {
            // [app_url path]
            let app_path: cocoa_id = msg_send![app_url, path];
            let bytes: *const i8 = msg_send![app_path, UTF8String];
            let app_path_str = CStr::from_ptr(bytes).to_str().ok()?;

            // アプリ名を抽出（例: /Applications/Visual Studio Code.app -> Visual Studio Code）
            let app_name = Path::new(app_path_str)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())?;

            // アイコンIDを生成 (app:プレフィックス + アプリケーションパス)
            let icon_id = format!("app:{}", app_path_str);
            Some((app_name, icon_id))
        };

        let _: () = msg_send![pool, drain];
        result
    }
}

#[cfg(not(target_os = "macos"))]
fn get_default_application(_path: &str) -> Option<(String, String)> {
    None
}

/// ファイルを開けるアプリケーション一覧を取得
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn get_applications_for_file(path: String) -> Result<Vec<ApplicationInfo>, String> {
    use cocoa::base::{id as cocoa_id, nil};
    use cocoa::foundation::{NSArray, NSString};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CStr;
    use std::path::Path;

    if Path::new(&path).is_dir() {
        return Ok(Vec::new());
    }

    unsafe {
        let pool: cocoa_id = msg_send![objc::class!(NSAutoreleasePool), new];

        // NSURL.fileURLWithPath:
        let ns_path = NSString::alloc(nil).init_str(&path);
        let url: cocoa_id = msg_send![objc::class!(NSURL), fileURLWithPath: ns_path];

        // NSWorkspace.sharedWorkspace
        let workspace: cocoa_id = msg_send![objc::class!(NSWorkspace), sharedWorkspace];

        // [workspace URLsForApplicationsToOpenURL:url]
        let app_urls: cocoa_id = msg_send![workspace, URLsForApplicationsToOpenURL: url];

        let mut apps = Vec::new();
        let count = NSArray::count(app_urls);

        for i in 0..count {
            let app_url: cocoa_id = NSArray::objectAtIndex(app_urls, i);
            let app_path: cocoa_id = msg_send![app_url, path];
            let bytes: *const i8 = msg_send![app_path, UTF8String];

            if let Ok(app_path_str) = CStr::from_ptr(bytes).to_str() {
                if let Some(app_name) = Path::new(app_path_str)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string())
                {
                    // Bundle identifierを取得
                    let bundle_id = get_bundle_identifier(app_path_str);

                    apps.push(ApplicationInfo {
                        name: app_name,
                        path: app_path_str.to_string(),
                        icon_id: format!("app:{}", app_path_str),
                        bundle_identifier: bundle_id.unwrap_or_default(),
                    });
                }
            }
        }

        let _: () = msg_send![pool, drain];
        Ok(apps)
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn get_applications_for_file(_path: String) -> Result<Vec<ApplicationInfo>, String> {
    Ok(Vec::new())
}

/// Bundle Identifierを取得
#[cfg(target_os = "macos")]
fn get_bundle_identifier(app_path: &str) -> Option<String> {
    use cocoa::base::{id as cocoa_id, nil};
    use cocoa::foundation::NSString;
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CStr;

    unsafe {
        let ns_path = NSString::alloc(nil).init_str(app_path);
        let bundle: cocoa_id = msg_send![objc::class!(NSBundle), bundleWithPath: ns_path];

        if bundle == nil {
            return None;
        }

        let bundle_id: cocoa_id = msg_send![bundle, bundleIdentifier];
        if bundle_id == nil {
            return None;
        }

        let bytes: *const i8 = msg_send![bundle_id, UTF8String];
        CStr::from_ptr(bytes).to_str().ok().map(|s| s.to_string())
    }
}

/// デフォルトアプリケーションを変更
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn set_default_application(path: String, bundle_identifier: String) -> Result<(), String> {
    use cocoa::base::{id as cocoa_id, nil};
    use cocoa::foundation::NSString;
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;

    unsafe {
        let pool: cocoa_id = msg_send![objc::class!(NSAutoreleasePool), new];

        // ファイルのUTI (Uniform Type Identifier) を取得
        let ns_path = NSString::alloc(nil).init_str(&path);
        let url: cocoa_id = msg_send![objc::class!(NSURL), fileURLWithPath: ns_path];

        let workspace: cocoa_id = msg_send![objc::class!(NSWorkspace), sharedWorkspace];
        let uti: cocoa_id = msg_send![workspace, typeOfFile: url error: std::ptr::null_mut::<objc::runtime::Object>()];

        if uti == nil {
            let _: () = msg_send![pool, drain];
            return Err("Failed to get UTI for file".to_string());
        }

        // UTIを文字列に変換
        let uti_bytes: *const i8 = msg_send![uti, UTF8String];
        let uti_str = std::ffi::CStr::from_ptr(uti_bytes).to_str().unwrap_or("");

        // LSSetDefaultRoleHandlerForContentType を使用
        // CoreServicesが必要

        // LSDefaultHandlerを設定
        let success: bool = {
            // Launch Services APIを使用
            let core_services = dlopen(
                b"/System/Library/Frameworks/CoreServices.framework/CoreServices\0".as_ptr() as *const i8,
                1, // RTLD_LAZY
            );

            if core_services.is_null() {
                let _: () = msg_send![pool, drain];
                return Err("Failed to load CoreServices".to_string());
            }

            let func_name = b"LSSetDefaultRoleHandlerForContentType\0";
            let func: Option<unsafe extern "C" fn(*const i8, *const i8, i32) -> i32> =
                std::mem::transmute(dlsym(core_services, func_name.as_ptr() as *const i8));

            dlclose(core_services);

            if let Some(set_handler) = func {
                let uti_cstr = CString::new(uti_str).unwrap();
                let bundle_cstr = CString::new(bundle_identifier.as_str()).unwrap();
                // kLSRolesAll = 0xFFFFFFFF
                set_handler(uti_cstr.as_ptr(), bundle_cstr.as_ptr(), 0xFFFFFFFFu32 as i32) == 0
            } else {
                false
            }
        };

        let _: () = msg_send![pool, drain];

        if success {
            Ok(())
        } else {
            Err("Failed to set default application".to_string())
        }
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn set_default_application(_path: String, _bundle_identifier: String) -> Result<(), String> {
    Err("Not supported on this platform".to_string())
}

extern "C" {
    fn dlopen(filename: *const i8, flag: i32) -> *mut std::ffi::c_void;
    fn dlsym(handle: *mut std::ffi::c_void, symbol: *const i8) -> *mut std::ffi::c_void;
    fn dlclose(handle: *mut std::ffi::c_void) -> i32;
}

#[tauri::command]
pub async fn show_properties(path: String) -> Result<(), String> {
    let script = format!(
        "tell application \"Finder\" to open information window of (POSIX file \"{}\" as alias)",
        path
    );
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| format!("Failed to open properties: {}", e))?;
    Ok(())
}

/// 基本プロパティのみ取得（フォルダサイズ計算をスキップ）
#[tauri::command]
pub async fn get_basic_properties(path: String) -> Result<DetailedProperties, String> {
    let path_buf = std::path::PathBuf::from(&path);
    let metadata = std::fs::symlink_metadata(&path_buf).map_err(|e| e.to_string())?;
    let is_dir = metadata.is_dir();
    let size_bytes = metadata.len();

    let name = path_buf
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    let (contains_files, contains_folders) = (0, 0);

    // タイムスタンプ取得の共通化
    let to_ts = |t: std::io::Result<std::time::SystemTime>| {
        t.ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    };

    let file_type = if is_dir {
        "ファイル フォルダー".to_string()
    } else {
        path_buf
            .extension()
            .map(|ext| format!("{} ファイル", ext.to_string_lossy().to_uppercase()))
            .unwrap_or_else(|| "ファイル".to_string())
    };

    let size_on_disk = if is_dir || size_bytes == 0 {
        0
    } else {
        size_bytes.div_ceil(4096) * 4096
    };

    let (default_application, default_application_icon_id) =
        get_default_application(&path).unzip();

    Ok(DetailedProperties {
        name,
        path,
        file_type,
        location: path_buf
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
        size_bytes,
        size_formatted: if is_dir {
            "計算中...".to_string()
        } else {
            format_size(size_bytes)
        },
        size_on_disk_bytes: size_on_disk,
        size_on_disk_formatted: if is_dir {
            String::new()
        } else {
            format_size(size_on_disk)
        },
        contains_files,
        contains_folders,
        created_formatted: format_timestamp(to_ts(metadata.created())),
        modified_formatted: format_timestamp(to_ts(metadata.modified())),
        accessed_formatted: format_timestamp(to_ts(metadata.accessed())),
        is_readonly: metadata.permissions().mode() & 0o222 == 0,
        is_hidden: path_buf
            .file_name()
            .map(|n| n.to_string_lossy().starts_with('.'))
            .unwrap_or(false),
        default_application,
        default_application_icon_id,
    })
}

/// 詳細プロパティ取得（フォルダサイズを再帰計算）
#[tauri::command]
pub async fn get_detailed_properties(path: String) -> Result<DetailedProperties, String> {
    let mut props = get_basic_properties(path.clone()).await?;
    let path_buf = std::path::PathBuf::from(&path);

    if props.file_type != "ファイル フォルダー" {
        return Ok(props);
    }

    let mut stack = vec![path_buf];
    while let Some(current) = stack.pop() {
        let entries = match std::fs::read_dir(current) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            if meta.is_dir() {
                props.contains_folders += 1;
                stack.push(entry.path());
            } else {
                props.contains_files += 1;
                props.size_bytes += meta.len();
            }
        }
    }

    props.size_formatted = format_size(props.size_bytes);
    props.size_on_disk_bytes = props.size_bytes.div_ceil(4096) * 4096;
    props.size_on_disk_formatted = format_size(props.size_on_disk_bytes);
    Ok(props)
}

/// フォルダサイズをストリーミング計算
#[tauri::command]
pub async fn get_detailed_properties_streaming(
    path: String,
    channel: tauri::ipc::Channel<PropertyProgress>,
) -> Result<DetailedProperties, String> {
    let props = get_basic_properties(path.clone()).await?;
    if props.file_type != "ファイル フォルダー" {
        let sod = props.size_bytes.div_ceil(4096) * 4096;
        let _ = channel.send(PropertyProgress {
            size_bytes: props.size_bytes,
            size_formatted: props.size_formatted.clone(),
            size_on_disk_bytes: sod,
            size_on_disk_formatted: format_size(sod),
            contains_files: 0,
            contains_folders: 0,
            complete: true,
        });
        return Ok(props);
    }

    let path_clone = std::path::PathBuf::from(&path);
    tokio::task::spawn_blocking(move || {
        let mut stack = vec![path_clone];
        let (mut size, mut files, mut folders, mut counter) = (0u64, 0u32, 0u32, 0u32);

        while let Some(curr) = stack.pop() {
            let entries = match std::fs::read_dir(curr) {
                Ok(e) => e,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                let m = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                if m.is_dir() {
                    folders += 1;
                    stack.push(entry.path());
                } else {
                    files += 1;
                    size += m.len();
                }

                if (counter % 50) == 0 {
                    let sod = size.div_ceil(4096) * 4096;
                    let _ = channel.send(PropertyProgress {
                        size_bytes: size,
                        size_formatted: format_size(size),
                        size_on_disk_bytes: sod,
                        size_on_disk_formatted: format_size(sod),
                        contains_files: files,
                        contains_folders: folders,
                        complete: false,
                    });
                }
                counter += 1;
            }
        }

        let sod = size.div_ceil(4096) * 4096;
        let _ = channel.send(PropertyProgress {
            size_bytes: size,
            size_formatted: format_size(size),
            size_on_disk_bytes: sod,
            size_on_disk_formatted: format_size(sod),
            contains_files: files,
            contains_folders: folders,
            complete: true,
        });
    });
    Ok(props)
}
