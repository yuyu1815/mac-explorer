import { useState, useEffect, useRef } from 'react';
import { Channel } from '@tauri-apps/api/core';

export interface ProgressData {
    current_file: string;
    files_processed: number;
    total_files: number;
    bytes_processed: number;
    total_bytes: number;
    speed: number;
    eta: number;
    complete: boolean;
}

export const useProgress = () => {
    const [progress, setProgress] = useState<ProgressData | null>(null);
    const channelRef = useRef(new Channel<ProgressData>());

    useEffect(() => {
        const channel = channelRef.current;
        channel.onmessage = (data) => {
            setProgress(data);
        };
        // Cleanup is handled by Tauri Channel
    }, []);

    const formatSpeed = (bytesPerSec: number): string => {
        if (bytesPerSec <= 0) return '0 bytes/s';
        if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} bytes/s`;
        if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
        if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
        return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
    };

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

    return {
        progress,
        setProgress,
        channel: channelRef.current,
        formatSpeed,
        formatTimeRemaining
    };
};
