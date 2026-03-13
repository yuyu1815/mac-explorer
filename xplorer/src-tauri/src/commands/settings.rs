//! アプリケーション設定の永続化を管理するモジュール。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// アプリケーション設定
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// 表示設定
    pub display: DisplaySettings,
    /// アプリ設定
    pub app: ApplicationSettings,
}

/// 表示設定
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplaySettings {
    /// テーマ (light, dark, system)
    pub theme: String,
    /// フォントサイズ (small, medium, large)
    pub font_size: String,
    /// デフォルトのビューモード (detail, icon, list)
    pub default_view_mode: String,
    /// 隠しファイルを表示
    pub show_hidden_files: bool,
    /// 拡張子を表示
    pub show_file_extensions: bool,
    /// アイテムチェックボックスを表示
    pub show_item_checkboxes: bool,
    /// 詳細ペインを表示
    pub show_details_pane: bool,
    /// サイドバーの幅
    pub sidebar_width: u32,
}

impl Default for DisplaySettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            font_size: "medium".to_string(),
            default_view_mode: "detail".to_string(),
            show_hidden_files: false,
            show_file_extensions: true,
            show_item_checkboxes: false,
            show_details_pane: false,
            sidebar_width: 200,
        }
    }
}

/// アプリケーション設定
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationSettings {
    /// 言語 (ja, en)
    pub language: String,
    /// デフォルトフォルダ
    pub default_folder: String,
    /// 起動時の動作 (last_folder, default_folder)
    pub startup_behavior: String,
    /// 最後に開いたフォルダ
    pub last_folder: Option<String>,
    /// ゴミ箱への移動前に確認
    pub confirm_trash: bool,
    /// 完全削除前に確認
    pub confirm_permanent_delete: bool,
}

impl Default for ApplicationSettings {
    fn default() -> Self {
        Self {
            language: "ja".to_string(),
            default_folder: "/".to_string(),
            startup_behavior: "default_folder".to_string(),
            last_folder: None,
            confirm_trash: true,
            confirm_permanent_delete: true,
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            display: DisplaySettings::default(),
            app: ApplicationSettings::default(),
        }
    }
}

/// 設定ファイルのパスを取得
fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("設定ディレクトリの取得に失敗しました: {}", e))?;

    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| format!("設定ディレクトリの作成に失敗しました: {}", e))?;
    }

    Ok(config_dir.join("settings.json"))
}

/// 設定を読み込む
#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = get_settings_path(&app)?;

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("設定ファイルの読み込みに失敗しました: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("設定ファイルのパースに失敗しました: {}", e))
}

/// 設定を保存する
#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = get_settings_path(&app)?;

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("設定のシリアライズに失敗しました: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("設定ファイルの書き込みに失敗しました: {}", e))
}

/// 特定の設定のみを更新する
#[tauri::command]
pub fn update_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    save_settings(app, settings)
}
