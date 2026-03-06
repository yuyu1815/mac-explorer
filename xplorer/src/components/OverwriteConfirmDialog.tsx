import React from 'react';
import { useAppStore } from '../stores/appStore';
import '../styles/global.css';

// Windows 10 の「ファイルの置換またはスキップ」ダイアログ
export const OverwriteConfirmDialog: React.FC = () => {
    const { overwriteConfirm, resolveOverwrite } = useAppStore();

    if (!overwriteConfirm) return null;

    const { targetFile } = overwriteConfirm;
    const fileName = targetFile.split('/').pop() || targetFile;

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw', height: '100vh',
            backgroundColor: 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                backgroundColor: '#f0f0f0',
                border: '1px solid #999',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                width: '470px',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* ヘッダー（ドラッグ不要、モーダルのため） */}
                <div style={{
                    padding: '20px 20px 0 20px',
                }}>
                    <div style={{ fontSize: '15px', color: '#003399', fontWeight: 400, marginBottom: '16px' }}>
                        ファイルの置換またはスキップ
                    </div>
                    <div style={{ fontSize: '12px', color: '#333', marginBottom: '4px' }}>
                        宛先には「<strong>{fileName}</strong>」という名前のファイルが既に存在します。
                    </div>
                </div>

                {/* 選択肢 */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {/* 置換 */}
                    <OptionButton
                        icon="📄➡️📄"
                        title="宛先のファイルを置き換える"
                        description="元のファイルは上書きされます"
                        onClick={() => resolveOverwrite(true)}
                    />

                    {/* スキップ */}
                    <OptionButton
                        icon="⏭️"
                        title="このファイルをスキップする"
                        description="宛先のファイルはそのまま残ります"
                        onClick={() => resolveOverwrite(false)}
                    />
                </div>

                {/* フッター */}
                <div style={{
                    padding: '10px 20px',
                    backgroundColor: '#e8e8e8',
                    borderTop: '1px solid #d0d0d0',
                    display: 'flex', justifyContent: 'flex-end',
                }}>
                    <button
                        onClick={() => resolveOverwrite(false)}
                        style={{
                            padding: '5px 20px', fontSize: '12px',
                            backgroundColor: '#e1e1e1', border: '1px solid #adadad',
                            cursor: 'pointer', minWidth: '80px',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e5f1fb'; e.currentTarget.style.borderColor = '#0078d7'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#e1e1e1'; e.currentTarget.style.borderColor = '#adadad'; }}
                    >キャンセル</button>
                </div>
            </div>
        </div>
    );
};

// 選択肢ボタン
const OptionButton: React.FC<{
    icon: string;
    title: string;
    description: string;
    onClick: () => void;
}> = ({ icon, title, description, onClick }) => {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'flex-start', gap: '12px',
                padding: '10px 12px',
                backgroundColor: 'transparent', border: '1px solid transparent',
                cursor: 'pointer', textAlign: 'left',
                transition: 'background-color 0.1s',
                width: '100%',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#e5f1fb';
                e.currentTarget.style.borderColor = '#99d1ff';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
            }}
        >
            <span style={{ fontSize: '20px', flexShrink: 0, marginTop: '0px' }}>{icon}</span>
            <div>
                <div style={{ fontSize: '13px', color: '#003399', marginBottom: '2px' }}>{title}</div>
                <div style={{ fontSize: '11px', color: '#777' }}>{description}</div>
            </div>
        </button>
    );
};
