//! macos_ls (duti再実装) の機能テスト
//! 
//! Launch Services API が 0 依存の FFI 経由で正しく動作することを検証します。

#[cfg(target_os = "macos")]
mod tests {
    use xplorer_lib::utils::macos_ls::{
        set_default_handler_for_ext, 
        set_default_handler_for_uti, 
        set_default_handler_for_url_scheme
    };

    #[test]
    #[ignore]
    fn test_macos_ls_ffi_smoke_test() {
        println!("Starting macos_ls FFI smoke test...");

        // 1. 拡張子による設定 (TextEdit を .txt に設定)
        // 本来は現在の設定を破壊しないようにすべきですが、テストとして標準的なアプリを設定します。
        let result_ext = set_default_handler_for_ext("txt", "com.apple.TextEdit");
        println!("set_default_handler_for_ext result: {:?}", result_ext);
        assert!(result_ext.is_ok(), "Failed to set handler for .txt");

        // 2. UTIによる設定 (TextEdit を public.plain-text に設定)
        let result_uti = set_default_handler_for_uti("public.plain-text", "com.apple.TextEdit");
        println!("set_default_handler_for_uti result: {:?}", result_uti);
        assert!(result_uti.is_ok(), "Failed to set handler for public.plain-text");

        // 3. URLスキームによる設定 (Safari を http に設定)
        let result_scheme = set_default_handler_for_url_scheme("http", "com.apple.Safari");
        println!("set_default_handler_for_url_scheme result: {:?}", result_scheme);
        assert!(result_scheme.is_ok(), "Failed to set handler for http");

        println!("macos_ls FFI smoke test completed successfully.");
    }
}
