import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FileEntry } from '@/types';
import { useAppStore } from '@/stores/appStore';

interface UseFileSystemProps {
    currentPath: string;
    showHidden: boolean;
    sortParams: {
        sortBy: string;
        sortDesc: boolean;
    };
    searchQuery: string;
}

export const useFileSystem = ({ currentPath, showHidden, sortParams, searchQuery }: UseFileSystemProps) => {
    const [files, setFilesLocal] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const setFilesGlobal = useAppStore(state => state.setFiles);

    // 頻繁な再取得を防ぐためのタイマー
    const refreshTimerRef = useRef<number | null>(null);

    const sortBy = sortParams.sortBy;
    const sortDesc = sortParams.sortDesc;

    const refreshFiles = useCallback(async () => {
        if (!currentPath || currentPath === 'this-pc') return;
        setLoading(true);
        setError(null);
        try {
            const result = await invoke<FileEntry[]>('list_files_sorted', {
                path: currentPath,
                showHidden,
                sortBy,
                sortDesc,
                searchQuery,
            });
            setFilesLocal(result);
            setFilesGlobal(result);
        } catch (err) {
            console.error('Failed to list files:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [currentPath, showHidden, sortBy, sortDesc, searchQuery, setFilesGlobal]);

    useEffect(() => {
        if (currentPath === 'this-pc') {
            setFilesLocal([]);
            setFilesGlobal([]);
            return;
        }
        refreshFiles();
    }, [refreshFiles, currentPath, setFilesGlobal]);

    // ファイルシステム監視のセットアップ
    useEffect(() => {
        if (!currentPath || currentPath === 'this-pc') return;

        // 監視対象を更新する
        invoke('watch_path', { path: currentPath }).catch(console.error);

        // バックエンドからの変更通知を待機
        let unlistenFunc: (() => void) | null = null;
        const listenPromise = listen('fs-change', (event) => {
            const payload = event.payload as { path: string };
            if (payload.path === currentPath) {
                if (refreshTimerRef.current) {
                    window.clearTimeout(refreshTimerRef.current);
                }
                refreshTimerRef.current = window.setTimeout(() => {
                    refreshFiles();
                    refreshTimerRef.current = null;
                }, 300);
            }
        });

        listenPromise.then(unlisten => {
            unlistenFunc = unlisten;
        });

        return () => {
            if (unlistenFunc) {
                unlistenFunc();
            } else {
                listenPromise.then(unlisten => unlisten());
            }
            if (refreshTimerRef.current) {
                window.clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [currentPath, refreshFiles]);

    return { files, loading, error, refreshFiles };
};
