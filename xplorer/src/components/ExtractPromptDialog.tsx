import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { invoke } from '@tauri-apps/api/core';

export const ExtractPromptDialog: React.FC = () => {
    const extractPrompt = useAppStore(state => state.extractPrompt);
    const resolveExtract = useAppStore(state => state.resolveExtract);
    const [destPath, setDestPath] = useState('');
    const [showFiles, setShowFiles] = useState(true);

    useEffect(() => {
        if (extractPrompt) {
            setDestPath(extractPrompt.defaultDestPath);
            setShowFiles(true);
        }
    }, [extractPrompt]);

    if (!extractPrompt) return null;

    const handleBrowse = async () => {
        try {
            const selected = await invoke<string | null>('select_directory');
            if (selected) {
                setDestPath(selected);
            }
        } catch (error) {
            console.error('Failed to select directory:', error);
        }
    };

    const handleExtract = () => {
        resolveExtract({ destPath, showFiles });
    };

    const handleCancel = () => {
        resolveExtract(null);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
        }}>
            <div style={{
                width: '500px',
                backgroundColor: '#ffffff',
                border: '1px solid #005A9E',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
                color: '#000000',
            }}>
                {/* タイトルバー */}
                <div style={{
                    backgroundColor: '#ffffff',
                    padding: '8px 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid #f0f0f0',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>📁</span>
                        <span style={{ fontSize: '12px', color: '#000' }}>圧縮 (ZIP 形式) フォルダーの展開</span>
                    </div>
                    <button
                        onClick={handleCancel}
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
                <div style={{ padding: '20px 24px', backgroundColor: '#ffffff', flex: 1 }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 'normal', color: '#003399', marginTop: 0, marginBottom: '24px' }}>
                        展開先の選択とファイルの展開
                    </h2>

                    <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                        ファイルを下のフォルダーに展開する(F):
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                        <input
                            type="text"
                            value={destPath}
                            onChange={(e) => setDestPath(e.target.value)}
                            style={{
                                flex: 1,
                                padding: '4px 8px',
                                fontSize: '12px',
                                border: '1px solid #8e8f8f',
                                outline: 'none',
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.borderColor = '#0078d7';
                                e.currentTarget.style.boxShadow = '0 0 0 1px #0078d7';
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.borderColor = '#8e8f8f';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        />
                        <button
                            onClick={handleBrowse}
                            style={{
                                padding: '4px 16px',
                                fontSize: '12px',
                                backgroundColor: '#e1e1e1',
                                border: '1px solid #adadad',
                                cursor: 'pointer',
                                minWidth: '80px',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e5f1fb'; e.currentTarget.style.borderColor = '#0078d7'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#e1e1e1'; e.currentTarget.style.borderColor = '#adadad'; }}
                        >参照(R)...</button>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={showFiles}
                            onChange={(e) => setShowFiles(e.target.checked)}
                        />
                        完了時に展開されたファイルを表示する(H)
                    </label>
                </div>

                {/* フッター */}
                <div style={{
                    backgroundColor: '#f0f0f0',
                    padding: '12px 24px',
                    display: 'flex', justifyContent: 'flex-end', gap: '8px',
                    borderTop: '1px solid #dfdfdf',
                }}>
                    <button
                        onClick={handleExtract}
                        style={{
                            padding: '4px 24px',
                            fontSize: '12px',
                            backgroundColor: '#e1e1e1',
                            border: '1px solid #adadad',
                            cursor: 'pointer',
                            minWidth: '80px',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e5f1fb'; e.currentTarget.style.borderColor = '#0078d7'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#e1e1e1'; e.currentTarget.style.borderColor = '#adadad'; }}
                    >展開(E)</button>
                    <button
                        onClick={handleCancel}
                        style={{
                            padding: '4px 24px',
                            fontSize: '12px',
                            backgroundColor: '#e1e1e1',
                            border: '1px solid #adadad',
                            cursor: 'pointer',
                            minWidth: '80px',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e5f1fb'; e.currentTarget.style.borderColor = '#0078d7'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#e1e1e1'; e.currentTarget.style.borderColor = '#adadad'; }}
                    >キャンセル</button>
                </div>
            </div>
        </div>
    );
};
