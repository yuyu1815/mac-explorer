import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAppStore } from '../stores/appStore';
import { ExternalLink, Scissors, Copy, Edit2, Trash2, FolderPlus, Clipboard, LayoutGrid, ArrowDownAZ, RefreshCw, Settings, Archive, FileArchive } from 'lucide-react';
import { isArchive, getArchiveFormat, getFileNameWithoutExtension } from '../utils/archive';

interface ContextMenuProps {
    x: number;
    y: number;
    targetPath: string | null;
    onClose: () => void;
    onStartRename: (path: string) => void;
    onCreateFolder: () => void;
}

export const ContextMenu = ({ x, y, targetPath, onClose, onStartRename, onCreateFolder }: ContextMenuProps) => {
    const { tabs, activeTabId, setFiles, setClipboard, clipboard, setViewMode, setSortParams, openPropertiesDialog, confirmOverwrite } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const currentPath = activeTab?.currentPath || '';
    const selectedFiles = activeTab?.selectedFiles || new Set<string>();

    const menuRef = useRef<HTMLDivElement>(null);

    const [position, setPosition] = useState({ top: y, left: x });

    useLayoutEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            let newTop = y;
            let newLeft = x;

            if (y + rect.height > window.innerHeight) {
                newTop = Math.max(0, y - rect.height);
            }
            if (x + rect.width > window.innerWidth) {
                newLeft = Math.max(0, x - rect.width);
            }

            setPosition({ top: newTop, left: newLeft });
        }
    }, [x, y, targetPath]);

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
        } catch (err) {
            console.error('Context menu action failed:', err);
        }
    };

    const handleNewFile = async () => {
        try {
            let newPath = currentPath.endsWith('/') ? `${currentPath}新しいテキスト ドキュメント.txt` : `${currentPath}/新しいテキスト ドキュメント.txt`;
            await invoke('create_file', { path: newPath });
            refreshFiles();
        } catch (err) {
            console.error('Context menu action failed:', err);
        }
    };

    const handleCompress = async () => {
        if (pathsToActOn.length === 0) return;
        try {
            const defaultName = pathsToActOn.length === 1
                ? getFileNameWithoutExtension(targetPath || 'archive') + '.zip'
                : 'archive.zip';

            const archivePath = currentPath.endsWith('/') ? `${currentPath}${defaultName}` : `${currentPath}/${defaultName}`;

            const exists = await invoke<boolean>('check_exists', { path: archivePath });
            if (exists) {
                const shouldOverwrite = await confirmOverwrite(archivePath);
                if (!shouldOverwrite) return;
            }

            const payload = {
                sources: pathsToActOn,
                destArchivePath: archivePath,
                format: getArchiveFormat(archivePath)
            };

            const label = `progress-${Date.now()}`;
            const queryParams = new URLSearchParams({
                window: 'progress',
                action: 'compress',
                payload: JSON.stringify(payload)
            });

            // メインウィンドウの中心に表示するための座標計算
            const mainWindow = getCurrentWindow();
            const pos = await mainWindow.innerPosition();
            const size = await mainWindow.innerSize();
            const factor = await mainWindow.scaleFactor();

            const winWidth = 400;
            const winHeight = 250;
            const x = Math.round((pos.x / factor) + ((size.width / factor) - winWidth) / 2);
            const y = Math.round((pos.y / factor) + ((size.height / factor) - winHeight) / 2);

            const win = new WebviewWindow(label, {
                url: `/?${queryParams.toString()}`,
                title: '圧縮しています...',
                width: winWidth,
                height: winHeight,
                x,
                y,
                resizable: false,
                maximizable: false,
                decorations: false,
                transparent: true,
                alwaysOnTop: true,
            });

            await win.once('tauri://error', (e: any) => {
                console.error('Failed to create progress window', e);
                alert('進行状況ウィンドウの作成に失敗しました。');
            });

        } catch (err) {
            console.error('Compression start failed:', err);
            alert(`圧縮処理の開始に失敗しました: ${err}`);
        }
    };

    const handleExtract = async () => {
        if (!targetPath) return;
        try {
            const baseDir = getFileNameWithoutExtension(targetPath);
            const destDir = currentPath.endsWith('/') ? `${currentPath}${baseDir}` : `${currentPath}/${baseDir}`;

            const payload = {
                archivePath: targetPath,
                destDir: destDir
            };

            const label = `progress-${Date.now()}`;
            const queryParams = new URLSearchParams({
                window: 'progress',
                action: 'extract',
                payload: JSON.stringify(payload)
            });

            // メインウィンドウの中心に表示するための座標計算
            const mainWindow = getCurrentWindow();
            const pos = await mainWindow.innerPosition();
            const size = await mainWindow.innerSize();
            const factor = await mainWindow.scaleFactor();

            const winWidth = 400;
            const winHeight = 250;
            const x = Math.round((pos.x / factor) + ((size.width / factor) - winWidth) / 2);
            const y = Math.round((pos.y / factor) + ((size.height / factor) - winHeight) / 2);

            const win = new WebviewWindow(label, {
                url: `/?${queryParams.toString()}`,
                title: '展開しています...',
                width: winWidth,
                height: winHeight,
                x,
                y,
                resizable: false,
                maximizable: false,
                decorations: false,
                transparent: true,
                alwaysOnTop: true,
            });

            await win.once('tauri://error', (e: any) => {
                console.error('Failed to create progress window', e);
                alert('進行状況ウィンドウの作成に失敗しました。');
            });

        } catch (err) {
            console.error('Extraction start failed:', err);
            alert(`解凍の開始に失敗しました: ${err}`);
        }
    };

    const isMultiple = selectedFiles.size > 1;
    const pathsToActOn: string[] = (targetPath && selectedFiles.has(targetPath)) ? Array.from(selectedFiles) : targetPath ? [targetPath] : [];

    return (
        <div ref={menuRef} className="win32-context-menu" style={{ top: position.top, left: position.left }}>
            {/* Background Gutter */}
            <div className="win32-ContextMenu-gutter"></div>

            {!targetPath ? (
                <>
                    {/* View Menu */}
                    <ContextSubMenuItem icon={<LayoutGrid size={16} />} label="表示(V)">
                        <ContextMenuItem label="特大アイコン(X) " onClick={() => handleAction(() => setViewMode('extra_large_icon'))} />
                        <ContextMenuItem label="大アイコン(R) " onClick={() => handleAction(() => setViewMode('large_icon'))} />
                        <ContextMenuItem label="中アイコン(M) " onClick={() => handleAction(() => setViewMode('medium_icon'))} />
                        <ContextMenuItem label="小アイコン(N) " onClick={() => handleAction(() => setViewMode('small_icon'))} />
                        <ContextMenuItem label="一覧(L) " onClick={() => handleAction(() => setViewMode('list'))} />
                        <ContextMenuItem label="詳細(D) " onClick={() => handleAction(() => setViewMode('detail'))} />
                        <ContextMenuItem label="並べて表示(S) " onClick={() => handleAction(() => setViewMode('tiles'))} />
                        <ContextMenuItem label="コンテンツ(T) " onClick={() => handleAction(() => setViewMode('content'))} />
                    </ContextSubMenuItem>
                    <ContextMenuSeparator />
                    {/* Sort Menu */}
                    <ContextSubMenuItem icon={<ArrowDownAZ size={16} />} label="並べ替え(O)">
                        <ContextMenuItem label="名前" onClick={() => handleAction(() => setSortParams('name'))} />
                        <ContextMenuItem label="更新日時" onClick={() => handleAction(() => setSortParams('modified'))} />
                        <ContextMenuItem label="種類" onClick={() => handleAction(() => setSortParams('file_type'))} />
                        <ContextMenuItem label="サイズ" onClick={() => handleAction(() => setSortParams('size'))} />
                        <ContextMenuSeparator />
                        <ContextMenuItem label="昇順(A)" onClick={() => handleAction(() => setSortParams(activeTab?.sortBy || 'name', false))} />
                        <ContextMenuItem label="降順(D)" onClick={() => handleAction(() => setSortParams(activeTab?.sortBy || 'name', true))} />
                    </ContextSubMenuItem>
                    <ContextMenuSeparator />
                    {/* Group By Mock */}
                    <ContextSubMenuItem label="グループで表示(P)">
                        <ContextMenuItem label="(なし)(N)" onClick={() => handleAction(() => { })} />
                    </ContextSubMenuItem>
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
                        openPropertiesDialog(currentPath);
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
                    {/* アーカイブの場合は解凍メニューを表示 */}
                    {isArchive(targetPath) && (
                        <ContextMenuItem icon={<FileArchive size={16} />} label="すべて展開(E)" onClick={() => handleAction(handleExtract)} />
                    )}
                    {/* 圧縮メニュー */}
                    <ContextMenuItem icon={<Archive size={16} />} label="圧縮(Z)" onClick={() => handleAction(handleCompress)} />
                    <ContextMenuSeparator />
                    <ContextMenuItem icon={<Settings size={16} />} label="プロパティ(R)" onClick={() => handleAction(async () => {
                        if (targetPath) openPropertiesDialog(targetPath);
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
