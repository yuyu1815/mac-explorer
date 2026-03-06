import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../types';

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
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refreshFiles = useCallback(async () => {
        if (!currentPath) return;
        setLoading(true);
        setError(null);
        try {
            const result = await invoke<FileEntry[]>('list_files_sorted', {
                path: currentPath,
                showHidden,
                sortBy: sortParams.sortBy,
                sortDesc: sortParams.sortDesc,
                searchQuery,
            });
            setFiles(result);
        } catch (err) {
            console.error('Failed to list files:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [currentPath, showHidden, sortParams, searchQuery]);

    useEffect(() => {
        refreshFiles();
    }, [refreshFiles]);

    return { files, loading, error, refreshFiles };
};
