import { useAppStore } from '../../stores/appStore';
import { FileEntry } from '../../types';

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 バイト';
    const k = 1024;
    const sizes = ['バイト', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const fileIcon = (entry: FileEntry): string =>
    entry.is_dir ? '📁' : '📄';

export const DetailsPane = () => {
    const { tabs, activeTabId } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const files = activeTab?.files || [];
    const selectedFiles = activeTab?.selectedFiles || new Set<string>();

    const selectedEntries = files.filter(f => selectedFiles.has(f.path));
    const entry = selectedEntries.length === 1 ? selectedEntries[0] : null;

    return (
        <div className="details-pane">
            {entry ? (
                <div className="details-content">
                    <div className="details-icon">{fileIcon(entry)}</div>
                    <div className="details-name">{entry.name}</div>
                    <div className="details-props">
                        <DetailRow label="項目の種類" value={entry.is_dir ? 'ファイルフォルダー' : entry.file_type.toUpperCase() + ' ファイル'} />
                        {!entry.is_dir && <DetailRow label="サイズ" value={entry.size_formatted} />}
                        <DetailRow label="更新日時" value={entry.modified_formatted} />
                        <DetailRow label="作成日時" value={entry.created_formatted} />
                        <DetailRow label="パス" value={entry.path} />
                    </div>
                </div>
            ) : selectedEntries.length > 1 ? (
                <div className="details-content">
                    <div className="details-icon" style={{ fontSize: '32px' }}>📋</div>
                    <div className="details-name">{selectedEntries.length} 個の項目を選択</div>
                    <div className="details-props">
                        <DetailRow label="合計サイズ" value={formatBytes(selectedEntries.reduce((s, f) => s + f.size, 0))} />
                    </div>
                </div>
            ) : (
                <div className="details-empty">
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
                    <div style={{ color: '#888', fontSize: '11px' }}>項目を選択してください</div>
                </div>
            )}

            <style>{`
                .details-pane {
                    width: 220px;
                    min-width: 180px;
                    max-width: 320px;
                    border-left: 1px solid var(--border-color);
                    background-color: var(--bg-main);
                    display: flex;
                    flex-direction: column;
                    overflow-y: auto;
                    padding: 12px;
                    font-size: 12px;
                }
                .details-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .details-icon {
                    font-size: 48px;
                    margin-bottom: 8px;
                    margin-top: 8px;
                }
                .details-name {
                    font-weight: 600;
                    font-size: 13px;
                    color: var(--text-main);
                    text-align: center;
                    word-break: break-all;
                    margin-bottom: 12px;
                }
                .details-props {
                    width: 100%;
                }
                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 3px 0;
                    border-bottom: 1px solid var(--border-color);
                }
                .detail-row-label {
                    color: #888;
                    font-size: 11px;
                    flex-shrink: 0;
                    margin-right: 8px;
                }
                .detail-row-value {
                    color: var(--text-main);
                    font-size: 11px;
                    text-align: right;
                    word-break: break-all;
                }
                .details-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                }
            `}</style>
        </div>
    );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <div className="detail-row">
        <span className="detail-row-label">{label}</span>
        <span className="detail-row-value">{value}</span>
    </div>
);
