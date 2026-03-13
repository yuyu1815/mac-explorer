pub mod archive;
pub mod archive_core;
pub mod directory;
pub mod file_ops;
pub mod icons;
pub mod ipc;
pub mod properties;
pub mod settings;
pub mod types;
pub mod utils;
pub mod volumes;
pub mod watcher;

// 抽象化トレイトの再エクスポート（テスト用）
pub use ipc::{EventEmitter, MockChannel, MockEventEmitter, MockOperationControl, OperationControlAccess, ProgressChannel};
