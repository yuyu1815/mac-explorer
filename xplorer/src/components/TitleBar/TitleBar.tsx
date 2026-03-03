import { useAppStore } from '../../stores/appStore';

export const TitleBar = () => {
  const { tabs, activeTabId, setActiveTab, addTab, closeTab } = useAppStore();

  return (
    <div style={{
      height: 'var(--titlebar-height)',
      backgroundColor: 'var(--bg-titlebar)',
      display: 'flex',
      alignItems: 'end',
      padding: '8px 16px 0',
      // tauri drag region for dragging the window
    }} data-tauri-drag-region>
      <div style={{ display: 'flex', gap: '4px', height: '32px' }}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const displayPath = tab.currentPath || '新規タブ';
          const title = displayPath.split(/[/\\]/).pop() || displayPath;

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                height: '100%',
                backgroundColor: isActive ? 'var(--bg-main)' : 'transparent',
                borderTopLeftRadius: '6px',
                borderTopRightRadius: '6px',
                cursor: 'default',
                fontSize: '12px',
                minWidth: '120px',
                maxWidth: '200px',
                color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                position: 'relative',
                boxShadow: isActive ? '0 -1px 4px rgba(0,0,0,0.05)' : 'none',
                userSelect: 'none'
              }}
            >
              <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </div>

              {/* 閉じるボタン (1タブのみの場合は非表示にするか無効に) */}
              {tabs.length > 1 && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  style={{
                    marginLeft: '8px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '10px'
                  }}
                  className="tab-close-btn"
                >
                  ✕
                </div>
              )}
            </div>
          );
        })}

        {/* 新規タブ追加ボタン */}
        <div
          onClick={() => addTab()}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginLeft: '4px',
            alignSelf: 'center',
            color: 'var(--text-main)',
            userSelect: 'none'
          }}
          className="tab-add-btn"
        >
          ＋
        </div>
      </div>
    </div>
  );
};
