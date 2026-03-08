//! テスト用ユーティリティモジュール
//!
//! テストで使用する一時ディレクトリをプロジェクト内の `.tmp/tests/` に作成し、
//! テスト終了時に自動的にクリーンアップします。

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

/// テスト用の一時ディレクトリを管理する構造体
///
/// Drop traitを実装しており、スコープを抜けると自動的にディレクトリを削除します。
pub struct ProjectTempDir {
    path: PathBuf,
}

/// 一意なディレクトリ名を生成するためのカウンター
static COUNTER: AtomicU64 = AtomicU64::new(0);

impl ProjectTempDir {
    /// 新しいテスト用一時ディレクトリを作成
    ///
    /// ディレクトリは `<project_root>/.tmp/tests/<test_name>_<unique_id>/` に作成されます。
    pub fn new(test_name: &str) -> Self {
        let path = Self::get_base_path()
            .join(format!("{}_{}", test_name, COUNTER.fetch_add(1, Ordering::SeqCst)));

        // 親ディレクトリが存在しない場合は作成
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok();
        }

        // テスト用ディレクトリを作成
        fs::create_dir_all(&path).expect("テスト用ディレクトリの作成に失敗しました");

        Self { path }
    }

    /// ベースパス（.tmp/tests）を取得
    fn get_base_path() -> PathBuf {
        // CARGO_MANIFEST_DIR は src-tauri ディレクトリを指す
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
            .expect("CARGO_MANIFEST_DIR が設定されていません");

        PathBuf::from(manifest_dir)
            .parent()
            .expect("親ディレクトリが見つかりません")
            .join(".tmp")
            .join("tests")
    }

    /// 一時ディレクトリのパスを取得
    pub fn path(&self) -> &std::path::Path {
        &self.path
    }
}

impl Drop for ProjectTempDir {
    fn drop(&mut self) {
        // テスト終了時にディレクトリを削除
        let _ = fs::remove_dir_all(&self.path);
    }
}

/// テスト名から一時ディレクトリを作成するヘルパーマクロ
///
/// 使用例:
/// ```
/// let temp = test_temp_dir!();
/// let file_path = temp.path().join("test.txt");
/// ```
#[macro_export]
macro_rules! test_temp_dir {
    () => {
        $crate::test_utils::ProjectTempDir::new(
            std::path::Path::new(file!())
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("test")
        )
    };
    ($name:expr) => {
        $crate::test_utils::ProjectTempDir::new($name)
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_temp_dir_creation() {
        let temp = ProjectTempDir::new("test_creation");
        assert!(temp.path().exists());
        assert!(temp.path().is_dir());
    }

    #[test]
    fn test_project_temp_dir_cleanup() {
        let path;
        {
            let temp = ProjectTempDir::new("test_cleanup");
            path = temp.path().to_path_buf();
            assert!(path.exists());
        }
        // スコープを抜けると削除される
        assert!(!path.exists());
    }

    #[test]
    fn test_project_temp_dir_unique_names() {
        let temp1 = ProjectTempDir::new("test_unique");
        let temp2 = ProjectTempDir::new("test_unique");
        assert_ne!(temp1.path(), temp2.path());
    }
}
