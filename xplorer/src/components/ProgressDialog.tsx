import React from 'react';
import { useAppStore } from '../stores/appStore';
import { X } from 'lucide-react';

export const ProgressDialog: React.FC = () => {
    const { progressDialog, closeProgressDialog } = useAppStore();

    if (!progressDialog || !progressDialog.isOpen) return null;

    const { title, progress } = progressDialog;

    // 進捗率の計算
    let percentage = 0;
    if (progress && progress.total_bytes > 0) {
        percentage = Math.floor((progress.bytes_processed / progress.total_bytes) * 100);
    } else if (progress && progress.total_files > 0) {
        percentage = Math.floor((progress.files_processed / progress.total_files) * 100);
    }

    // Windows風のオーバーレイ
    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.2)', // Slightly dim background
            zIndex: 9999,
        }}>
            <div style={{
                width: '400px',
                backgroundColor: 'var(--bg-main, #ffffff)',
                border: '1px solid var(--border-color, #cccccc)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {/* Windows 10/11 Window Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    fontSize: '12px',
                    backgroundColor: 'var(--bg-main, #ffffff)',
                }}>
                    <span>{title}</span>
                    <div
                        onClick={closeProgressDialog}
                        style={{ cursor: 'pointer', padding: '2px 4px' }}
                    >
                        <X size={14} color="var(--text-main, #000)" />
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 24px', backgroundColor: '#f0f0f0' }}>
                    <div style={{ marginBottom: '16px', fontSize: '14px', color: '#003399' }}>
                        {progress?.complete ? '完了しました' : `${percentage}% 完了`}
                    </div>

                    {/* Progress Bar Container */}
                    <div style={{
                        height: '18px',
                        backgroundColor: '#e6e6e6',
                        border: '1px solid #bcbcbc',
                        position: 'relative',
                        marginBottom: '16px',
                        overflow: 'hidden'
                    }}>
                        {/* Progress Bar Value */}
                        <div style={{
                            height: '100%',
                            width: `${percentage}%`,
                            backgroundColor: '#06b025', // Windows green progress color
                            transition: 'width 0.2s ease-out'
                        }} />
                    </div>

                    <div style={{ fontSize: '12px', color: '#333', minHeight: '40px', lineHeight: '1.4' }}>
                        {progress && (
                            <>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    アイテム: {progress.current_file || '...'}
                                </div>
                                <div>
                                    完了したアイテム: {progress.files_processed.toLocaleString()} / {progress.total_files.toLocaleString()}
                                </div>
                            </>
                        )}
                        {!progress && <div>準備中...</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};
