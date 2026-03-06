import React from 'react';
import styles from '../../styles/components/dialogs/InsufficientSpaceDialog.module.css';

// Windows 10 の「ディスク容量不足」ダイアログ
interface InsufficientSpaceDialogProps {
    driveName: string;
    requiredBytes: number;
    availableBytes: number;
    onRetry: () => void;
    onSkip: () => void;
    onCancel: () => void;
}

const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return '0 bytes';
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const InsufficientSpaceDialog: React.FC<InsufficientSpaceDialogProps> = ({
    driveName,
    requiredBytes,
    availableBytes,
    onRetry,
    onSkip,
    onCancel,
}) => {
    const deficit = requiredBytes - availableBytes;

    return (
        <div className={styles.overlay}>
            <div className={styles.dialog}>
                {/* ヘッダー */}
                <div className={styles.header}>
                    {/* 警告アイコン */}
                    <div className={styles.warningIcon}>⚠️</div>
                    <div>
                        <div className={styles.title}>
                            {driveName} に十分な空き領域がありません
                        </div>
                        <div className={styles.message}>
                            この操作を完了するには、さらに <strong>{formatBytes(deficit)}</strong> の空き領域が必要です。
                        </div>
                        <div className={styles.stats}>
                            必要な空き領域: {formatBytes(requiredBytes)}<br />
                            利用可能な空き領域: {formatBytes(availableBytes)}
                        </div>
                    </div>
                </div>

                {/* フッター */}
                <div className={styles.footer}>
                    <Win10Button label="再試行(T)" onClick={onRetry} />
                    <Win10Button label="スキップ(S)" onClick={onSkip} />
                    <Win10Button label="キャンセル" onClick={onCancel} />
                </div>
            </div>
        </div>
    );
};

// Windows 10 標準ボタン
const Win10Button: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button
        onClick={onClick}
        className={styles.win10Btn}
    >{label}</button>
);
