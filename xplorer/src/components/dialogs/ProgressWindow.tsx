import React, { useEffect, useState, useRef, useCallback } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { InsufficientSpaceDialog } from './InsufficientSpaceDialog';
import styles from '@/styles/components/dialogs/ProgressWindow.module.css';

export interface ProgressData {
    current_file: string;
    files_processed: number;
    total_files: number;
    bytes_processed: number;
    bytes_processed_formatted: string;
    total_bytes: number;
    total_bytes_formatted: string;
    speed: number;
    speed_formatted: string;
    eta: number;
    eta_formatted: string;
    progress_percent: number;
    complete: boolean;
}

// Windows 10風 グラフ一体型プログレスバー
const IntegratedSpeedGraph: React.FC<{
    speedHistory: number[];
    percentage: number; // 0 to 100
    currentSpeedText: string;
}> = ({ speedHistory, percentage, currentSpeedText }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // 背景 (ダークグレー)
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, w, h);

        // グリッド線 (マス目)
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;

        // 横線
        for (let i = 1; i < 4; i++) {
            const y = Math.round((h / 4) * i) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        // 縦線
        for (let i = 1; i < 10; i++) {
            const x = Math.round((w / 10) * i) + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }

        const currentX = (percentage / 100) * w;
        if (currentX <= 0) return;

        // --- 塗りつぶし領域（プログレスバー部分: 水色） ---
        // 速度グラフを描画するが、グラフの横幅は0からcurrentXまで
        ctx.beginPath();
        ctx.moveTo(0, h);

        const maxSpeed = Math.max(...speedHistory, 1);
        const step = currentX / Math.max(speedHistory.length - 1, 1);

        let lastY = h;

        speedHistory.forEach((speed, i) => {
            const x = i * step;
            // 高さの計算 (下部20%〜100%の範囲に収める)
            const y = h - (speed / maxSpeed) * (h * 0.8) - (h * 0.1);
            if (i === 0) ctx.lineTo(x, y);
            else ctx.lineTo(x, y);
            lastY = y;
        });

        // 右下の角へ
        ctx.lineTo(currentX, h);
        ctx.closePath();

        ctx.fillStyle = '#60cdff'; // Windows 10/11 Progress Light Blue
        ctx.fill();

        // 速度レベルを示す白い横線 (0%から100%まで)
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.moveTo(0, lastY);
        ctx.lineTo(w, lastY);
        ctx.stroke();

        // 速度テキストの描画 (白い線の少し上、右寄せ)
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`速度: ${currentSpeedText}`, w - 8, lastY - 4);

        // 枠線
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    }, [speedHistory, percentage, currentSpeedText]);

    return (
        <canvas
            ref={canvasRef}
            width={460}
            height={70}
            className={styles.canvas}
        />
    );
};

export const ProgressWindow: React.FC = () => {
    const [progress, setProgress] = useState<ProgressData | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [insufficientSpace, setInsufficientSpace] = useState<{
        required: number; available: number; path: string;
    } | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [speedHistory, setSpeedHistory] = useState<number[]>([]);
    const [isPaused, setIsPaused] = useState(false);

    // ExtractPromptのpayload用
    const [actionInfo, setActionInfo] = useState<{ action: string, dest: string }>({ action: 'コピー', dest: '' });

    const startTimeRef = useRef(Date.now());
    const speedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const progressRef = useRef<ProgressData | null>(null);
    const isPausedRef = useRef(false);

    const togglePause = () => {
        setIsPaused(prev => {
            const next = !prev;
            isPausedRef.current = next;
            // Rust側に通知
            if (next) {
                invoke('pause_operation').catch(console.error);
            } else {
                invoke('resume_operation').catch(console.error);
            }
            return next;
        });
    };

    useEffect(() => {
        progressRef.current = progress;
    }, [progress]);

    useEffect(() => {
        speedTimerRef.current = setInterval(() => {
            if (isPausedRef.current) return; // 一時停止中はスキップ
            const p = progressRef.current;
            if (!p || p.complete) return;

            // Use backend's speed for the graph history
            const speed = p.speed;
            setSpeedHistory(prev => {
                const next = [...prev, speed];
                return next.length > 100 ? next.slice(-100) : next; // 0.2s * 100 = 20s分を表示
            });
        }, 200);

        return () => {
            if (speedTimerRef.current) clearInterval(speedTimerRef.current);
        };
    }, []);

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
                const actionText = action === 'compress' ? '圧縮' : '展開';
                setActionInfo({ action: actionText, dest: payload.destDir || '...' });
                startTimeRef.current = Date.now();

                const channel = new Channel<ProgressData>();
                channel.onmessage = (data) => {
                    setProgress(data);
                    if (data.complete) {
                        setTimeout(() => {
                            // 完了後に開くオプション
                            if (payload.showFiles && payload.destDir) {
                                emit('navigate_to_dir', { path: payload.destDir }).catch(console.error);
                            }
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
                        // 完了後に開くオプション
                        if (payload.showFiles && payload.destDir) {
                            emit('navigate_to_dir', { path: payload.destDir }).catch(console.error);
                        }
                        getCurrentWebviewWindow().close().catch(console.error);
                    }, 1500);
                }
            } catch (err) {
                console.error('Process error:', err);
                const errStr = err instanceof Error ? err.message : String(err);
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

    const updateWindowSize = useCallback(async (expanded: boolean) => {
        try {
            const win = getCurrentWebviewWindow();
            const newHeight = expanded ? 350 : 160;
            await win.setSize(new (await import('@tauri-apps/api/dpi')).LogicalSize(500, newHeight));
        } catch (e) {
            console.error('Failed to resize window:', e);
        }
    }, []);

    // 初回マウント時にサイズ設定
    useEffect(() => {
        updateWindowSize(isExpanded);
    }, []);

    const toggleExpanded = () => {
        const next = !isExpanded;
        setIsExpanded(next);
        updateWindowSize(next);
    };

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
                    setErrorMsg('空き容量不足のため処理をスキップしました');
                }}
                onCancel={() => getCurrentWebviewWindow().close().catch(console.error)}
            />
        );
    }

    if (errorMsg) {
        return (
            <div className={styles.errorContainer}>
                <h3 className={styles.errorTitle}>エラーが発生しました</h3>
                <p>{errorMsg}</p>
                <button onClick={() => getCurrentWebviewWindow().close()} className={styles.errorBtn}>
                    閉じる
                </button>
            </div>
        );
    }

    const percentage = progress && progress.total_bytes > 0
        ? Math.floor((progress.bytes_processed / progress.total_bytes) * 100)
        : 0;

    return (
        <div data-tauri-drag-region className={styles.container}>
            {/* タイトルバー */}
            <div data-tauri-drag-region className={styles.titleBar}>
                <div data-tauri-drag-region className={styles.titleLeft}>
                    <span className={styles.titleIcon}>🕒</span>
                    <span className={styles.titleText}>{isPaused ? '一時停止' : (progress?.complete ? '完了' : `${percentage}% 完了`)}</span>
                </div>
                <div className={styles.titleButtons}>
                    <button className={`${styles.titleBtn} ${styles.titleBtnMinimize}`}>_</button>
                    <button className={`${styles.titleBtn} ${styles.titleBtnMaximize}`}>☐</button>
                    <button
                        onClick={async () => {
                            await invoke('cancel_operation').catch(console.error);
                            getCurrentWebviewWindow().close().catch(console.error);
                        }}
                        className={`${styles.titleBtn} ${styles.titleBtnClose}`}
                    >✕</button>
                </div>
            </div>

            {/* メインコンテンツ */}
            <div className={styles.mainContent}>

                {/* サブタイトル */}
                <div className={styles.subtitle}>
                    {progress?.total_files || 0} 個の項目を{actionInfo.action}中: {progress?.current_file ? '...' : ''} から {actionInfo.dest}
                </div>

                {/* 大ヘッダー */}
                <div className={styles.header}>
                    <div className={styles.percentageText}>
                        {progress?.complete ? '100% 完了' : `${percentage}% 完了`}
                    </div>
                    <div className={styles.headerButtons}>
                        <button
                            onClick={togglePause}
                            className={styles.headerBtn}
                        >{isPaused ? '▶' : '⏸'}</button>
                        <button
                            onClick={async () => {
                                await invoke('cancel_operation').catch(console.error);
                                getCurrentWebviewWindow().close().catch(console.error);
                            }}
                            className={`${styles.headerBtn} ${styles.headerBtnClose}`}
                        >✕</button>
                    </div>
                </div>

                {/* グラフ ＆ 詳細 (展開時のみ) */}
                {isExpanded ? (
                    <div className={styles.detailsContainer}>
                        <IntegratedSpeedGraph
                            speedHistory={speedHistory}
                            percentage={percentage}
                            currentSpeedText={progress?.speed_formatted || '0 B/s'}
                        />

                        <div className={styles.detailsInfo}>
                            <div className={styles.infoItem}>
                                名前: {progress?.current_file || '...'}
                            </div>
                            <div>
                                残り時間: {progress?.complete ? '完了' : (progress?.eta_formatted || '計算中...')}
                            </div>
                            <div>
                                残りの項目: {progress ? (progress.total_files - progress.files_processed).toLocaleString() : 0} ({progress?.bytes_processed_formatted || '0 B'} / {progress?.total_bytes_formatted || '0 B'})
                            </div>
                        </div>
                    </div>
                ) : (
                    /* 非展開時は標準のプログレスバーのみ */
                    <div className={styles.simpleProgressBar}>
                        <div className={styles.simpleProgressFill} style={{ width: `${percentage}%` }} />
                    </div>
                )}
            </div>

            {/* アコーディオン フッター */}
            <div
                onClick={toggleExpanded}
                className={styles.accordionFooter}
            >
                <span>{isExpanded ? '⌃' : '⌄'}</span>
                <span>詳細情報の{isExpanded ? '非表示' : '表示'}</span>
            </div>
        </div>
    );
};
