import { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { NavigationBar } from './components/NavigationBar';
import { SidePanel } from './components/SidePanel';
import { MainPane } from './components/MainPane';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { DetailsPane } from './components/DetailsPane';
import { ProgressWindow } from './components/ProgressWindow';
import { OverwriteConfirmDialog } from './components/OverwriteConfirmDialog';
import { useAppStore } from './stores/appStore';
import './styles/global.css';

function App() {
  const showDetailsPane = useAppStore(s => s.showDetailsPane);
  const { goBack, goForward, goUp } = useAppStore();
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

  return (
    <div className="app-container">
      <div style={{ backgroundColor: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)' }}>
        <TitleBar />
        <NavigationBar />
        <Toolbar />
      </div>
      <div className="main-content">
        <div style={{ width: sideWidth, flexShrink: 0 }}>
          <SidePanel />
        </div>
        <div
          onMouseDown={handleSideResize}
          style={{ width: '3px', cursor: 'col-resize', backgroundColor: 'var(--border-color)', flexShrink: 0 }}
        />
        <MainPane />
        {showDetailsPane && <DetailsPane />}
      </div>
      <StatusBar />
      <OverwriteConfirmDialog />
    </div>
  );
}

export default App;
