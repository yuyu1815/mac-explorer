import { useAppStore } from '@/stores/appStore';
import { FileEntry } from '@/types';
import styles from '@/styles/components/layout/DetailsPane.module.css';

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
        <div className={styles.detailsPane}>
            {entry ? (
                <div className={styles.detailsContent}>
                    <div className={styles.detailsIcon}>{fileIcon(entry)}</div>
                    <div className={styles.detailsName}>{entry.name}</div>
                    <div className={styles.detailsProps}>
                        <DetailRow label="項目の種類" value={entry.is_dir ? 'ファイルフォルダー' : entry.file_type.toUpperCase() + ' ファイル'} />
                        {!entry.is_dir && <DetailRow label="サイズ" value={entry.size_formatted} />}
                        <DetailRow label="更新日時" value={entry.modified_formatted} />
                        <DetailRow label="作成日時" value={entry.created_formatted} />
                        <DetailRow label="パス" value={entry.path} />
                    </div>
                </div>
            ) : selectedEntries.length > 1 ? (
                <div className={styles.detailsContent}>
                    <div className={styles.multiSelectIcon}>📋</div>
                    <div className={styles.detailsName}>{selectedEntries.length} 個の項目を選択</div>
                    <div className={styles.detailsProps}>
                        <DetailRow label="合計サイズ" value={formatBytes(selectedEntries.reduce((s, f) => s + f.size, 0))} />
                    </div>
                </div>
            ) : (
                <div className={styles.detailsEmpty}>
                    <div className={styles.emptyIcon}>📂</div>
                    <div className={styles.emptyText}>項目を選択してください</div>
                </div>
            )}
        </div>
    );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <div className={styles.detailRow}>
        <span className={styles.detailRowLabel}>{label}</span>
        <span className={styles.detailRowValue}>{value}</span>
    </div>
);
