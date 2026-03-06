import { useAppStore } from '../../stores/appStore';
import { AlignJustify, LayoutGrid } from 'lucide-react';
import styles from '../../styles/components/layout/StatusBar.module.css';

const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
    return `${Number((bytes / (1024 * 1024 * 1024)).toFixed(1))} GB`;
};

export const StatusBar = () => {
    const { tabs, activeTabId, setViewMode, loading } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    const files = activeTab?.files || [];
    const selectedFiles = activeTab?.selectedFiles || new Set<string>();
    const viewMode = activeTab?.viewMode || 'detail';

    const totalCount = files.length;
    let selectedCount = 0;
    let selectedSize = 0;

    files.forEach(f => {
        if (selectedFiles.has(f.path)) {
            selectedCount++;
            if (!f.is_dir) {
                selectedSize += f.size;
            }
        }
    });

    return (
        <div
            className={styles.statusBar}
            data-testid="statusbar"
        >
            {loading && (
                <div className={styles.loadingContainer}>
                    <div className={styles.loadingBar} />
                </div>
            )}
            <div className={styles.statusLeft}>
                <span>{totalCount} 個の項目</span>
                {selectedCount > 0 && (
                    <>
                        <div className={styles.verticalSep} />
                        <span>{selectedCount} 個の項目を選択 {selectedSize > 0 ? formatSize(selectedSize) : ''}</span>
                    </>
                )}
            </div>
            <div className={styles.statusRight}>
                <div
                    className={`${styles.viewBtn} ${viewMode === 'detail' ? styles.viewBtnActive : ''}`}
                    onClick={() => setViewMode('detail')}
                    title="詳細"
                >
                    <AlignJustify size={14} />
                </div>
                <div
                    className={`${styles.viewBtn} ${viewMode === 'large_icon' ? styles.viewBtnActive : ''}`}
                    onClick={() => setViewMode('large_icon')}
                    title="大アイコン"
                >
                    <LayoutGrid size={14} />
                </div>
            </div>
        </div>
    );
};
