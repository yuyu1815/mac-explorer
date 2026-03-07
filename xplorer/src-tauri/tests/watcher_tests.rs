use xplorer_lib::watcher::{WatcherState, stop_watching};
use std::path::PathBuf;

#[test]
fn test_watcher_state_default() {
    let state = WatcherState::default();
    assert!(state.watcher.lock().unwrap().is_none());
    assert!(state.current_watch_path.lock().unwrap().is_none());
}

#[test]
fn test_stop_watching() {
    let state = WatcherState::default();
    
    // 擬似的に値をセット
    {
        let mut path_lock = state.current_watch_path.lock().unwrap();
        *path_lock = Some(PathBuf::from("/test/path"));
    }
    
    stop_watching(&state);
    
    assert!(state.watcher.lock().unwrap().is_none());
    assert!(state.current_watch_path.lock().unwrap().is_none());
}
