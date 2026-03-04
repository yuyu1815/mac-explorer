import { useAppStore } from '../../stores/appStore';
import { AlignJustify, LayoutGrid } from 'lucide-react';

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
            className="win10-status-bar"
            data-testid="statusbar"
        >
            {loading && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', overflow: 'hidden' }}>
                    <div className="status-loading-bar" />
                </div>
            )}
            <div className="status-left">
                <span>{totalCount} 個の項目</span>
                {selectedCount > 0 && (
                    <>
                        <div className="status-vertical-sep" />
                        <span>{selectedCount} 個の項目を選択 {selectedSize > 0 ? formatSize(selectedSize) : ''}</span>
                    </>
                )}
            </div>
            <div className="status-right">
                <div
                    className={`status-view-btn ${viewMode === 'detail' ? 'active' : ''}`}
                    onClick={() => setViewMode('detail')}
                    title="詳細"
                >
                    <AlignJustify size={14} />
                </div>
                <div
                    className={`status-view-btn ${viewMode === 'large_icon' ? 'active' : ''}`}
                    onClick={() => setViewMode('large_icon')}
                    title="大アイコン"
                >
                    <LayoutGrid size={14} />
                </div>
            </div>

            <style>{`
                .win10-status-bar {
                    height: var(--statusbar-height);
                    border-top: 1px solid var(--border-color);
                    background-color: var(--bg-main);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 4px 0 8px;
                    font-size: 11px;
                    color: var(--text-main);
                    user-select: none;
                    cursor: default;
                    position: relative;
                }
                .status-loading-bar {
                    height: 100%;
                    width: 30%;
                    background: linear-gradient(90deg, transparent, #0078D7, transparent);
                    animation: statusLoading 1.2s infinite;
                }
                @keyframes statusLoading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(400%); }
                }
                .status-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .status-vertical-sep {
                    height: 14px;
                    width: 1px;
                    background-color: var(--border-color);
                }
                .status-right {
                    display: flex;
                    align-items: center;
                    height: 100%;
                    gap: 2px;
                }
                .status-view-btn {
                    height: 100%;
                    width: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid transparent;
                    color: var(--text-muted);
                }
                .status-view-btn:hover {
                    background-color: var(--hover-bg);
                    border-color: var(--hover-border);
                }
                .status-view-btn.active {
                    background-color: var(--selected-bg);
                    border-color: var(--border-active);
                    color: var(--text-main);
                }
            `}</style>
        </div>
    );
};
