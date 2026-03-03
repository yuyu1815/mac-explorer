import { useAppStore } from '../../stores/appStore';

const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const StatusBar = () => {
    const { tabs, activeTabId } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    const files = activeTab?.files || [];
    const selectedFiles = activeTab?.selectedFiles || new Set<string>();

    const totalCount = files.length;

    // 選択されたファイルの合計サイズ（ディレクトリは除外）
    const selectedCount = selectedFiles.size;
    const selectedSize = files
        .filter(f => selectedFiles.has(f.path) && !f.is_dir)
        .reduce((sum, f) => sum + f.size, 0);

    const renderInfo = () => {
        if (selectedCount > 0) {
            return (
                <span data-testid="statusbar-selection">
                    {selectedCount} 個の項目を選択
                    {selectedSize > 0 && ` ${formatSize(selectedSize)}`}
                </span>
            );
        }
        return (
            <span data-testid="statusbar-total">
                {totalCount} 個の項目
            </span>
        );
    };

    return (
        <div
            data-testid="statusbar"
            style={{
                height: 'var(--statusbar-height)',
                borderTop: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-main)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                fontSize: '12px',
                color: 'var(--text-muted)'
            }}
        >
            <div>{renderInfo()}</div>
        </div>
    );
};
