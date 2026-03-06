import { useAppStore } from '../../stores/appStore';
import styles from '../../styles/components/layout/TitleBar.module.css';

export const TitleBar = () => {
  const { tabs, activeTabId } = useAppStore();

  const activeTab = tabs.find(t => t.id === activeTabId);
  const displayPath = activeTab?.currentPath || 'エクスプローラー';
  const title = displayPath.split('/').pop() || 'エクスプローラー';

  return (
    <div className={styles.titleBar} data-tauri-drag-region>
      {/* Left side: Icon + QAT + Title */}
      {/* macOS traffic lights occupy ~70px on the left with titleBarStyle: Overlay */}
      <div data-tauri-drag-region className={styles.leftSection}>

        {/* App Icon / Folder Icon */}
        <div className={styles.appIconContainer}>
          {/* A mock folder icon since we don't have the explicit icon here */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="#f8d775">
            <path d="M1 2h5l1.5 1.5h7.5v10.5h-14v-12z" />
          </svg>
        </div>

        {/* QAT (Quick Access Toolbar) */}
        <div className={styles.qatContainer}>
          <div className={styles.qatBtn} title="プロパティ">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--text-main)">
              <path d="M14 2H2v12h12V2zM1 1h14v14H1V1z" />
              <path d="M3 4h10v1H3zM3 7h10v1H3zM3 10h7v1H3z" />
            </svg>
          </div>
          <div className={styles.qatBtn} title="新しいフォルダー">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--text-main)">
              <path d="M7.5 2L9 4h6v10H1V2h6.5zm-.8 1H2v11h12V5H8.5L7 3h-.3z" />
            </svg>
          </div>
          <div className={styles.qatBtn} style={{ width: '16px' }} title="クイック アクセス ツール バーのカスタマイズ">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--text-main)">
              <path d="M1 3h8v1H1z" />
              <path d="M5 8L2 5h6z" />
            </svg>
          </div>
        </div>

        {/* Separator */}
        <div data-tauri-drag-region className={styles.separator}></div>

        {/* Title */}
        <div data-tauri-drag-region className={styles.titleText}>
          {title}
        </div>
      </div>
    </div>
  );
};
