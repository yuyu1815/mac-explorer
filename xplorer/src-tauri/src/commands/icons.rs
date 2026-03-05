use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use dashmap::DashMap;
use once_cell::sync::{Lazy, OnceCell};

static ICON_CACHE: Lazy<DashMap<String, Vec<u8>>> = Lazy::new(DashMap::new);
static CACHE_DIR: OnceCell<PathBuf> = OnceCell::new();

pub fn init_icon_cache(path: PathBuf) {
    let _ = std::fs::create_dir_all(&path);
    let _ = CACHE_DIR.set(path);
}

fn hash_id(id: &str) -> String {
    let mut s = std::collections::hash_map::DefaultHasher::new();
    id.hash(&mut s);
    format!("{:x}", s.finish())
}

/// アイコンバイナリ取得（キャッシュ付き）
#[cfg(target_os = "macos")]
pub fn get_icon_binary(id: &str) -> Option<Vec<u8>> {
    // 1. メモリキャッシュ
    if let Some(data) = ICON_CACHE.get(id) {
        return Some(data.clone());
    }

    // 2. ディスクキャッシュ
    if let Some(cache_dir) = CACHE_DIR.get() {
        let cache_file = cache_dir.join(format!("{}.png", hash_id(id)));
        if let Ok(data) = std::fs::read(&cache_file) {
            ICON_CACHE.insert(id.to_string(), data.clone());
            return Some(data);
        }
    }

    // 3. NSWorkspace → CGImage → PNG 取得
    use cocoa::base::{id as cocoa_id, nil};
    use cocoa::foundation::{NSPoint, NSRect, NSSize, NSString};
    use objc::{msg_send, sel, sel_impl};

    let png_data = unsafe {
        let pool: cocoa_id = msg_send![objc::class!(NSAutoreleasePool), new];

        let result = (|| -> Option<Vec<u8>> {
            let workspace: cocoa_id = msg_send![objc::class!(NSWorkspace), sharedWorkspace];

            let icon: cocoa_id = if let Some(ext) = id.strip_prefix("ext:") {
                let ns_ext = NSString::alloc(nil).init_str(ext);
                msg_send![workspace, iconForFileType: ns_ext]
            } else if id == "dir" {
                msg_send![objc::class!(NSImage), imageNamed: NSString::alloc(nil).init_str("NSFolder")]
            } else {
                let path = if let Some(p) = id.strip_prefix("app:") {
                    p
                } else if let Some(p) = id.strip_prefix("file:") {
                    p
                } else {
                    return None;
                };
                let ns_path = NSString::alloc(nil).init_str(path);
                msg_send![workspace, iconForFile: ns_path]
            };

            if icon == nil {
                return None;
            }

            let size = NSSize {
                width: 32.0,
                height: 32.0,
            };
            let _: () = msg_send![icon, setSize: size];

            let mut rect = NSRect {
                origin: NSPoint { x: 0.0, y: 0.0 },
                size,
            };
            let cg_image: cocoa_id =
                msg_send![icon, CGImageForProposedRect:&mut rect context:nil hints:nil];
            if cg_image == nil {
                return None;
            }

            let bitmap_rep_class = objc::class!(NSBitmapImageRep);
            let bitmap_rep_alloc: cocoa_id = msg_send![bitmap_rep_class, alloc];
            let bitmap_rep: cocoa_id = msg_send![bitmap_rep_alloc, initWithCGImage:cg_image];
            if bitmap_rep == nil {
                return None;
            }

            let empty_dict: cocoa_id = msg_send![objc::class!(NSDictionary), dictionary];
            let png: cocoa_id =
                msg_send![bitmap_rep, representationUsingType: 4u64 properties: empty_dict];
            if png == nil {
                return None;
            }

            let length: usize = msg_send![png, length];
            let bytes: *const u8 = msg_send![png, bytes];
            Some(std::slice::from_raw_parts(bytes, length).to_vec())
        })();

        let _: () = msg_send![pool, drain];
        result
    }?;

    // 4. キャッシュに保存
    ICON_CACHE.insert(id.to_string(), png_data.clone());
    if let Some(cache_dir) = CACHE_DIR.get() {
        let cache_file = cache_dir.join(format!("{}.png", hash_id(id)));
        let _ = std::fs::write(cache_file, &png_data);
    }

    Some(png_data)
}

#[cfg(not(target_os = "macos"))]
pub fn get_icon_binary(_id: &str) -> Option<Vec<u8>> {
    None
}
