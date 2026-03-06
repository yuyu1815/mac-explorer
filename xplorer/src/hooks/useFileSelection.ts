import { useState, useCallback, useRef } from 'react';
import { FileEntry } from '../types';
import { useAppStore } from '../stores/appStore';

export const useFileSelection = (files: FileEntry[]) => {
    // グローバル状態を使用
    const { tabs, activeTabId, setSelectedFiles, setFocusedIndex } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const selectedPaths = activeTab?.selectedFiles || new Set<string>();
    const lastSelectedIndex = activeTab?.focusedIndex ?? -1;

    // Marquee state
    const [marquee, setMarquee] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const toggleSelection = useCallback((path: string, multi: boolean, range: boolean, index: number) => {
        const next = new Set(multi ? selectedPaths : []);

        if (range && lastSelectedIndex !== -1) {
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);
            for (let i = start; i <= end; i++) {
                next.add(files[i].path);
            }
        } else if (multi) {
            if (next.has(path)) next.delete(path);
            else next.add(path);
        } else {
            next.add(path);
        }

        setSelectedFiles(next);
        setFocusedIndex(index);
    }, [files, lastSelectedIndex, selectedPaths, setSelectedFiles, setFocusedIndex]);

    const clearSelection = useCallback(() => {
        setSelectedFiles(new Set());
        setFocusedIndex(-1);
    }, [setSelectedFiles, setFocusedIndex]);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('.file-item')) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setMarquee({ x1: x, y1: y, x2: x, y2: y });

        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
            clearSelection();
        }
    }, [clearSelection]);

    const onMouseMove = useCallback((e: MouseEvent | React.MouseEvent) => {
        if (!marquee || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setMarquee(prev => prev ? { ...prev, x2: x, y2: y } : null);

        // Selection logic during marquee
        const xMin = Math.min(marquee.x1, x);
        const xMax = Math.max(marquee.x1, x);
        const yMin = Math.min(marquee.y1, y);
        const yMax = Math.max(marquee.y1, y);

        const newSelection = new Set(e.shiftKey || e.metaKey || e.ctrlKey ? selectedPaths : []);
        const fileElements = containerRef.current.querySelectorAll('.file-item');

        fileElements.forEach((el, index) => {
            const htmlEl = el as HTMLElement;
            const itemRect = {
                left: htmlEl.offsetLeft,
                top: htmlEl.offsetTop,
                right: htmlEl.offsetLeft + htmlEl.offsetWidth,
                bottom: htmlEl.offsetTop + htmlEl.offsetHeight
            };

            const intersects = !(itemRect.left > xMax ||
                itemRect.right < xMin ||
                itemRect.top > yMax ||
                itemRect.bottom < yMin);

            const path = files[index]?.path;
            if (path && intersects) {
                newSelection.add(path);
            }
        });

        setSelectedFiles(newSelection);
    }, [marquee, files, selectedPaths, setSelectedFiles]);

    const onMouseUp = useCallback(() => {
        setMarquee(null);
    }, []);

    return {
        selectedPaths,
        setSelectedFiles,
        toggleSelection,
        clearSelection,
        marquee,
        containerRef,
        onMouseDown,
        onMouseMove,
        onMouseUp
    };
};
