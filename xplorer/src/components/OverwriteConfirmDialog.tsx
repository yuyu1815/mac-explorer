import React from 'react';
import { useAppStore } from '../stores/appStore';
import { Check, SkipForward } from 'lucide-react';
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
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)', // モーダルの背景
            zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid #005A9E', // Windows風の青枠線
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                width: '500px',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
                display: 'flex', flexDirection: 'column',
                color: '#000000',
            }}>
                {/* タイトルバー */}
                <div style={{
                    padding: '8px 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid #f0f0f0',
                }}>
                    <div style={{ fontSize: '12px', color: '#000' }}>ファイルの置換またはスキップ</div>
                    <button
                        onClick={() => resolveOverwrite(false)}
                        style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            fontSize: '14px', width: '24px', height: '24px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e81123'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#000'; }}
                    >✕</button>
                </div>

                {/* メインコンテンツ */}
                <div style={{ padding: '24px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 'normal', color: '#003399', marginTop: 0, marginBottom: '24px' }}>
                        宛先には既に "{fileName}" という名前のファイルが存在します。
                    </h2>

                    {/* 選択肢リスト */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {/* 置換ボタン */}
                        <OptionButton
                            icon={<Check size={28} strokeWidth={1.5} color="#0078D7" />}
                            title="宛先のファイルを置き換える(R)"
                            description="展開元のファイルで上書きします"
                            onClick={() => resolveOverwrite(true)}
                        />

                        {/* スキップボタン */}
                        <OptionButton
                            icon={<SkipForward size={28} strokeWidth={1.5} color="#0078D7" />}
                            title="このファイルをスキップする(S)"
                            description="宛先にあるファイルはそのまま残ります"
                            onClick={() => resolveOverwrite(false)}
                        />
                    </div>
                </div>

                {/* 下部チェックボックス（ダミーデザイン） */}
                <div style={{
                    padding: '12px 24px',
                    backgroundColor: '#f0f0f0',
                    borderTop: '1px solid #dfdfdf',
                    display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    <input type="checkbox" id="doForAll" />
                    <label htmlFor="doForAll" style={{ fontSize: '12px', cursor: 'pointer' }}>
                        すべてのコンフリクトで同じ処理を行う
                    </label>
                </div>
            </div>
        </div>
    );
};

// 選択肢ボタン
const OptionButton: React.FC<{
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick: () => void;
}> = ({ icon, title, description, onClick }) => {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'flex-start', gap: '16px',
                padding: '12px',
                backgroundColor: 'transparent', border: '1px solid transparent',
                cursor: 'pointer', textAlign: 'left',
                width: '100%',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#e5f1fb';
                e.currentTarget.style.borderColor = '#99d1ff'; // hover outer border
            }}
            onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
            }}
        >
            <div style={{ marginTop: '2px' }}>{icon}</div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', color: '#003399', marginBottom: '4px' }}>{title}</div>
                <div style={{ fontSize: '12px', color: '#555' }}>{description}</div>
            </div>
        </button>
    );
};
