import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAppStore } from '@/stores/appStore';
import {
    ExternalLink, Scissors, Copy, Edit2, Trash2, FolderPlus, Clipboard,
    LayoutGrid, ArrowDownAZ, RefreshCw, Settings, Archive, FileArchive, Check
} from 'lucide-react';
import { GroupBy } from '@/types';
import { isArchive, getArchiveFormat, getFileNameWithoutExtension } from '@/utils/archive';
import { ipc } from '@/services/ipc';
import { useUndoStore } from '@/stores/undoStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { copyWithConfirm, moveWithConfirm } from '@/services/fileTransfer';
import styles from '@/styles/components/features/file-manager/ContextMenu.module.css';

const GROUP_OPTIONS: { label: string; value: GroupBy }[] = [
    { label: '(なし)', value: 'none' },
    { label: '名前', value: 'name' },
    { label: '種類', value: 'type' },
    { label: 'サイズ', value: 'size' },
    { label: '更新日時', value: 'dateModified' },
];

interface ContextMenuProps {
    x: number;
    y: number;
    targetPath: string | null;
    onClose: () => void;
    onStartRename: (path: string) => void;
    onCreateFolder: () => void;
}

export const ContextMenu = ({ x, y, targetPath, onClose, onStartRename, onCreateFolder }: ContextMenuProps) => {
    const { tabs, activeTabId, setFiles, setCurrentPath, setClipboard, clipboard, setViewMode, setSortParams, setGroupBy, openPropertiesDialog, confirmOverwrite, openLocationNotAvailableDialog, confirmTrash } = useAppStore();
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
        try {
            await action();
        } catch (err) {
            useNotificationStore.getState().notifyError(`操作に失敗しました: ${err}`);
        } finally {
            onClose();
        }
    };

    const refreshFiles = async () => {
        try {
            const sortBy = activeTab?.sortBy || 'name';
            const sortDesc = activeTab?.sortDesc || false;
            const searchQuery = activeTab?.searchQuery || '';
            const result = await ipc.listFilesSorted(currentPath, false, sortBy, sortDesc, searchQuery);
            setFiles(result);
        } catch (err) {
            useNotificationStore.getState().notifyError(`ファイル一覧の更新に失敗しました: ${err}`);
        }
    };

    const handleNewFile = async () => {
        // 'this-pc' は仮想フォルダであり、物理的なファイルの作成はできないため
        if (currentPath === 'this-pc') return;

        try {
            let newPath = currentPath.endsWith('/') ? `${currentPath}新しいテキスト ドキュメント.txt` : `${currentPath}/新しいテキスト ドキュメント.txt`;
            await ipc.createFile(newPath);
            useUndoStore.getState().record({ type: 'create', path: newPath });
            refreshFiles();
        } catch (err) {
            useNotificationStore.getState().notifyError(`ファイルの作成に失敗しました: ${err}`);
        }
    };

    const handleCompress = async () => {
        // 'this-pc' は仮想フォルダであり、圧縮ファイルの作成はできないため
        if (currentPath === 'this-pc') return;

        if (pathsToActOn.length === 0) return;
        try {
            const defaultName = pathsToActOn.length === 1
                ? getFileNameWithoutExtension(targetPath || 'archive') + '.zip'
                : 'archive.zip';

            const archivePath = currentPath.endsWith('/') ? `${currentPath}${defaultName}` : `${currentPath}/${defaultName}`;

            const exists = await ipc.checkExists(archivePath);
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

            const winWidth = 500;
            const winHeight = 350;
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
        // 'this-pc' は仮想フォルダであり、ファイルの展開はできないため
        if (currentPath === 'this-pc') return;

        if (!targetPath) return;
        try {
            const baseDir = getFileNameWithoutExtension(targetPath);
            const defaultDestDir = currentPath.endsWith('/') ? `${currentPath}${baseDir}` : `${currentPath}/${baseDir}`;

            const promptResult = await useAppStore.getState().promptExtract(targetPath, defaultDestDir);
            if (!promptResult) return; // Canceled

            const payload = {
                archivePath: targetPath,
                destDir: promptResult.destPath,
                showFiles: promptResult.showFiles
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

            const winWidth = 500;
            const winHeight = 350;
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
        <div ref={menuRef} className={styles.menu} style={{ top: position.top, left: position.left }}>
            {/* Background Gutter */}
            <div className={styles.gutter}></div>

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
                        <ContextMenuItem icon={activeTab?.sortBy === 'name' ? <Check size={16} color="#0078D7" /> : undefined} label="名前" onClick={() => handleAction(() => setSortParams('name', activeTab?.sortBy === 'name' ? !activeTab.sortDesc : false))} />
                        <ContextMenuItem icon={activeTab?.sortBy === 'modified' ? <Check size={16} color="#0078D7" /> : undefined} label="更新日時" onClick={() => handleAction(() => setSortParams('modified', activeTab?.sortBy === 'modified' ? !activeTab.sortDesc : false))} />
                        <ContextMenuItem icon={activeTab?.sortBy === 'file_type' ? <Check size={16} color="#0078D7" /> : undefined} label="種類" onClick={() => handleAction(() => setSortParams('file_type', activeTab?.sortBy === 'file_type' ? !activeTab.sortDesc : false))} />
                        <ContextMenuItem icon={activeTab?.sortBy === 'size' ? <Check size={16} color="#0078D7" /> : undefined} label="サイズ" onClick={() => handleAction(() => setSortParams('size', activeTab?.sortBy === 'size' ? !activeTab.sortDesc : false))} />
                        <ContextMenuSeparator />
                        <ContextMenuItem icon={!activeTab?.sortDesc ? <Check size={16} color="#0078D7" /> : undefined} label="昇順(A)" onClick={() => handleAction(() => setSortParams(activeTab?.sortBy || 'name', false))} />
                        <ContextMenuItem icon={activeTab?.sortDesc ? <Check size={16} color="#0078D7" /> : undefined} label="降順(D)" onClick={() => handleAction(() => setSortParams(activeTab?.sortBy || 'name', true))} />
                    </ContextSubMenuItem>
                    <ContextMenuSeparator />
                    {/* Group By */}
                    <ContextSubMenuItem icon={<LayoutGrid size={16} />} label="グループで表示(P)">
                        {GROUP_OPTIONS.map(opt => (
                            <ContextMenuItem
                                key={opt.value}
                                icon={(activeTab?.groupBy || 'none') === opt.value ? <Check size={16} color="#0078D7" /> : undefined}
                                label={opt.label}
                                onClick={() => handleAction(() => setGroupBy(opt.value))}
                            />
                        ))}
                    </ContextSubMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem icon={<RefreshCw size={16} />} label="最新の情報に更新(E)" onClick={() => handleAction(refreshFiles)} />
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        icon={<Clipboard size={16} />}
                        label="貼り付け(P)"
                        disabled={!clipboard || currentPath === 'this-pc'}
                        onClick={() => {
                            if (clipboard) {
                                handleAction(async () => {
                                    if (clipboard.operation === 'copy') {
                                        await copyWithConfirm(clipboard.files, currentPath);
                                    } else {
                                        await moveWithConfirm(clipboard.files, currentPath);
                                        setClipboard(null);
                                    }
                                    await refreshFiles();
                                });
                            }
                        }}
                    />
                    <ContextMenuSeparator />
                    {currentPath !== 'this-pc' && (
                        <>
                            <ContextMenuSeparator />
                            <ContextSubMenuItem icon={<FolderPlus size={16} />} label="新規作成(W)">
                                <ContextMenuItem icon={<FolderPlus size={16} />} label="フォルダー(F)" onClick={() => handleAction(onCreateFolder)} />
                                <ContextMenuSeparator />
                                <ContextMenuItem icon={<Edit2 size={16} />} label="テキスト ドキュメント" onClick={() => handleAction(handleNewFile)} />
                            </ContextSubMenuItem>
                        </>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        icon={<Settings size={16} />}
                        label="プロパティ(R)"
                        disabled={currentPath === 'this-pc'}
                        onClick={() => handleAction(async () => {
                            openPropertiesDialog(currentPath);
                        })}
                    />
                </>
            ) : (
                <>
                    {!isMultiple && (
                        <ContextMenuItem icon={<ExternalLink size={16} />} label="開く(O)" onClick={() => handleAction(async () => {
                            if (targetPath) {
                                if (isArchive(targetPath)) {
                                    try {
                                        await ipc.listFilesSorted(targetPath, false, 'name', false, '');
                                        setCurrentPath(targetPath);
                                    } catch {
                                        openLocationNotAvailableDialog(targetPath);
                                    }
                                } else {
                                    try {
                                        await ipc.openFileDefault(targetPath);
                                    } catch (err) {
                                        useNotificationStore.getState().notifyError(`ファイルを開けませんでした: ${err}`);
                                    }
                                }
                            }
                        })} />
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem icon={<Scissors size={16} />} label="切り取り(T)" disabled={currentPath === 'this-pc'} onClick={() => handleAction(() => {
                        setClipboard({ files: pathsToActOn, operation: 'cut' });
                    })} />
                    <ContextMenuItem icon={<Copy size={16} />} label="コピー(C)" disabled={currentPath === 'this-pc'} onClick={() => handleAction(() => {
                        setClipboard({ files: pathsToActOn, operation: 'copy' });
                    })} />
                    {/* Copy Path */}
                    <ContextMenuItem icon={<Clipboard size={16} />} label="パスのコピー(P)" disabled={currentPath === 'this-pc'} onClick={() => handleAction(() => {
                        navigator.clipboard.writeText(pathsToActOn.join('\n'));
                    })} />
                    <ContextMenuSeparator />
                    {!isMultiple && (
                        <ContextMenuItem
                            icon={<Edit2 size={16} />}
                            label="名前の変更(M)"
                            disabled={currentPath === 'this-pc'}
                            onClick={() => handleAction(() => {
                                if (targetPath) onStartRename(targetPath);
                            })}
                        />
                    )}
                    <ContextMenuItem
                        icon={<Trash2 size={16} />}
                        label="削除(D)"
                        disabled={currentPath === 'this-pc'}
                        onClick={() => handleAction(async () => {
                            const confirmed = await confirmTrash(pathsToActOn.length, false);
                            if (confirmed) {
                                await ipc.deleteFiles(pathsToActOn);
                                await refreshFiles();
                            }
                        })}
                    />
                    <ContextMenuSeparator />
                    {/* アーカイブの場合は解凍メニューを表示 */}
                    {isArchive(targetPath) && (
                        <ContextMenuItem
                            icon={<FileArchive size={16} />}
                            label="すべて展開(E)"
                            disabled={currentPath === 'this-pc'}
                            onClick={() => handleAction(handleExtract)}
                        />
                    )}
                    {/* 圧縮メニュー */}
                    <ContextMenuItem
                        icon={<Archive size={16} />}
                        label="圧縮(Z)"
                        disabled={currentPath === 'this-pc'}
                        onClick={() => handleAction(handleCompress)}
                    />
                    <ContextMenuSeparator />
                    <ContextMenuItem icon={<Settings size={16} />} label="プロパティ(R)" onClick={() => handleAction(async () => {
                        if (targetPath) openPropertiesDialog(targetPath);
                    })} />
                </>
            )}
        </div>
    );
};

const ContextMenuItem = ({ icon, label, onClick, disabled = false }: { icon?: React.ReactNode, label: string, onClick?: () => void, disabled?: boolean }) => {
    return (
        <div
            className={`${styles.item} ${disabled ? styles.disabled : ''}`}
            onClick={(e) => {
                if (!disabled && onClick) {
                    e.stopPropagation();
                    onClick();
                }
            }}
        >
            <div className={styles.icon}>
                {icon}
            </div>
            <div className={styles.label}>
                {label}
            </div>
        </div>
    );
};

const ContextSubMenuItem = ({ icon, label, children }: { icon?: React.ReactNode, label: string, children: React.ReactNode }) => {
    return (
        <div className={styles.submenuContainer}>
            <ContextMenuItem icon={icon} label={label + " ▸"} />
            <div className={styles.submenu}>
                <div className={styles.gutter}></div>
                {children}
            </div>
        </div>
    );
};

const ContextMenuSeparator = () => (
    <div className={styles.separator} />
);
