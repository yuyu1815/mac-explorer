import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { ExternalLink, Scissors, Copy, Edit2, Trash2, FolderPlus, Clipboard, LayoutGrid, ArrowDownAZ, RefreshCw, Settings } from 'lucide-react';

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
        try {
            const sortBy = activeTab?.sortBy || 'name';
            const sortDesc = activeTab?.sortDesc || false;
            const searchQuery = activeTab?.searchQuery || '';
            const result = await invoke('list_files_sorted', { path: currentPath, showHidden: false, sortBy, sortDesc, searchQuery });
            setFiles(result as any);
        } catch (err) { }
    };

    const handleNewFile = async () => {
        try {
            const sep = currentPath.includes('\\') ? '\\' : '/';
            let newPath = currentPath.endsWith(sep) ? `${currentPath}新しいテキスト ドキュメント.txt` : `${currentPath}${sep}新しいテキスト ドキュメント.txt`;
            await invoke('create_file', { path: newPath });
            refreshFiles();
        } catch (err) { }
    };

    const isMultiple = selectedFiles.size > 1;
    const pathsToActOn: string[] = (targetPath && selectedFiles.has(targetPath)) ? Array.from(selectedFiles) : targetPath ? [targetPath] : [];

    return (
        <div ref={menuRef} className="win32-context-menu" style={{ top: y, left: x }}>
            {/* Background Gutter */}
            <div className="win32-ContextMenu-gutter"></div>

            {!targetPath ? (
                <>
                    {/* View Menu Mock */}
                    <ContextMenuItem icon={<LayoutGrid size={16} />} label="表示(V) >" onClick={() => { }} />
                    <ContextMenuSeparator />
                    {/* Sort Menu Mock */}
                    <ContextMenuItem icon={<ArrowDownAZ size={16} />} label="並び替え(O) >" onClick={() => { }} />
                    <ContextMenuSeparator />
                    <ContextMenuItem icon={<RefreshCw size={16} />} label="最新の情報に更新(E)" onClick={() => handleAction(refreshFiles)} />
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        icon={<Clipboard size={16} />}
                        label="貼り付け(P)"
                        disabled={!clipboard}
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
                    />
                    <ContextMenuSeparator />
                    <ContextSubMenuItem icon={<FolderPlus size={16} />} label="新規作成(W)">
                        <ContextMenuItem icon={<FolderPlus size={16} />} label="フォルダー(F)" onClick={() => handleAction(onCreateFolder)} />
                        <ContextMenuSeparator />
                        <ContextMenuItem icon={<Edit2 size={16} />} label="テキスト ドキュメント" onClick={() => handleAction(handleNewFile)} />
                    </ContextSubMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem icon={<Settings size={16} />} label="プロパティ(R)" onClick={() => handleAction(async () => {
                        await invoke('show_properties', { path: currentPath });
                    })} />
                </>
            ) : (
                <>
                    {!isMultiple && (
                        <ContextMenuItem icon={<ExternalLink size={16} />} label="開く(O)" onClick={() => handleAction(async () => {
                            if (targetPath) await invoke('open_file_default', { path: targetPath });
                        })} />
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem icon={<Scissors size={16} />} label="切り取り(T)" onClick={() => handleAction(() => {
                        setClipboard({ files: pathsToActOn, operation: 'cut' });
                    })} />
                    <ContextMenuItem icon={<Copy size={16} />} label="コピー(C)" onClick={() => handleAction(() => {
                        setClipboard({ files: pathsToActOn, operation: 'copy' });
                    })} />
                    {/* Copy Path */}
                    <ContextMenuItem icon={<Clipboard size={16} />} label="パスのコピー(P)" onClick={() => handleAction(() => {
                        navigator.clipboard.writeText(pathsToActOn.join('\n'));
                    })} />
                    <ContextMenuSeparator />
                    {!isMultiple && (
                        <ContextMenuItem icon={<Edit2 size={16} />} label="名前の変更(M)" onClick={() => handleAction(() => {
                            if (targetPath) onStartRename(targetPath);
                        })} />
                    )}
                    <ContextMenuItem icon={<Trash2 size={16} />} label="削除(D)" onClick={() => handleAction(async () => {
                        if (confirm(`選択した${pathsToActOn.length} 項目をゴミ箱に移動しますか？`)) {
                            await invoke('delete_files', { paths: pathsToActOn, toTrash: true });
                            await refreshFiles();
                        }
                    })} />
                    <ContextMenuSeparator />
                    <ContextMenuItem icon={<Settings size={16} />} label="プロパティ(R)" onClick={() => handleAction(async () => {
                        if (targetPath) await invoke('show_properties', { path: targetPath });
                    })} />
                </>
            )}

            <style>{`
                .win32-context-menu {
                    position: fixed;
                    background-color: #FFFFFF;
                    border: 1px solid #A0A0A0;
                    box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
                    padding: 2px 0;
                    min-width: 220px;
                    z-index: 1000;
                    font-size: 12px;
                    color: #000000;
                    font-family: 'Segoe UI', Arial, sans-serif;
                    border-radius: 0;
                }
                .win32-ContextMenu-gutter {
                    position: absolute;
                    top: 2px;
                    bottom: 2px;
                    left: 2px;
                    width: 24px;
                    background-color: #F2F2F2;
                    border-right: 1px solid #E2E3E4;
                    z-index: -1;
                }
                @media (prefers-color-scheme: dark) {
                    .win32-context-menu {
                        background-color: #2B2B2B;
                        border: 1px solid #4D4D4D;
                        color: #FFFFFF;
                    }
                    .win32-ContextMenu-gutter {
                        background-color: #202020;
                        border-right: 1px solid #333333;
                    }
                }
            `}</style>
        </div>
    );
};

const ContextMenuItem = ({ icon, label, onClick, disabled = false }: { icon?: React.ReactNode, label: string, onClick?: () => void, disabled?: boolean }) => {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            className={`win32-context-item ${disabled ? 'disabled' : ''} ${hovered && !disabled ? 'hovered' : ''}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => {
                if (!disabled && onClick) {
                    e.stopPropagation();
                    onClick();
                }
            }}
        >
            <div className="win32-context-icon">
                {icon}
            </div>
            <div className="win32-context-label">
                {label}
            </div>

            <style>{`
                .win32-context-item {
                    display: flex;
                    align-items: center;
                    padding: 3px 0;
                    cursor: default;
                    position: relative;
                }
                .win32-context-item.hovered {
                    background-color: #E5F3FF;
                }
                .win32-context-item.disabled {
                    color: #A0A0A0;
                }
                .win32-context-icon {
                    width: 24px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    color: #555555;
                }
                .win32-context-label {
                    flex: 1;
                    padding-left: 8px;
                    padding-right: 16px;
                }
                
                .win32-context-submenu-container {
                    position: relative;
                }
                .win32-context-submenu {
                    position: absolute;
                    top: 0;
                    left: 100%;
                    background-color: #FFFFFF;
                    border: 1px solid #A0A0A0;
                    box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
                    padding: 2px 0;
                    min-width: 200px;
                    z-index: 1001;
                    display: none;
                }
                .win32-context-submenu-container:hover .win32-context-submenu {
                    display: block;
                }

                @media (prefers-color-scheme: dark) {
                    .win32-context-item.hovered {
                        background-color: #444444;
                    }
                    .win32-context-icon {
                        color: #AAAAAA;
                    }
                    .win32-context-submenu {
                        background-color: #2B2B2B;
                        border: 1px solid #4D4D4D;
                    }
                }
            `}</style>
        </div>
    );
};

const ContextSubMenuItem = ({ icon, label, children }: { icon?: React.ReactNode, label: string, children: React.ReactNode }) => {
    return (
        <div className="win32-context-submenu-container">
            <ContextMenuItem icon={icon} label={label + " ▸"} />
            <div className="win32-context-submenu">
                <div className="win32-ContextMenu-gutter"></div>
                {children}
            </div>
        </div>
    );
};
const ContextMenuSeparator = () => (
    <div className="win32-context-separator">
        <style>{`
            .win32-context-separator {
                height: 1px;
                background-color: #E2E3E4;
                margin: 3px 0 3px 28px;
            }
            @media (prefers-color-scheme: dark) {
                .win32-context-separator {
                    background-color: #4D4D4D;
                }
            }
        `}</style>
    </div>
);
