import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const useFileOperations = (refreshFiles: () => void) => {
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    const handleRename = useCallback(async (path: string, newName: string) => {
        try {
            await invoke('rename_file', { path, newName });
            setRenamingPath(null);
            refreshFiles();
        } catch (err) {
            console.error('Rename failed:', err);
            alert(`リネームに失敗しました: ${err}`);
        }
    }, [refreshFiles]);

    const handleCreateDirectory = useCallback(async (path: string) => {
        try {
            await invoke('create_directory', { path });
            refreshFiles();
        } catch (err) {
            console.error('Create directory failed:', err);
            alert(`ディレクトリの作成に失敗しました: ${err}`);
        }
    }, [refreshFiles]);

    const handleDelete = useCallback(async (paths: string[], toTrash: boolean = true) => {
        try {
            await invoke('delete_files', { paths, toTrash });
            refreshFiles();
        } catch (err) {
            console.error('Delete failed:', err);
            alert(`削除に失敗しました: ${err}`);
        }
    }, [refreshFiles]);

    const handleBatchRename = useCallback(async (paths: string[], newNames: string[]) => {
        try {
            await invoke('batch_rename', { paths, newNames });
            refreshFiles();
        } catch (err) {
            console.error('Batch rename failed:', err);
            alert(`一括リネームに失敗しました: ${err}`);
        }
    }, [refreshFiles]);

    return {
        renamingPath,
        setRenamingPath,
        renameValue,
        setRenameValue,
        handleRename,
        handleCreateDirectory,
        handleDelete,
        handleBatchRename
    };
};
