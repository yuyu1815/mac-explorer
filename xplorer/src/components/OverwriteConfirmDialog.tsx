import React from 'react';
import { useAppStore } from '../stores/appStore';
import { CopyIcon, ArrowRight } from 'lucide-react';
import '../styles/global.css';

export const OverwriteConfirmDialog: React.FC = () => {
    const { overwriteConfirm, resolveOverwrite } = useAppStore();

    if (!overwriteConfirm) return null;

    const { targetFile } = overwriteConfirm;

    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                width: '450px',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{ padding: '24px 24px 16px 24px' }}>
                    <h2 style={{ fontSize: '18px', color: '#003399', fontWeight: 400, margin: '0 0 16px 0' }}>
                        ファイルの置換またはスキップ
                    </h2>
                    <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-main)' }}>
                        宛先にはすでに同じ名前のファイルが存在します。
                    </p>
                    <p style={{ margin: '0 0 20px 0', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main)', wordBreak: 'break-all' }}>
                        {targetFile}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button
                            onClick={() => resolveOverwrite(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                padding: '12px 16px',
                                backgroundColor: 'transparent',
                                border: '1px solid transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'background-color 0.1s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--selected-bg)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <CopyIcon size={24} color="#0078d7" style={{ marginTop: '2px' }} />
                            <div>
                                <div style={{ fontSize: '14px', color: '#003399', marginBottom: '4px' }}>宛先のファイルを置き換える</div>
                            </div>
                        </button>

                        <button
                            onClick={() => resolveOverwrite(false)}
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                padding: '12px 16px',
                                backgroundColor: 'transparent',
                                border: '1px solid transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'background-color 0.1s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--selected-bg)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <ArrowRight size={24} color="#0078d7" style={{ marginTop: '2px' }} />
                            <div>
                                <div style={{ fontSize: '14px', color: '#003399', marginBottom: '4px' }}>このファイルをスキップする</div>
                            </div>
                        </button>
                    </div>
                </div>

                <div style={{
                    padding: '12px 24px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        onClick={() => resolveOverwrite(false)}
                        style={{
                            padding: '4px 16px',
                            minWidth: '80px',
                            backgroundColor: '#e1e1e1',
                            border: '1px solid #adadad',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = '#e5f1fb';
                            e.currentTarget.style.borderColor = '#0078d7';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = '#e1e1e1';
                            e.currentTarget.style.borderColor = '#adadad';
                        }}
                    >
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
    );
};
