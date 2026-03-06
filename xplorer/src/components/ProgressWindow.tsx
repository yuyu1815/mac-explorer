import React, { useEffect, useState } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
export interface ProgressData {
    current_file: string;
    files_processed: number;
    total_files: number;
    bytes_processed: number;
    total_bytes: number;
    complete: boolean;
}

export const ProgressWindow: React.FC = () => {
    const [progress, setProgress] = useState<ProgressData | null>(null);
    const [title, setTitle] = useState('準備中...');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        const runProcess = async () => {
            try {
                // クエリパラメータから引数をパース
                const urlParams = new URLSearchParams(window.location.search);
                const action = urlParams.get('action');
                const rawPayload = urlParams.get('payload');
                if (!action || !rawPayload) {
                    throw new Error('必要なパラメータが不足しています');
                }

                const payload = JSON.parse(rawPayload);
                setTitle(action === 'compress' ? '圧縮しています...' : '展開しています...');

                // 進捗受け取り用のChannelを作成
                const channel = new Channel<ProgressData>();
                channel.onmessage = (data) => {
                    setProgress(data);
                    // 進捗が完了フラグを受け取ったら早めに閉じる（invokeの終了を待たずにUI上は完了とする）
                    if (data.complete) {
                        setTimeout(() => {
                            getCurrentWindow().close();
                        }, 1000); // 1秒見せてから閉じる
                    }
                };

                // バックエンドへのコマンド呼び出し
                let invokeError = false;
                if (action === 'compress') {
                    const result = await invoke<{ errors: Array<{ file_path: string; message: string }> }>('compress_archive', {
                        ...payload,
                        channel,
                    });
                    if (result.errors.length > 0) {
                        invokeError = true;
                        setErrorMsg('いくつかのファイルで圧縮エラーが発生しました');
                    }
                } else if (action === 'extract') {
                    const result = await invoke<{ errors: string[] }>('extract_archive', {
                        ...payload,
                        channel,
                    });
                    if (result.errors.length > 0) {
                        invokeError = true;
                        setErrorMsg('解凍中にエラーが発生しました');
                    }
                }

                if (!invokeError) {
                    // 万が一Channelで閉じられなかった場合のバックアップ
                    setTimeout(() => {
                        getCurrentWindow().close();
                    }, 1500);
                }
            } catch (err) {
                console.error('Process error:', err);
                setErrorMsg(err instanceof Error ? err.message : String(err));
            }
        };

        runProcess();
    }, []);

    // 進捗率の計算
    let percentage = 0;
    if (progress && progress.total_bytes > 0) {
        percentage = Math.floor((progress.bytes_processed / progress.total_bytes) * 100);
    } else if (progress && progress.total_files > 0) {
        percentage = Math.floor((progress.files_processed / progress.total_files) * 100);
    }

    if (errorMsg) {
        return (
            <div style={{ padding: '20px', fontFamily: '"Segoe UI", sans-serif', color: 'red' }}>
                <h3>エラーが発生しました</h3>
                <p>{errorMsg}</p>
                <div style={{ marginTop: '20px', textAlign: 'right' }}>
                    <button onClick={() => getCurrentWindow().close()} style={{ padding: '4px 16px' }}>閉じる</button>
                </div>
            </div>
        );
    }

    // Windows風のプログレスUI
    return (
        <div style={{
            width: '100%', height: '100vh',
            backgroundColor: '#ffffff',
            display: 'flex', flexDirection: 'column',
            boxSizing: 'border-box',
            border: '1px solid #ccc',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            overflow: 'hidden'
        }}>
            {/* Draggable Title Bar */}
            <div data-tauri-drag-region style={{
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 8px 0 12px',
                userSelect: 'none',
                backgroundColor: '#ffffff',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
            }}>
                <span data-tauri-drag-region style={{ fontSize: '13px', color: '#000', flex: 1 }}>{title}</span>
                <button
                    onClick={() => getCurrentWindow().close()}
                    style={{
                        width: '32px', height: '32px',
                        border: 'none', backgroundColor: 'transparent',
                        fontSize: '16px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e81123'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    ✕
                </button>
            </div>

            <div style={{
                flex: 1,
                padding: '16px 24px 24px 24px',
                backgroundColor: '#f0f0f0',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
                display: 'flex', flexDirection: 'column',
                borderTop: '1px solid #dfdfdf'
            }}>
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
                        backgroundColor: '#06b025',
                        transition: 'width 0.2s ease-out'
                    }} />
                </div>

                <div style={{ fontSize: '12px', color: '#333', minHeight: '40px', lineHeight: '1.4' }}>
                    {progress ? (
                        <>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                アイテム: {progress.current_file || '...'}
                            </div>
                            <div>
                                完了したアイテム: {progress.files_processed.toLocaleString()} / {progress.total_files.toLocaleString()}
                            </div>
                        </>
                    ) : (
                        <div>対象を計算しています...</div>
                    )}
                </div>
            </div>
        </div>
    );
};
