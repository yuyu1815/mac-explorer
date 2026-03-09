import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '@/types';

export const useNavigationBar = (currentPath: string) => {
    const [inputValue, setInputValue] = useState(currentPath);
    const [suggestions, setSuggestions] = useState<FileEntry[]>([]);

    useEffect(() => {
        setInputValue(currentPath);
    }, [currentPath]);

    const handleInputChange = useCallback(async (value: string) => {
        setInputValue(value);
        if (value.includes('/')) {
            const lastSlashIndex = value.lastIndexOf('/');
            const dirPath = value.substring(0, lastSlashIndex) || '/';
            const prefix = value.substring(lastSlashIndex + 1);
            try {
                const result = await invoke<FileEntry[]>('complete_path', {
                    dirPath,
                    prefix,
                    showHidden: false
                });
                setSuggestions(result);
            } catch (e) {
                setSuggestions([]);
            }
        } else {
            setSuggestions([]);
        }
    }, []);

    const breadcrumbs = currentPath === 'this-pc'
        ? [{ name: 'PC', path: 'this-pc' }]
        : currentPath.split('/').filter(Boolean).reduce((acc, curr, idx, arr) => {
            const path = '/' + arr.slice(0, idx + 1).join('/');
            acc.push({ name: curr, path });
            return acc;
        }, [] as { name: string, path: string }[]);

    return {
        inputValue,
        setInputValue,
        suggestions,
        setSuggestions,
        handleInputChange,
        breadcrumbs
    };
};
