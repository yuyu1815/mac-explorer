import { useAppStore } from '../stores/appStore';

export const TitleBar = () => {
  const { tabs, activeTabId } = useAppStore();

  const activeTab = tabs.find(t => t.id === activeTabId);
  const displayPath = activeTab?.currentPath || 'エクスプローラー';
  const title = displayPath.split('/').pop() || 'エクスプローラー';


  return (
    <div style={{
      height: 'var(--titlebar-height)',
      backgroundColor: 'var(--bg-titlebar)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      userSelect: 'none',
    }} data-tauri-drag-region>

      {/* Left side: Icon + QAT + Title */}
      {/* macOS traffic lights occupy ~70px on the left with titleBarStyle: Overlay */}
      <div data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', height: '100%', paddingLeft: '70px', flex: 1 }}>

        {/* App Icon / Folder Icon */}
        <div style={{ width: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {/* A mock folder icon since we don't have the explicit icon here */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="#f8d775">
            <path d="M1 2h5l1.5 1.5h7.5v10.5h-14v-12z" />
          </svg>
        </div>

        {/* QAT (Quick Access Toolbar) */}
        <div style={{ display: 'flex', alignItems: 'center', pointerEvents: 'auto', gap: '2px', marginLeft: '4px' }}>
          <div className="qat-btn" title="プロパティ">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--text-main)">
              <path d="M14 2H2v12h12V2zM1 1h14v14H1V1z" />
              <path d="M3 4h10v1H3zM3 7h10v1H3zM3 10h7v1H3z" />
            </svg>
          </div>
          <div className="qat-btn" title="新しいフォルダー">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--text-main)">
              <path d="M7.5 2L9 4h6v10H1V2h6.5zm-.8 1H2v11h12V5H8.5L7 3h-.3z" />
            </svg>
          </div>
          <div className="qat-btn" style={{ width: '16px' }} title="クイック アクセス ツール バーのカスタマイズ">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--text-main)">
              <path d="M1 3h8v1H1z" />
              <path d="M5 8L2 5h6z" />
            </svg>
          </div>
        </div>

        {/* Separator */}
        <div data-tauri-drag-region style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-color)', margin: '0 8px' }}></div>

        {/* Title */}
        <div data-tauri-drag-region style={{ fontSize: '12px', color: 'var(--text-main)', flex: 1 }}>
          {title}
        </div>
      </div>

      <style>{`
        .qat-btn {
          width: 22px;
          height: 22px;
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: default;
          border: 1px solid transparent;
        }
        .qat-btn:hover {
          background-color: var(--hover-bg);
          border-color: var(--hover-border);
        }
        .win-ctrl-btn {
          width: 46px;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: default;
          color: var(--text-main);
        }
        .win-ctrl-btn:hover {
          background-color: #E5E5E5;
        }
        .win-ctrl-btn.close-btn:hover {
          background-color: #E81123;
          color: white;
        }
        @media (prefers-color-scheme: dark) {
            .win-ctrl-btn:hover { background-color: #333333; }
            .win-ctrl-btn.close-btn:hover { background-color: #E81123; color: white; }
        }
      `}</style>
    </div>
  );
};
