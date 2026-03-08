//! IPC抽象化レイヤー
//!
//! Tauri依存を分離するためのトレイト定義。
//! これによりビジネスロジックをTauriなしでテスト可能にする。

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

// =============================================================================
// ProgressChannel トレイト
// =============================================================================

/// 進捗通知を送信するためのチャネル抽象
///
/// `tauri::ipc::Channel<T>` を抽象化し、テスト時にモック可能にする。
pub trait ProgressChannel<T: Serialize + Send + 'static>: Send {
    /// 進捗データを送信
    fn send(&self, data: T) -> Result<(), String>;
}

// =============================================================================
// Tauri用実装
// =============================================================================

impl<T: Serialize + Send + 'static> ProgressChannel<T> for tauri::ipc::Channel<T> {
    fn send(&self, data: T) -> Result<(), String> {
        self.send(data).map_err(|e| e.to_string())
    }
}

// =============================================================================
// テスト用モック実装
// =============================================================================

/// テスト用のモックチャネル
///
/// 送信されたデータを収集し、後でアサーション可能にする。
#[derive(Debug, Default)]
pub struct MockChannel<T> {
    pub sent: std::sync::Mutex<Vec<T>>,
}

impl<T> MockChannel<T> {
    pub fn new() -> Self {
        Self {
            sent: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// 送信されたデータを取得
    pub fn get_sent(&self) -> Vec<T>
    where
        T: Clone,
    {
        self.sent.lock().unwrap().clone()
    }

    /// 送信されたデータ数を取得
    pub fn count(&self) -> usize {
        self.sent.lock().unwrap().len()
    }
}

impl<T: Serialize + Clone + Send + 'static> ProgressChannel<T> for MockChannel<T> {
    fn send(&self, data: T) -> Result<(), String> {
        self.sent.lock().unwrap().push(data);
        Ok(())
    }
}

// =============================================================================
// EventEmitter トレイト
// =============================================================================

/// イベントを発行するための抽象
///
/// `tauri::AppHandle::emit()` を抽象化し、テスト時にモック可能にする。
pub trait EventEmitter: Send + Sync {
    /// イベントを発行
    fn emit<T: Serialize + Clone + Send + 'static>(
        &self,
        event: &str,
        payload: T,
    ) -> Result<(), String>;
}

// =============================================================================
// Tauri用EventEmitter実装
// =============================================================================

use tauri::Emitter as TauriEmitter;

/// TauriのAppHandleをラップするEventEmitter実装
pub struct TauriEventEmitter {
    handle: tauri::AppHandle,
}

impl TauriEventEmitter {
    pub fn new(handle: tauri::AppHandle) -> Self {
        Self { handle }
    }
}

impl EventEmitter for TauriEventEmitter {
    fn emit<T: Serialize + Clone + Send + 'static>(
        &self,
        event: &str,
        payload: T,
    ) -> Result<(), String> {
        self.handle.emit(event, payload).map_err(|e| e.to_string())
    }
}

// =============================================================================
// テスト用モックEventEmitter
// =============================================================================

/// テスト用のモックEventEmitter
#[derive(Debug, Default)]
pub struct MockEventEmitter {
    pub events: std::sync::Mutex<Vec<(String, String)>>,
}

impl MockEventEmitter {
    pub fn new() -> Self {
        Self {
            events: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// 発行されたイベント数を取得
    pub fn count(&self) -> usize {
        self.events.lock().unwrap().len()
    }

    /// 指定イベント名の発行回数を取得
    pub fn count_event(&self, event_name: &str) -> usize {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter(|(name, _)| name == event_name)
            .count()
    }
}

impl EventEmitter for MockEventEmitter {
    fn emit<T: Serialize + Clone + Send + 'static>(
        &self,
        event: &str,
        payload: T,
    ) -> Result<(), String> {
        let json = serde_json::to_string(&payload).unwrap_or_default();
        self.events.lock().unwrap().push((event.to_string(), json));
        Ok(())
    }
}

// =============================================================================
// OperationControl アクセス抽象
// =============================================================================

/// 操作制御へのアクセス抽象
///
/// ポーズ/レジューム/キャンセルの制御を抽象化する。
pub trait OperationControlAccess: Send + Sync {
    /// ポーズ中かチェック（ポーズ中はブロック）
    fn check(&self) -> Result<(), String>;

    /// ポーズ状態にする
    fn pause(&self);

    /// レジュームする
    fn resume(&self);

    /// キャンセルする
    fn cancel(&self);

    /// リセットする
    fn reset(&self);
}

// =============================================================================
// 具象OperationControlへの実装
// =============================================================================

use super::archive::OperationControl;

impl OperationControlAccess for OperationControl {
    fn check(&self) -> Result<(), String> {
        self.check()
    }

    fn pause(&self) {
        self.paused.store(true, Ordering::Relaxed);
    }

    fn resume(&self) {
        self.paused.store(false, Ordering::Relaxed);
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
        self.paused.store(false, Ordering::Relaxed);
    }

    fn reset(&self) {
        self.reset();
    }
}

// =============================================================================
// テスト用モックOperationControl
// =============================================================================

/// テスト用のモック操作制御
#[derive(Debug, Default)]
pub struct MockOperationControl {
    pub paused: AtomicBool,
    pub cancelled: AtomicBool,
    pub check_count: std::sync::atomic::AtomicU32,
}

impl MockOperationControl {
    pub fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            cancelled: AtomicBool::new(false),
            check_count: std::sync::atomic::AtomicU32::new(0),
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }
}

impl OperationControlAccess for MockOperationControl {
    fn check(&self) -> Result<(), String> {
        self.check_count.fetch_add(1, Ordering::Relaxed);
        if self.cancelled.load(Ordering::Relaxed) {
            return Err("操作がキャンセルされました".to_string());
        }
        while self.paused.load(Ordering::Relaxed) {
            if self.cancelled.load(Ordering::Relaxed) {
                return Err("操作がキャンセルされました".to_string());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        Ok(())
    }

    fn pause(&self) {
        self.paused.store(true, Ordering::Relaxed);
    }

    fn resume(&self) {
        self.paused.store(false, Ordering::Relaxed);
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
        self.paused.store(false, Ordering::Relaxed);
    }

    fn reset(&self) {
        self.paused.store(false, Ordering::Relaxed);
        self.cancelled.store(false, Ordering::Relaxed);
    }
}

// =============================================================================
// ユニットテスト
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_channel_send() {
        #[derive(Debug, Clone, Serialize)]
        struct TestProgress {
            value: u32,
        }

        let channel = MockChannel::<TestProgress>::new();
        channel.send(TestProgress { value: 1 }).unwrap();
        channel.send(TestProgress { value: 2 }).unwrap();

        assert_eq!(channel.count(), 2);
        let sent = channel.get_sent();
        assert_eq!(sent[0].value, 1);
        assert_eq!(sent[1].value, 2);
    }

    #[test]
    fn test_mock_event_emitter() {
        let emitter = MockEventEmitter::new();

        emitter.emit("test-event", serde_json::json!({ "key": "value" })).unwrap();
        emitter.emit("another-event", serde_json::json!({ "foo": "bar" })).unwrap();

        assert_eq!(emitter.count(), 2);
        assert_eq!(emitter.count_event("test-event"), 1);
    }

    #[test]
    fn test_mock_operation_control() {
        let control = MockOperationControl::new();

        assert!(!control.is_paused());
        assert!(!control.is_cancelled());

        control.pause();
        assert!(control.is_paused());

        control.resume();
        assert!(!control.is_paused());

        control.cancel();
        assert!(control.is_cancelled());

        control.reset();
        assert!(!control.is_cancelled());
    }

    #[test]
    fn test_mock_operation_control_check_cancelled() {
        let control = MockOperationControl::new();
        control.cancel();

        let result = control.check();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("キャンセル"));
    }
}
