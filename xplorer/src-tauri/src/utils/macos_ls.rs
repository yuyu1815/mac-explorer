//! Launch Services APIへの低レベルアクセスを提供するモジュール。
//! 外部クレートに依存せず、CoreFoundationとCoreServicesを直接呼び出します。
//!
//! 参考・敬意: [duti](https://github.com/moretension/duti) - macOS default application setting utility

use std::ffi::{c_void, CString};
use std::ptr;

pub type CFStringRef = *const c_void;
pub type CFURLRef = *const c_void;
pub type CFAllocatorRef = *const c_void;
pub type OSStatus = i32;
pub type LSRolesMask = u32;

pub const K_CFSTRING_ENCODING_UTF8: u32 = 0x08000100;
pub const K_LS_ROLES_ALL: LSRolesMask = 0xFFFFFFFF;

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    pub fn CFStringCreateWithCString(
        alloc: CFAllocatorRef,
        cStr: *const i8,
        encoding: u32,
    ) -> CFStringRef;
    pub fn CFRelease(cf: *const c_void);
}

#[link(name = "CoreServices", kind = "framework")]
extern "C" {
    pub fn LSSetDefaultRoleHandlerForContentType(
        inUTI: CFStringRef,
        inRole: LSRolesMask,
        inHandlerBundleID: CFStringRef,
    ) -> OSStatus;

    pub fn LSSetDefaultHandlerForURLScheme(
        inURLScheme: CFStringRef,
        inHandlerBundleID: CFStringRef,
    ) -> OSStatus;

    pub fn LSCopyDefaultRoleHandlerForContentType(
        inUTI: CFStringRef,
        inRole: LSRolesMask,
    ) -> CFStringRef;

    pub fn UTTypeCreatePreferredIdentifierForTag(
        inTagClass: CFStringRef,
        inTag: CFStringRef,
        inConformingToUTI: CFStringRef,
    ) -> CFStringRef;
}

/// CFString型のリソース管理を行うガード。
pub struct CFString(pub CFStringRef);

impl CFString {
    pub fn new(s: &str) -> Option<Self> {
        let c_str = CString::new(s).ok()?;
        let cf_str = unsafe {
            CFStringCreateWithCString(ptr::null(), c_str.as_ptr(), K_CFSTRING_ENCODING_UTF8)
        };
        if cf_str.is_null() {
            None
        } else {
            Some(CFString(cf_str))
        }
    }
}

impl Drop for CFString {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) };
        }
    }
}

/// 拡張子(例: "txt")に対するデフォルトのハンドラ(Bundle ID)を設定します。
pub fn set_default_handler_for_ext(ext: &str, bundle_id: &str) -> Result<(), String> {
    let ext_cf = CFString::new(ext).ok_or("Failed to create CFString for extension")?;
    let bundle_id_cf = CFString::new(bundle_id).ok_or("Failed to create CFString for bundle id")?;
    
    // UTTagClassFilenameExtension ("public.filename-extension")
    let tag_class_cf = CFString::new("public.filename-extension").ok_or("Failed to create CFString for tag class")?;

    unsafe {
        let uti = UTTypeCreatePreferredIdentifierForTag(tag_class_cf.0, ext_cf.0, ptr::null());
        if uti.is_null() {
            return Err(format!("Failed to get UTI for extension: {}", ext));
        }

        let status = LSSetDefaultRoleHandlerForContentType(uti, K_LS_ROLES_ALL, bundle_id_cf.0);
        CFRelease(uti);

        if status == 0 {
            Ok(())
        } else {
            Err(format!("LSSetDefaultRoleHandlerForContentType failed with status: {}", status))
        }
    }
}

/// UTIに対するデフォルトのハンドラ(Bundle ID)を設定します。
pub fn set_default_handler_for_uti(uti: &str, bundle_id: &str) -> Result<(), String> {
    let uti_cf = CFString::new(uti).ok_or("Failed to create CFString for UTI")?;
    let bundle_id_cf = CFString::new(bundle_id).ok_or("Failed to create CFString for bundle id")?;

    let status = unsafe {
        LSSetDefaultRoleHandlerForContentType(uti_cf.0, K_LS_ROLES_ALL, bundle_id_cf.0)
    };

    if status == 0 {
        Ok(())
    } else {
        Err(format!("LSSetDefaultRoleHandlerForContentType failed with status: {}", status))
    }
}

/// URLスキームに対するデフォルトのハンドラ(Bundle ID)を設定します。
pub fn set_default_handler_for_url_scheme(scheme: &str, bundle_id: &str) -> Result<(), String> {
    let scheme_cf = CFString::new(scheme).ok_or("Failed to create CFString for scheme")?;
    let bundle_id_cf = CFString::new(bundle_id).ok_or("Failed to create CFString for bundle id")?;

    let status = unsafe {
        LSSetDefaultHandlerForURLScheme(scheme_cf.0, bundle_id_cf.0)
    };

    if status == 0 {
        Ok(())
    } else {
        Err(format!("LSSetDefaultHandlerForURLScheme failed with status: {}", status))
    }
}
