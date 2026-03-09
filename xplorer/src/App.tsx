import { useState, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { NavigationBar } from './components/layout/NavigationBar';
import { SidePanel } from './components/layout/SidePanel';
import { MainPane } from './components/features/file-manager/MainPane';
import { StatusBar } from './components/layout/StatusBar';
import { Toolbar } from './components/layout/Toolbar';
import { DetailsPane } from './components/layout/DetailsPane';
import { ProgressWindow } from './components/dialogs/ProgressWindow';
import { PropertiesWindow } from './components/dialogs/PropertiesWindow';
import { OverwriteConfirmDialog } from './components/dialogs/OverwriteConfirmDialog';
import { ExtractPromptDialog } from './components/dialogs/ExtractPromptDialog';
import { TrashConfirmDialog } from './components/dialogs/TrashConfirmDialog';
import { LocationNotAvailableWindow } from './components/dialogs/LocationNotAvailableWindow';
import { useAppStore } from './stores/appStore';
import './styles/global.css';
import styles from './styles/App.module.css';

function App() {
  const showDetailsPane = useAppStore(s => s.showDetailsPane);
  const { goBack, goForward, goUp, openLocationNotAvailableDialog } = useAppStore();
  const [sideWidth, setSideWidth] = useState(200);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Input要素などにフォーカスが当たっている場合は無視する
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.altKey) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goBack();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          goForward();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          goUp();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goBack, goForward, goUp]);

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const { invoke } = await import('@tauri-apps/api/core');
      unlistenFn = await listen<{ path: string }>('navigate_to_dir', async (event) => {
        const path = event.payload.path;
        try {
          await invoke('list_directory', { path, showHidden: false });
          useAppStore.getState().setCurrentPath(path);
        } catch {
          openLocationNotAvailableDialog(path);
        }
      });
    };
    setupListener();
    return () => { if (unlistenFn) unlistenFn(); };
  }, [openLocationNotAvailableDialog]);

  const handleSideResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sideWidth;
    const onMove = (ev: MouseEvent) => {
      setSideWidth(Math.max(100, Math.min(500, startWidth + (ev.clientX - startX))));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // 別ウィンドウ呼び出し用のルーティング
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('window') === 'progress') {
    return <ProgressWindow />;
  }
  if (searchParams.get('window') === 'properties') {
    return <PropertiesWindow />;
  }
  if (searchParams.get('window') === 'location-error') {
    return <LocationNotAvailableWindow />;
  }

  return (
    <div className={styles.appContainer}>
      <div className={styles.topSection}>
        <TitleBar />
        <NavigationBar />
        <Toolbar />
      </div>
      <div className={styles.mainContent}>
        <div className={styles.sideWrapper} style={{ width: sideWidth }}>
          <SidePanel />
        </div>
        <div
          onMouseDown={handleSideResize}
          className={styles.resizer}
        />
        <MainPane />
        {showDetailsPane && <DetailsPane />}
      </div>
      <StatusBar />
      <OverwriteConfirmDialog />
      <ExtractPromptDialog />
      <TrashConfirmDialog />
    </div>
  );
}

export default App;
