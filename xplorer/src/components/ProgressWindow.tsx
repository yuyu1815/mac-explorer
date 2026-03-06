import React, { useEffect, useState, useRef, useCallback } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export interface ProgressData {
    current_file: string;
    files_processed: number;
    total_files: number;
    bytes_processed: number;
    total_bytes: number;
    complete: boolean;
}

// 速度の人間可読フォーマット
const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec <= 0) return '0 bytes/秒';
    if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} bytes/秒`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/秒`;
    if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/秒`;
    return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/秒`;
};

// バイト数の人間可読フォーマット
const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return '0 bytes';
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// 残り時間の人間可読フォーマット
const formatTimeRemaining = (seconds: number): string => {
    if (!isFinite(seconds) || seconds <= 0) return '計算中...';
    if (seconds < 60) return `約 ${Math.ceil(seconds)} 秒`;
    if (seconds < 3600) {
        const m = Math.floor(seconds / 60);
        const s = Math.ceil(seconds % 60);
        return `約 ${m} 分 ${s} 秒`;
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.ceil((seconds % 3600) / 60);
    return `約 ${h} 時間 ${m} 分`;
};

// Windows 10風 速度グラフコンポーネント
const SpeedGraph: React.FC<{ speedHistory: number[] }> = ({ speedHistory }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // 背景
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, w, h);

        // グリッド横線
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const y = Math.round((h / 4) * i) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        if (speedHistory.length < 2) return;

        const maxSpeed = Math.max(...speedHistory, 1);
        const step = w / (60 - 1); // 60秒分のグラフ

        // 塗りつぶし領域（薄緑）
        ctx.beginPath();
        ctx.moveTo(0, h);
        speedHistory.forEach((speed, i) => {
            const x = i * step;
            const y = h - (speed / maxSpeed) * (h - 4);
            if (i === 0) ctx.lineTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.lineTo((speedHistory.length - 1) * step, h);
        ctx.closePath();
        ctx.fillStyle = 'rgba(6, 176, 37, 0.15)';
        ctx.fill();

        // 速度線（濃い緑）
        ctx.beginPath();
        ctx.strokeStyle = '#06b025';
        ctx.lineWidth = 1.5;
        speedHistory.forEach((speed, i) => {
            const x = i * step;
            const y = h - (speed / maxSpeed) * (h - 4);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 枠線
        ctx.strokeStyle = '#bcbcbc';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    }, [speedHistory]);

    return (
        <canvas
            ref={canvasRef}
            width={360}
            height={80}
            style={{ width: '100%', height: '80px', display: 'block' }}
        />
    );
};

import { InsufficientSpaceDialog } from './InsufficientSpaceDialog';

export const ProgressWindow: React.FC = () => {
    const [progress, setProgress] = useState<ProgressData | null>(null);
    const [title, setTitle] = useState('準備中...');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [insufficientSpace, setInsufficientSpace] = useState<{
        required: number; available: number; path: string;
    } | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [speedHistory, setSpeedHistory] = useState<number[]>([]);
    const [currentSpeed, setCurrentSpeed] = useState(0);
    const [timeRemaining, setTimeRemaining] = useState<string>('計算中...');

    const prevBytesRef = useRef(-1); // -1 = 未初期化
    const startTimeRef = useRef(Date.now());
    const speedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const progressRef = useRef<ProgressData | null>(null);
    const smoothedSpeedRef = useRef(0); // EMA用

    // progressが更新されるたびにrefも更新
    useEffect(() => {
        progressRef.current = progress;
    }, [progress]);

    // 毎秒の速度計算（一度だけ生成）
    useEffect(() => {
        speedTimerRef.current = setInterval(() => {
            const p = progressRef.current;
            if (!p || p.complete) return;

            const now = p.bytes_processed;

            // 初回は基準値を設定するだけ（巨大なスパイクを防止）
            if (prevBytesRef.current < 0) {
                prevBytesRef.current = now;
                return;
            }

            const rawDelta = Math.max(0, now - prevBytesRef.current);
            prevBytesRef.current = now;

            // EMA（指数移動平均）で速度を平滑化
            // α=0.3: 新しい値30% + 過去の平均70%
            const alpha = 0.3;
            smoothedSpeedRef.current = smoothedSpeedRef.current === 0
                ? rawDelta
                : alpha * rawDelta + (1 - alpha) * smoothedSpeedRef.current;

            const speed = Math.round(smoothedSpeedRef.current);
            setCurrentSpeed(speed);

            setSpeedHistory(prev => {
                const next = [...prev, speed];
                return next.length > 60 ? next.slice(-60) : next;
            });

            // 残り時間の推定（経過時間ベースの平均速度）
            const elapsed = (Date.now() - startTimeRef.current) / 1000;
            if (elapsed > 0 && p.total_bytes > 0 && p.bytes_processed > 0) {
                const avgSpeed = p.bytes_processed / elapsed;
                const remaining = p.total_bytes - p.bytes_processed;
                const estSeconds = remaining / avgSpeed;
                setTimeRemaining(formatTimeRemaining(estSeconds));
            }
        }, 1000);

        return () => {
            if (speedTimerRef.current) clearInterval(speedTimerRef.current);
        };
    }, []); // 空の依存配列 = 一度だけ生成

    useEffect(() => {
        const runProcess = async () => {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const action = urlParams.get('action');
                const rawPayload = urlParams.get('payload');
                if (!action || !rawPayload) {
                    throw new Error('必要なパラメータが不足しています');
                }

                const payload = JSON.parse(rawPayload);
                setTitle(action === 'compress' ? '圧縮しています...' : '展開しています...');
                startTimeRef.current = Date.now();

                const channel = new Channel<ProgressData>();
                channel.onmessage = (data) => {
                    setProgress(data);
                    if (data.complete) {
                        setTimeout(() => {
                            getCurrentWebviewWindow().close().catch(console.error);
                        }, 1000);
                    }
                };

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
                    setTimeout(() => {
                        getCurrentWebviewWindow().close().catch(console.error);
                    }, 1500);
                }
            } catch (err) {
                console.error('Process error:', err);
                const errStr = err instanceof Error ? err.message : String(err);
                // INSUFFICIENT_SPACE:required:available:path形式をパース
                if (errStr.includes('INSUFFICIENT_SPACE:')) {
                    const parts = errStr.split('INSUFFICIENT_SPACE:')[1].split(':');
                    if (parts.length >= 3) {
                        setInsufficientSpace({
                            required: parseInt(parts[0], 10),
                            available: parseInt(parts[1], 10),
                            path: parts.slice(2).join(':'),
                        });
                        return;
                    }
                }
                setErrorMsg(errStr);
            }
        };

        runProcess();
    }, []);

    // ウィンドウ高さの動的変更
    const updateWindowSize = useCallback(async (expanded: boolean) => {
        try {
            const win = getCurrentWebviewWindow();
            const newHeight = expanded ? 280 : 200;
            await win.setSize(new (await import('@tauri-apps/api/dpi')).LogicalSize(420, newHeight));
        } catch (e) {
            console.error('Failed to resize window:', e);
        }
    }, []);

    const toggleExpanded = () => {
        const next = !isExpanded;
        setIsExpanded(next);
        updateWindowSize(next);
    };

    // 進捗率の計算
    let percentage = 0;
    if (progress && progress.total_bytes > 0) {
        percentage = Math.floor((progress.bytes_processed / progress.total_bytes) * 100);
    } else if (progress && progress.total_files > 0) {
        percentage = Math.floor((progress.files_processed / progress.total_files) * 100);
    }
    if (percentage > 100) percentage = 100;

    // 容量不足ダイアログ
    if (insufficientSpace) {
        return (
            <InsufficientSpaceDialog
                driveName={insufficientSpace.path}
                requiredBytes={insufficientSpace.required}
                availableBytes={insufficientSpace.available}
                onRetry={() => {
                    setInsufficientSpace(null);
                    window.location.reload();
                }}
                onSkip={() => {
                    setInsufficientSpace(null);
                    getCurrentWebviewWindow().close().catch(console.error);
                }}
                onCancel={() => {
                    getCurrentWebviewWindow().close().catch(console.error);
                }}
            />
        );
    }

    // エラー画面
    if (errorMsg) {
        return (
            <div style={{
                width: '100%', height: '100vh',
                backgroundColor: '#f0f0f0',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
                display: 'flex', flexDirection: 'column',
                boxSizing: 'border-box',
                border: '1px solid #999',
            }}>
                <div data-tauri-drag-region style={{
                    height: '30px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 4px 0 8px',
                    userSelect: 'none',
                    backgroundColor: '#f0f0f0',
                }}>
                    <span data-tauri-drag-region style={{ fontSize: '12px', color: '#000' }}>エラー</span>
                    <button
                        onClick={() => getCurrentWebviewWindow().close().catch(console.error)}
                        style={{
                            width: '46px', height: '28px',
                            border: 'none', backgroundColor: 'transparent',
                            fontSize: '13px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#000',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e81123'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >✕</button>
                </div>
                <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{
                            width: '32px', height: '32px', flexShrink: 0,
                            borderRadius: '50%', backgroundColor: '#e81123',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: '18px', fontWeight: 'bold',
                        }}>✕</div>
                        <div>
                            <div style={{ fontSize: '13px', color: '#000', marginBottom: '4px', fontWeight: 600 }}>エラーが発生しました</div>
                            <div style={{ fontSize: '12px', color: '#333' }}>{errorMsg}</div>
                        </div>
                    </div>
                    <div style={{ marginTop: 'auto', textAlign: 'right' }}>
                        <button
                            onClick={() => getCurrentWebviewWindow().close().catch(console.error)}
                            style={{
                                padding: '5px 20px', fontSize: '12px',
                                backgroundColor: '#e1e1e1', border: '1px solid #adadad',
                                cursor: 'pointer', minWidth: '75px',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e5f1fb'; e.currentTarget.style.borderColor = '#0078d7'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#e1e1e1'; e.currentTarget.style.borderColor = '#adadad'; }}
                        >閉じる</button>
                    </div>
                </div>
            </div>
        );
    }

    // Windows 10風 プログレスUI
    return (
        <div style={{
            width: '100%', height: '100vh',
            backgroundColor: '#f0f0f0',
            display: 'flex', flexDirection: 'column',
            boxSizing: 'border-box',
            border: '1px solid #999',
            overflow: 'hidden',
        }}>
            {/* タイトルバー */}
            <div data-tauri-drag-region style={{
                height: '30px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 4px 0 8px',
                userSelect: 'none',
                backgroundColor: '#f0f0f0',
                borderBottom: '1px solid #dfdfdf',
            }}>
                <span data-tauri-drag-region style={{ fontSize: '12px', color: '#000', flex: 1 }}>{title}</span>
                <button
                    onClick={() => getCurrentWebviewWindow().close().catch(console.error)}
                    style={{
                        width: '46px', height: '28px',
                        border: 'none', backgroundColor: 'transparent',
                        fontSize: '13px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#000',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = '#e81123';
                        e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#000';
                    }}
                >✕</button>
            </div>

            {/* メインコンテンツ */}
            <div style={{
                flex: 1,
                padding: '12px 16px',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
            }}>
                {/* 進捗テキスト（上部） */}
                <div style={{ marginBottom: '6px', fontSize: '12px', color: '#333' }}>
                    {progress?.complete
                        ? '完了しました'
                        : `${percentage}% 完了`}
                </div>

                {/* プログレスバー or 速度グラフ（切替表示） */}
                {isExpanded ? (
                    <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#555', marginBottom: '4px' }}>転送速度</div>
                        <SpeedGraph speedHistory={speedHistory} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', marginTop: '2px' }}>
                            <span>60秒前</span>
                            <span>現在: {formatSpeed(currentSpeed)}</span>
                        </div>
                    </div>
                ) : (
                    <div style={{
                        height: '22px',
                        backgroundColor: '#e6e6e6',
                        border: '1px solid #bcbcbc',
                        position: 'relative',
                        marginBottom: '8px',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${percentage}%`,
                            backgroundColor: '#06b025',
                            transition: 'width 0.3s ease-out',
                            position: 'relative',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                position: 'absolute',
                                top: 0, left: 0, right: 0, bottom: 0,
                                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                                animation: 'shimmer 2s infinite linear',
                            }} />
                        </div>
                    </div>
                )}

                {/* 詳細情報 */}
                <div style={{ fontSize: '11px', color: '#555', lineHeight: '1.6', marginBottom: '8px' }}>
                    {progress ? (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>残り時間: {progress.complete ? '完了' : timeRemaining}</span>
                                <span>速度: {formatSpeed(currentSpeed)}</span>
                            </div>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                アイテム: {progress.current_file || '...'}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{formatBytes(progress.bytes_processed)} / {formatBytes(progress.total_bytes)}</span>
                                <span>項目: {progress.files_processed.toLocaleString()} / {progress.total_files.toLocaleString()}</span>
                            </div>
                        </>
                    ) : (
                        <div>対象を計算しています...</div>
                    )}
                </div>

                {/* 詳細の表示/キャンセルボタン */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={toggleExpanded}
                        style={{
                            padding: '3px 12px', fontSize: '11px',
                            backgroundColor: '#e1e1e1', border: '1px solid #adadad',
                            cursor: 'pointer', minWidth: '70px',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e5f1fb'; e.currentTarget.style.borderColor = '#0078d7'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#e1e1e1'; e.currentTarget.style.borderColor = '#adadad'; }}
                    >
                        {isExpanded ? '▲ 詳細を非表示' : '▼ 詳細の表示'}
                    </button>
                    <button
                        onClick={() => getCurrentWebviewWindow().close().catch(console.error)}
                        style={{
                            padding: '3px 16px', fontSize: '11px',
                            backgroundColor: '#e1e1e1', border: '1px solid #adadad',
                            cursor: 'pointer', minWidth: '75px',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e5f1fb'; e.currentTarget.style.borderColor = '#0078d7'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#e1e1e1'; e.currentTarget.style.borderColor = '#adadad'; }}
                    >キャンセル</button>
                </div>
            </div>

            {/* CSS for shimmer animation */}
            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(200%); }
                }
            `}</style>
        </div>
    );
};
