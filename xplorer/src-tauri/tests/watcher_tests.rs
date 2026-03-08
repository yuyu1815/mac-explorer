//! ウォッチャー機能のテスト
//!
//! ファイルシステム監視の状態管理と制御をテストします。

use xplorer_lib::watcher::{WatcherState, stop_watching};
use std::path::PathBuf;

// =============================================================================
// WatcherState のテスト
// =============================================================================

mod watcher_state_tests {
    use super::*;

    #[test]
    fn test_watcher_state_default() {
        let state = WatcherState::default();
        assert!(state.watcher.lock().unwrap().is_none());
        assert!(state.current_watch_path.lock().unwrap().is_none());
    }

    #[test]
    fn test_watcher_state_new() {
        let state = WatcherState::new();
        assert!(state.watcher.lock().unwrap().is_none());
        assert!(state.current_watch_path.lock().unwrap().is_none());
    }

    #[test]
    fn test_watcher_state_set_and_get_path() {
        let state = WatcherState::default();
        let test_path = PathBuf::from("/test/path");

        // Set path
        {
            let mut path_lock = state.current_watch_path.lock().unwrap();
            *path_lock = Some(test_path.clone());
        }

        // Verify path
        {
            let path_lock = state.current_watch_path.lock().unwrap();
            assert!(path_lock.is_some());
            assert_eq!(path_lock.as_ref().unwrap(), &test_path);
        }
    }

    #[test]
    fn test_watcher_state_clear() {
        let state = WatcherState::default();

        // Set values
        {
            let mut path_lock = state.current_watch_path.lock().unwrap();
            *path_lock = Some(PathBuf::from("/test/path"));
        }

        // Clear via stop_watching
        stop_watching(&state);

        // Verify cleared
        assert!(state.watcher.lock().unwrap().is_none());
        assert!(state.current_watch_path.lock().unwrap().is_none());
    }

    #[test]
    fn test_watcher_state_multiple_stops() {
        let state = WatcherState::default();

        // Multiple stops should not panic
        stop_watching(&state);
        stop_watching(&state);
        stop_watching(&state);

        assert!(state.watcher.lock().unwrap().is_none());
        assert!(state.current_watch_path.lock().unwrap().is_none());
    }
}

// =============================================================================
// stop_watching のテスト
// =============================================================================

mod stop_watching_tests {
    use super::*;

    #[test]
    fn test_stop_watching_empty_state() {
        let state = WatcherState::default();
        stop_watching(&state);
        assert!(state.watcher.lock().unwrap().is_none());
        assert!(state.current_watch_path.lock().unwrap().is_none());
    }

    #[test]
    fn test_stop_watching_with_path() {
        let state = WatcherState::default();

        {
            let mut path_lock = state.current_watch_path.lock().unwrap();
            *path_lock = Some(PathBuf::from("/some/watch/path"));
        }

        stop_watching(&state);

        assert!(state.watcher.lock().unwrap().is_none());
        assert!(state.current_watch_path.lock().unwrap().is_none());
    }

    #[test]
    fn test_stop_watching_idempotent() {
        let state = WatcherState::default();

        // Set and stop
        {
            let mut path_lock = state.current_watch_path.lock().unwrap();
            *path_lock = Some(PathBuf::from("/path"));
        }
        stop_watching(&state);

        // Stop again (should be idempotent)
        stop_watching(&state);

        assert!(state.watcher.lock().unwrap().is_none());
        assert!(state.current_watch_path.lock().unwrap().is_none());
    }
}

// =============================================================================
// 並行性のテスト
// =============================================================================

mod concurrency_tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn test_watcher_state_concurrent_access() {
        let state = Arc::new(WatcherState::default());
        let mut handles = vec![];

        // Spawn multiple threads that access the state
        for i in 0..10 {
            let state_clone = state.clone();
            handles.push(thread::spawn(move || {
                let mut path_lock = state_clone.current_watch_path.lock().unwrap();
                *path_lock = Some(PathBuf::from(format!("/path/{}", i)));
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }

        // State should be consistent (some value set)
        let path_lock = state.current_watch_path.lock().unwrap();
        assert!(path_lock.is_some());
    }

    #[test]
    fn test_watcher_state_concurrent_stop() {
        let state = Arc::new(WatcherState::default());

        // Set initial path
        {
            let mut path_lock = state.current_watch_path.lock().unwrap();
            *path_lock = Some(PathBuf::from("/initial"));
        }

        let mut handles = vec![];
        for _ in 0..5 {
            let state_clone = state.clone();
            handles.push(thread::spawn(move || {
                stop_watching(&state_clone);
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }

        // Should be cleared
        assert!(state.current_watch_path.lock().unwrap().is_none());
    }
}
