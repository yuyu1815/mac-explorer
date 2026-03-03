import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { ExternalLink, Scissors, Copy, Edit2, Trash2 } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    targetPath: string | null;
    onClose: () => void;
    onStartRename: (path: string) => void;
    onCreateFolder: () => void;
}

export const ContextMenu = ({ x, y, targetPath, onClose, onStartRename, onCreateFolder }: ContextMenuProps) => {
    const { tabs, activeTabId, setFiles, setClipboard, clipboard } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const currentPath = activeTab?.currentPath || '';
    const selectedFiles = activeTab?.selectedFiles || new Set<string>();

    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleAction = async (action: () => Promise<void> | void) => {
        await action();
        onClose();
    };

    const refreshFiles = async () => {
        const result = await invoke('list_directory', { path: currentPath, showHidden: false });
        setFiles(result as any);
    };

    const menuStyle = {
        position: 'fixed' as const,
        top: `${y}px`,
        left: `${x}px`,
        backgroundColor: 'var(--bg-main)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '4px 0',
        minWidth: '200px',
        zIndex: 1000,
        fontSize: '13px'
    };

    const itemStyle = {
        padding: '6px 16px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: 'var(--text-main)'
    };

    // 空白右クリック
    if (!targetPath) {
        return (
            <div ref={menuRef} style={menuStyle}>
                <div
                    style={itemStyle}
                    onClick={() => handleAction(async () => {
                        await onCreateFolder();
                    })}
                >
                    📁 新規フォルダー
                </div>
                <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                <div
                    style={{ ...itemStyle, opacity: clipboard !== null ? 1 : 0.5 }}
                    onClick={() => {
                        if (clipboard) {
                            handleAction(async () => {
                                if (clipboard.operation === 'copy') {
                                    await invoke('copy_files', { sources: clipboard.files, dest: currentPath });
                                } else {
                                    await invoke('move_files', { sources: clipboard.files, dest: currentPath });
                                    setClipboard(null);
                                }
                                await refreshFiles();
                            });
                        }
                    }}
                >
                    📋 貼り付け
                </div>
            </div>
        );
    }

    // ファイル/フォルダ右クリック
    const isMultiple = selectedFiles.size > 1;
    const pathsToActOn: string[] = (targetPath && selectedFiles.has(targetPath)) ? Array.from(selectedFiles) : targetPath ? [targetPath] : [];

    return (
        <div ref={menuRef} style={menuStyle}>
            {!isMultiple && (
                <div
                    style={itemStyle}
                    onClick={() => handleAction(async () => {
                        if (targetPath) {
                            await invoke('open_file_default', { path: targetPath });
                        }
                    })}
                >
                    <ExternalLink size={14} style={{ marginRight: '8px' }} /> 開く
                </div>
            )}
            <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
            <div
                style={itemStyle}
                onClick={() => handleAction(() => {
                    setClipboard({ files: pathsToActOn, operation: 'cut' });
                })}
            >
                <Scissors size={14} style={{ marginRight: '8px' }} /> 切り取り
            </div>
            <div
                style={itemStyle}
                onClick={() => handleAction(() => {
                    setClipboard({ files: pathsToActOn, operation: 'copy' });
                })}
            >
                <Copy size={14} style={{ marginRight: '8px' }} /> コピー
            </div>
            <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
            {!isMultiple && (
                <div
                    style={itemStyle}
                    onClick={() => handleAction(() => {
                        if (targetPath) {
                            onStartRename(targetPath);
                        }
                    })}
                >
                    <Edit2 size={14} style={{ marginRight: '8px' }} /> 名前変更
                </div>
            )}
            <div
                style={itemStyle}
                onClick={() => handleAction(async () => {
                    if (confirm(`選択した${pathsToActOn.length}項目をゴミ箱に移動しますか？`)) {
                        await invoke('delete_files', { paths: pathsToActOn, toTrash: true });
                        await refreshFiles();
                    }
                })}
            >
                <Trash2 size={14} style={{ marginRight: '8px' }} /> 削除
            </div>
        </div>
    );
};
