import React from 'react';

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
        <div style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                backgroundColor: '#f0f0f0',
                border: '1px solid #999',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                width: '420px',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* ヘッダー */}
                <div style={{
                    padding: '20px 20px 12px 20px',
                    display: 'flex', alignItems: 'flex-start', gap: '14px',
                }}>
                    {/* 警告アイコン */}
                    <div style={{
                        width: '32px', height: '32px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '28px',
                    }}>⚠️</div>
                    <div>
                        <div style={{ fontSize: '13px', color: '#000', fontWeight: 600, marginBottom: '8px' }}>
                            {driveName} に十分な空き領域がありません
                        </div>
                        <div style={{ fontSize: '12px', color: '#333', lineHeight: '1.5' }}>
                            この操作を完了するには、さらに <strong>{formatBytes(deficit)}</strong> の空き領域が必要です。
                        </div>
                        <div style={{ fontSize: '11px', color: '#777', marginTop: '8px', lineHeight: '1.4' }}>
                            必要な空き領域: {formatBytes(requiredBytes)}<br />
                            利用可能な空き領域: {formatBytes(availableBytes)}
                        </div>
                    </div>
                </div>

                {/* フッター */}
                <div style={{
                    padding: '10px 20px',
                    backgroundColor: '#e8e8e8',
                    borderTop: '1px solid #d0d0d0',
                    display: 'flex', justifyContent: 'flex-end', gap: '8px',
                }}>
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
        style={{
            padding: '5px 16px', fontSize: '12px',
            backgroundColor: '#e1e1e1', border: '1px solid #adadad',
            cursor: 'pointer', minWidth: '75px',
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e5f1fb'; e.currentTarget.style.borderColor = '#0078d7'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#e1e1e1'; e.currentTarget.style.borderColor = '#adadad'; }}
    >{label}</button>
);
