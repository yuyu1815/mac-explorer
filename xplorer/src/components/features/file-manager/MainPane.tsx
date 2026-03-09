import { useEffect, useState, useRef, KeyboardEvent, MouseEvent as ReactMouseEvent, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/stores/appStore';
import { ContextMenu } from './ContextMenu';
import {
    Folder, File, FileText, AppWindow, FileVideo,
    FileAudio, FileImage, FileArchive, FileCode, Link2, Ban
} from 'lucide-react';
import { FileEntry } from '@/types';
import { ipc } from '@/services/ipc';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useFileOperations } from '@/hooks/useFileOperations';
import { useFileSelection } from '@/hooks/useFileSelection';
import styles from '@/styles/components/features/file-manager/MainPane.module.css';

const SymlinkOverlay = ({ size }: { size: number }) => {
    const overlaySize = Math.max(8, Math.floor(size * 0.65));
    return (
        <div className={styles.symlinkOverlay} style={{ width: overlaySize, height: overlaySize }}>
            <Link2 size={overlaySize - 2} strokeWidth={2.5} color="#666" />
        </div>
    );
};

const NoAccessOverlay = ({ size }: { size: number }) => {
    const overlaySize = Math.max(8, Math.floor(size * 0.65));
    return (
        <div className={styles.symlinkOverlay} style={{ width: overlaySize, height: overlaySize }}>
            <Ban size={overlaySize - 2} strokeWidth={2.5} color="#D32F2F" />
        </div>
    );
};

const FolderIcon = ({ size = 16, color = '#FFB900', iconId, isSymlink, isNoAccess }: { size?: number, color?: string, iconId?: string, isSymlink?: boolean, isNoAccess?: boolean }) => {
    const [failed, setFailed] = useState(false);

    const icon = failed || !iconId || iconId === 'dir' ? (
        <Folder size={size} fill={color} color={color} strokeWidth={1} />
    ) : (
        <img
            src={`icon://localhost/${iconId}`}
            alt=""
            onError={() => setFailed(true)}
            style={{ width: size, height: size, objectFit: 'contain' }}
        />
    );

    if (isSymlink || isNoAccess) {
        return (
            <div className={styles.iconContainer} style={{ width: size, height: size }}>
                {icon}
                {isSymlink && <SymlinkOverlay size={size} />}
                {isNoAccess && <NoAccessOverlay size={size} />}
            </div>
        );
    }
    return icon;
};

const AppOverlayIcon = ({ size = 16, iconId, isSymlink, isNoAccess }: { size?: number, iconId?: string, isSymlink?: boolean, isNoAccess?: boolean }) => {
    return (
        <div className={styles.iconContainer} style={{ width: size, height: size }}>
            <FolderIcon size={size} isNoAccess={isNoAccess} />
            <div className={styles.appBadge} style={{ width: size * 0.7, height: size * 0.7 }}>
                <img
                    src={`icon://localhost/${iconId}`}
                    alt=""
                    className={styles.appBadgeImg}
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                />
            </div>
            {isSymlink && <SymlinkOverlay size={size} />}
            {isNoAccess && <NoAccessOverlay size={size} />}
        </div>
    );
};

export const FileIcon = memo(({ isDir, iconId, size = 16, isSymlink, isNoAccess }: { isDir: boolean; iconId?: string; size?: number; isSymlink?: boolean; isNoAccess?: boolean }) => {
    const [failed, setFailed] = useState(false);

    const renderWithOverlay = (icon: React.ReactNode) => {
        if (isSymlink || isNoAccess) {
            return (
                <div className={styles.iconContainer} style={{ width: size, height: size }}>
                    {icon}
                    {isSymlink && <SymlinkOverlay size={size} />}
                    {isNoAccess && <NoAccessOverlay size={size} />}
                </div>
            );
        }
        return icon;
    };

    // .app package specialization: Folder with App Icon overlay
    if (isDir && iconId?.toLowerCase().endsWith('.app')) {
        return <AppOverlayIcon size={size} iconId={iconId} isSymlink={isSymlink} isNoAccess={isNoAccess} />;
    }

    if (isDir && !iconId?.startsWith('app:')) {
        return <FolderIcon size={size} iconId={iconId} isSymlink={isSymlink} isNoAccess={isNoAccess} />;
    }

    if (failed || !iconId) {
        const id = (iconId || '').toLowerCase();
        // app:id support
        if (['exe', 'app', 'lnk'].includes(id) || id.startsWith('app:')) return renderWithOverlay(<AppWindow size={size} color="#888" />);
        if (['jpg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(id)) return renderWithOverlay(<FileImage size={size} color="#2196F3" />);
        if (['mp4', 'mov', 'avi', 'mkv'].includes(id)) return renderWithOverlay(<FileVideo size={size} color="#E91E63" />);
        if (['mp3', 'wav', 'flac', 'm4a'].includes(id)) return renderWithOverlay(<FileAudio size={size} color="#9C27B0" />);
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(id)) return renderWithOverlay(<FileArchive size={size} color="#F44336" />);
        if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'py', 'rs', 'go', 'c', 'cpp'].includes(id)) return renderWithOverlay(<FileCode size={size} color="#4CAF50" />);
        if (['txt', 'md', 'doc', 'docx', 'pdf', 'csv', 'xls', 'xlsx'].includes(id)) return renderWithOverlay(<FileText size={size} color="#607D8B" />);
        return renderWithOverlay(<File size={size} color="#888" />);
    }

    const img = (
        <img
            src={`icon://localhost/${iconId}`}
            alt=""
            onError={() => setFailed(true)}
            style={{ width: size, height: size, objectFit: 'contain' }}
        />
    );

    return renderWithOverlay(img);
});

export const MainPane = () => {
    const { tabs, activeTabId, setCurrentPath, selectAll, setFocusedIndex, goBack, goUp, addTab, setSortParams, renameTriggerId, clipboard, setClipboard, openPropertiesDialog, showHiddenFiles, showFileExtensions, openLocationNotAvailableDialog, confirmTrash } = useAppStore();
    const activeTab = tabs.find((t: any) => t.id === activeTabId);

    const currentPath = activeTab?.currentPath || '';
    const searchQuery = activeTab?.searchQuery || '';
    const viewMode = activeTab?.viewMode || 'detail';
    const sortBy = activeTab?.sortBy || 'name';
    const sortDesc = activeTab?.sortDesc || false;

    // Use hooks
    const { files, refreshFiles } = useFileSystem({
        currentPath,
        showHidden: showHiddenFiles,
        sortParams: { sortBy, sortDesc },
        searchQuery
    });

    const {
        renamingPath, setRenamingPath, renameValue, setRenameValue,
        handleRename, handleCreateDirectory, handleDelete, handleBatchRename
    } = useFileOperations(refreshFiles);

    const {
        selectedPaths, toggleSelection: hookToggleSelection, clearSelection,
        marquee, containerRef, onMouseDown: hookOnMouseDown, onMouseMove, onMouseUp: hookOnMouseUp
    } = useFileSelection(files);

    const marqueeJustEnded = useRef(false);

    const onMouseDown = (e: React.MouseEvent) => {
        marqueeJustEnded.current = false;
        hookOnMouseDown(e);
    };

    const onMouseUp = () => {
        if (marquee) {
            marqueeJustEnded.current = true;
            setTimeout(() => {
                marqueeJustEnded.current = false;
            }, 100);
        }
        hookOnMouseUp();
    };
    const [batchRenameState, setBatchRenameState] = useState<{ prefix: string; startNum: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, target: string | null } | null>(null);
    const [dragTarget, setDragTarget] = useState<string | null>(null);
    const [renameWarning, setRenameWarning] = useState<string | null>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const renameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [colWidths, setColWidths] = useState({ name: 0, modified: 150, file_type: 120, size: 100 });
    const [iconSize, setIconSize] = useState(48);

    // Sync selection with store if needed, or just use hook's selectedPaths
    // For simplicity, we'll map hookToggleSelection to component's needs

    useEffect(() => {
        const handleNativeContextMenu = (e: globalThis.MouseEvent) => e.preventDefault();
        document.addEventListener('contextmenu', handleNativeContextMenu);
        return () => document.removeEventListener('contextmenu', handleNativeContextMenu);
    }, []);

    useEffect(() => {
        if (renameTriggerId > 0 && selectedPaths.size === 1) {
            const targetPath = Array.from(selectedPaths)[0];
            setRenamingPath(targetPath);
            setRenameValue(targetPath.split('/').pop() || '');
        }
    }, [renameTriggerId, selectedPaths]);

    useEffect(() => {
        if (renamingPath && renameInputRef.current) {
            renameInputRef.current.focus();
            const dotIndex = renameValue.lastIndexOf('.');
            if (dotIndex > 0) {
                renameInputRef.current.setSelectionRange(0, dotIndex);
            } else {
                renameInputRef.current.select();
            }
        }
    }, [renamingPath, renameValue]);

    const handleDoubleClick = useCallback(async (file: FileEntry) => {
        if (file.is_dir || file.is_archive) {
            try {
                await invoke('list_directory', { path: file.path, showHidden: false });
                setCurrentPath(file.path);
            } catch {
                openLocationNotAvailableDialog(file.path);
            }
        } else {
            ipc.openFileDefault(file.path);
        }
    }, [setCurrentPath, openLocationNotAvailableDialog]);

    const refreshFilesLocal = useCallback(async () => {
        refreshFiles();
    }, [refreshFiles]);

    const startRename = useCallback((path: string) => {
        setRenamingPath(path);
        setRenameValue(path.split('/').pop() || '');
    }, [setRenamingPath, setRenameValue]);

    const commitRename = useCallback(async () => {
        if (renamingPath && renameValue) {
            handleRename(renamingPath, renameValue);
        }
    }, [renamingPath, renameValue, handleRename]);

    const cancelRename = useCallback(() => {
        setRenamingPath(null);
    }, [setRenamingPath]);

    const handleCreateFolder = useCallback(async () => {
        const defaultName = '新しいフォルダー';
        const newPath = currentPath.endsWith('/') ? `${currentPath}${defaultName}` : `${currentPath}/${defaultName}`;
        handleCreateDirectory(newPath);
    }, [currentPath, handleCreateDirectory]);

    const handleDragStart = (e: React.DragEvent, file: { path: string; name: string; is_dir: boolean }) => {
        if (renamingPath === file.path) {
            e.preventDefault();
            return;
        }

        const isSelected = selectedPaths.has(file.path);
        const dragCount = isSelected ? selectedPaths.size : 1;
        const paths = isSelected ? Array.from(selectedPaths) : [file.path];

        if (!isSelected) {
            hookToggleSelection(file.path, true, false, -1);
        }

        e.dataTransfer.setData('application/json', JSON.stringify({ sourcePaths: paths }));
        e.dataTransfer.effectAllowed = 'copyMove';

        const ghost = document.createElement('div');
        ghost.style.position = 'absolute';
        ghost.style.top = '-1000px';
        ghost.style.left = '-1000px';
        ghost.style.background = 'var(--bg-color, #ffffff)';
        ghost.style.border = '1px solid var(--border-color, #ccc)';
        ghost.style.padding = '4px 8px';
        ghost.style.borderRadius = '4px';
        ghost.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
        ghost.style.display = 'flex';
        ghost.style.alignItems = 'center';
        ghost.style.gap = '6px';
        ghost.style.fontFamily = '"Segoe UI", sans-serif';
        ghost.style.fontSize = '12px';
        ghost.style.color = 'var(--text-color, #000)';
        ghost.style.zIndex = '9999';

        const iconChar = file.is_dir ? '📁' : '📄';
        let badgeHtml = '';
        if (dragCount > 1) {
            badgeHtml = `<div style="background: #0078D7; color: white; border-radius: 10px; padding: 0 6px; font-size: 10px; font-weight: bold; margin-left: 4px; display: flex; align-items: center; justify-content: center; height: 16px;">${dragCount}</div>`;
        }

        ghost.innerHTML = `
            <span>${iconChar}</span>
            <span style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
            ${badgeHtml}
        `;

        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 15, 15);

        setTimeout(() => {
            if (document.body.contains(ghost)) {
                document.body.removeChild(ghost);
            }
        }, 0);
    };

    const handleDragOverItem = (e: React.DragEvent, file: { path: string; is_dir: boolean }) => {
        if (file.is_dir && !selectedPaths.has(file.path)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey || e.altKey ? 'copy' : 'move';
        }
    };

    const handleDragEnterItem = (_e: React.DragEvent, file: { path: string; is_dir: boolean }) => {
        if (file.is_dir && !selectedPaths.has(file.path)) {
            setDragTarget(file.path);
        }
    };

    const handleDragLeaveItem = (_e: React.DragEvent, file: { path: string; is_dir: boolean }) => {
        if (dragTarget === file.path) {
            setDragTarget(null);
        }
    };

    const handleDropItem = async (e: React.DragEvent, file: { path: string; is_dir: boolean }) => {
        if (!file.is_dir || selectedPaths.has(file.path)) return;
        e.preventDefault();
        e.stopPropagation();
        setDragTarget(null);
        try {
            const data = e.dataTransfer.getData('application/json');
            if (data) {
                const { sourcePaths } = JSON.parse(data);
                const isCopy = e.ctrlKey || e.metaKey || e.altKey;

                const invalidDrop = sourcePaths.some((p: string) => file.path === p || file.path.startsWith(p + '/'));
                if (invalidDrop) return;

                if (isCopy) {
                    await invoke('copy_files', { sources: sourcePaths, dest: file.path });
                } else {
                    await invoke('move_files', { sources: sourcePaths, dest: file.path });
                }
                await refreshFiles();
            }
        } catch (err) {
            console.error('Drop failed', err);
        }
    };

    const handleContextMenu = (e: ReactMouseEvent, path: string | null) => {
        e.preventDefault();
        if (path && !selectedPaths.has(path)) {
            hookToggleSelection(path, true, false, -1);
        }
        setContextMenu({ x: e.clientX, y: e.clientY, target: path });
    };

    const typeAheadBuffer = useRef('');
    const typeAheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleKeyDown = async (e: KeyboardEvent) => {
        if (renamingPath) return;

        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
            e.preventDefault();
            addTab();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
            e.preventDefault();
            const { tabs, activeTabId, setActiveTab } = useAppStore.getState();
            const idx = tabs.findIndex(t => t.id === activeTabId);
            const next = e.shiftKey
                ? (idx - 1 + tabs.length) % tabs.length
                : (idx + 1) % tabs.length;
            setActiveTab(tabs[next].id);
            return;
        }

        if (e.altKey && e.key === 'Enter') {
            e.preventDefault();
            const paths = Array.from(selectedPaths);
            if (paths.length > 0) openPropertiesDialog(paths[0]);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            selectAll();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
            e.preventDefault();
            handleCreateFolder();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
            e.preventDefault();
            const paths = Array.from(selectedPaths);
            if (paths.length > 0) {
                navigator.clipboard.writeText(paths.join('\n'));
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
            if (selectedPaths.size > 0) {
                e.preventDefault();
                setClipboard({ files: Array.from(selectedPaths), operation: 'copy' });
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) {
            if (selectedPaths.size > 0) {
                e.preventDefault();
                setClipboard({ files: Array.from(selectedPaths), operation: 'cut' });
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
            e.preventDefault();
            if (clipboard) {
                if (clipboard.operation === 'copy') {
                    await invoke('copy_files', { sources: clipboard.files, dest: currentPath });
                } else {
                    await invoke('move_files', { sources: clipboard.files, dest: currentPath });
                    setClipboard(null);
                }
                await refreshFilesLocal();
            }
            return;
        }

        if (e.key === 'F5') {
            e.preventDefault();
            await refreshFilesLocal();
            return;
        }

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const focusedIndex = activeTab?.focusedIndex ?? -1;
            const maxIndex = files.length - 1;
            if (maxIndex < 0) return;

            const nextIndex = e.key === 'ArrowDown'
                ? Math.min(focusedIndex + 1, maxIndex)
                : Math.max(focusedIndex - 1, 0);

            setFocusedIndex(nextIndex);
            hookToggleSelection(files[nextIndex].path, !e.ctrlKey && !e.metaKey, e.shiftKey, nextIndex);
            return;
        }

        if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            if (files.length === 0) return;
            const idx = e.key === 'Home' ? 0 : files.length - 1;
            setFocusedIndex(idx);
            hookToggleSelection(files[idx].path, true, false, idx);
            return;
        }

        if (e.key === 'Enter' && selectedPaths.size === 1) {
            const targetPath = Array.from(selectedPaths)[0];
            const targetFile = files.find(f => f.path === targetPath);
            if (targetFile) {
                handleDoubleClick(targetFile);
            }
            return;
        }

        if ((e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) && e.shiftKey && selectedPaths.size > 0) {
            e.preventDefault();
            const confirmed = await confirmTrash(selectedPaths.size, true);
            if (confirmed) {
                handleDelete(Array.from(selectedPaths), false);
                clearSelection();
            }
            return;
        }

        if ((e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) && selectedPaths.size > 0) {
            e.preventDefault();
            const confirmed = await confirmTrash(selectedPaths.size, false);
            if (confirmed) {
                handleDelete(Array.from(selectedPaths), true);
                clearSelection();
            }
            return;
        }

        if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey) {
            if (selectedPaths.size > 0) {
                e.preventDefault();
                const confirmed = await confirmTrash(selectedPaths.size, false);
                if (confirmed) {
                    handleDelete(Array.from(selectedPaths), true);
                    clearSelection();
                }
                return;
            } else {
                e.preventDefault();
                goBack();
                return;
            }
        }

        if (e.key === 'F2' && selectedPaths.size === 1) {
            const targetPath = Array.from(selectedPaths)[0];
            startRename(targetPath);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
            e.preventDefault();
            if (selectedPaths.size > 1) {
                // Batch rename logic would go here
            }
            return;
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            typeAheadBuffer.current += e.key.toLowerCase();
            if (typeAheadTimer.current) clearTimeout(typeAheadTimer.current);
            typeAheadTimer.current = setTimeout(() => { typeAheadBuffer.current = ''; }, 800);

            const match = files.findIndex(f => f.name.toLowerCase().startsWith(typeAheadBuffer.current));
            if (match !== -1) {
                setFocusedIndex(match);
                hookToggleSelection(files[match].path, true, false, match);
            }
        }
    };



    const SortIndicator = ({ column }: { column: string }) => {
        if (sortBy !== column) return null;
        return <span className={styles.sortIndicator}>{sortDesc ? '▼' : '▲'}</span>;
    };

    const INVALID_CHARS = /[\/:]/g;

    const renderFileName = (file: FileEntry) => {
        if (renamingPath === file.path) {
            return (
                <div className={styles.renameInputWrapper}>
                    <input
                        ref={renameInputRef}
                        data-testid="rename-input"
                        value={renameValue}
                        onChange={(e) => {
                            const raw = e.target.value;
                            if (INVALID_CHARS.test(raw)) {
                                setRenameWarning('ファイル名には / : は使えません');
                                setRenameValue(raw.replace(INVALID_CHARS, ''));
                                setTimeout(() => setRenameWarning(null), 2000);
                            } else {
                                setRenameValue(raw);
                            }
                        }}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') cancelRename();
                        }}
                        onBlur={commitRename}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={styles.renameInput}
                    />
                    {renameWarning && (
                        <div
                            data-testid="rename-warning"
                            className={styles.renameWarning}
                        >
                            {renameWarning}
                        </div>
                    )}
                </div>
            );
        }

        const displayPath = file.name;
        const displayName = (!showFileExtensions && !file.is_dir && displayPath.includes('.'))
            ? displayPath.substring(0, displayPath.lastIndexOf('.'))
            : displayPath;

        if (!searchQuery) return <span>{displayName}</span>;

        const parts = displayName.split(new RegExp(`(${searchQuery})`, 'gi'));
        return (
            <span>
                {parts.map((part: string, i: number) =>
                    part.toLowerCase() === searchQuery.toLowerCase() ? (
                        <span key={i} className={styles.searchHighlight}>{part}</span>
                    ) : (
                        <span key={i}>{part}</span>
                    )
                )}
            </span>
        );
    };

    const handleColumnResize = (column: 'modified' | 'file_type' | 'size', startX: number) => {
        const startWidth = colWidths[column];
        const onMouseMove = (e: MouseEvent) => {
            const diff = e.clientX - startX;
            setColWidths(prev => ({ ...prev, [column]: Math.max(50, startWidth + diff) }));
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const ResizeHandle = ({ column }: { column: 'modified' | 'file_type' | 'size' }) => (
        <div
            onMouseDown={(e) => { e.stopPropagation(); handleColumnResize(column, e.clientX); }}
            className={styles.resizeHandle}
        />
    );

    const renderDetailView = () => (
        <table className={styles.detailTable}>
            <colgroup>
                <col />
                <col style={{ width: colWidths.modified }} />
                <col style={{ width: colWidths.file_type }} />
                <col style={{ width: colWidths.size }} />
            </colgroup>
            <thead className={styles.detailHead}>
                <tr className={styles.detailHeaderRow}>
                    <th className={styles.detailHeaderCell} onClick={() => setSortParams('name', sortBy === 'name' ? !sortDesc : false)}>
                        名前 <SortIndicator column="name" />
                    </th>
                    <th className={styles.detailHeaderCell} onClick={() => setSortParams('modified', sortBy === 'modified' ? !sortDesc : false)}>
                        更新日時 <SortIndicator column="modified" />
                        <ResizeHandle column="modified" />
                    </th>
                    <th className={styles.detailHeaderCell} onClick={() => setSortParams('file_type', sortBy === 'file_type' ? !sortDesc : false)}>
                        種類 <SortIndicator column="file_type" />
                        <ResizeHandle column="file_type" />
                    </th>
                    <th className={`${styles.detailHeaderCell} ${styles.detailHeaderCellLast} ${styles.detailHeaderCellRight}`} onClick={() => setSortParams('size', sortBy === 'size' ? !sortDesc : false)}>
                        サイズ <SortIndicator column="size" />
                        <ResizeHandle column="size" />
                    </th>
                </tr>
            </thead>
            <tbody>
                {files.map((file, index) => (
                    <tr
                        key={file.path}
                        draggable
                        onDragStart={(e) => handleDragStart(e, file)}
                        onDragOver={(e) => handleDragOverItem(e, file)}
                        onDragEnter={(e) => handleDragEnterItem(e, file)}
                        onDragLeave={(e) => handleDragLeaveItem(e, file)}
                        onDrop={(e) => handleDropItem(e, file)}
                        tabIndex={0}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (renamingPath) return;
                            if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);

                            const isAlreadySelected = selectedPaths.has(file.path) && selectedPaths.size === 1;
                            if (isAlreadySelected && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                renameTimeoutRef.current = setTimeout(() => {
                                    startRename(file.path);
                                }, 500);
                            }
                            hookToggleSelection(file.path, e.ctrlKey || e.metaKey, e.shiftKey, index);
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
                            if (renamingPath) return;
                            handleDoubleClick(file);
                        }}
                        onContextMenu={(e) => {
                            e.stopPropagation();
                            handleContextMenu(e, file.path);
                        }}
                        className={`file-item${selectedPaths.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}${index % 2 === 1 ? ' zebra' : ''}${dragTarget === file.path ? ' drag-target' : ''} ${styles.fileRow}`}
                        data-filepath={file.path}
                    >
                        <td className={styles.detailCellName}>
                            <FileIcon isDir={file.is_dir} iconId={file.icon_id} size={16} isSymlink={file.is_symlink} isNoAccess={file.is_noaccess} /> {renderFileName(file)}
                        </td>
                        <td className={styles.detailCellText}>
                            {file.modified_formatted}
                        </td>
                        <td className={`${styles.detailCellText} ${styles.detailCellTextEllipsis}`}>
                            {file.file_type}
                        </td>
                        <td className={`${styles.detailCellText} ${styles.detailCellTextRight}`}>
                            {file.size_formatted}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderListView = () => (
        <div className={styles.listView}>
            {files.map((file, index) => (
                <div
                    key={file.path}
                    draggable
                    onDragStart={(e) => handleDragStart(e, file)}
                    onDragOver={(e) => handleDragOverItem(e, file)}
                    onDragEnter={(e) => handleDragEnterItem(e, file)}
                    onDragLeave={(e) => handleDragLeaveItem(e, file)}
                    onDrop={(e) => handleDropItem(e, file)}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (renamingPath) return;
                        if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);

                        const isAlreadySelected = selectedPaths.has(file.path) && selectedPaths.size === 1;
                        if (isAlreadySelected && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                            renameTimeoutRef.current = setTimeout(() => {
                                setRenamingPath(file.path);
                            }, 500);
                        }
                        hookToggleSelection(file.path, e.ctrlKey || e.metaKey, e.shiftKey, index);
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
                        if (renamingPath) return;
                        handleDoubleClick(file);
                    }}
                    onContextMenu={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, file.path);
                    }}
                    className={`file-item${selectedPaths.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}${dragTarget === file.path ? ' drag-target' : ''} ${styles.listItem}`}
                    data-filepath={file.path}
                >
                    <FileIcon isDir={file.is_dir} iconId={file.icon_id} size={16} isSymlink={file.is_symlink} isNoAccess={file.is_noaccess} />
                    <span className={styles.listItemText}>{renderFileName(file)}</span>
                </div>
            ))}
        </div>
    );

    const renderIconView = () => (
        <div className={styles.iconView} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${iconSize + 40}px, 1fr))` }}>
            {files.map((file, index) => (
                <div
                    key={file.path}
                    draggable
                    onDragStart={(e) => handleDragStart(e, file)}
                    onDragOver={(e) => handleDragOverItem(e, file)}
                    onDragEnter={(e) => handleDragEnterItem(e, file)}
                    onDragLeave={(e) => handleDragLeaveItem(e, file)}
                    onDrop={(e) => handleDropItem(e, file)}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (renamingPath) return;
                        if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);

                        const isAlreadySelected = selectedPaths.has(file.path) && selectedPaths.size === 1;
                        if (isAlreadySelected && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                            renameTimeoutRef.current = setTimeout(() => {
                                startRename(file.path);
                            }, 500);
                        }
                        hookToggleSelection(file.path, e.ctrlKey || e.metaKey, e.shiftKey, index);
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
                        if (renamingPath) return;
                        handleDoubleClick(file);
                    }}
                    onContextMenu={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, file.path);
                    }}
                    className={`file-item${selectedPaths.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}${dragTarget === file.path ? ' drag-target' : ''} ${styles.iconItem}`}
                    data-filepath={file.path}
                >
                    <FileIcon isDir={file.is_dir} iconId={file.icon_id} size={iconSize} isSymlink={file.is_symlink} isNoAccess={file.is_noaccess} />
                    <span className={styles.iconItemText} style={{ width: '100%' }}>{renderFileName(file)}</span>
                </div>
            ))}
        </div>
    );

    const renderTilesView = () => (
        <div className={styles.listView} style={{ padding: '8px', gap: '4px' }}>
            {files.map((file, index) => (
                <div
                    key={file.path}
                    draggable
                    onDragStart={(e) => handleDragStart(e, file)}
                    onDragOver={(e) => handleDragOverItem(e, file)}
                    onDragEnter={(e) => handleDragEnterItem(e, file)}
                    onDragLeave={(e) => handleDragLeaveItem(e, file)}
                    onDrop={(e) => handleDropItem(e, file)}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (renamingPath) return;
                        if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);

                        const isAlreadySelected = selectedPaths.has(file.path) && selectedPaths.size === 1;
                        if (isAlreadySelected && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                            renameTimeoutRef.current = setTimeout(() => {
                                startRename(file.path);
                            }, 500);
                        }
                        hookToggleSelection(file.path, e.ctrlKey || e.metaKey, e.shiftKey, index);
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
                        if (renamingPath) return;
                        handleDoubleClick(file);
                    }}
                    onContextMenu={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, file.path);
                    }}
                    className={`file-item${selectedPaths.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}${dragTarget === file.path ? ' drag-target' : ''} ${styles.listItem}`}
                    data-filepath={file.path}
                >
                    <FileIcon isDir={file.is_dir} iconId={file.icon_id} size={48} isSymlink={file.is_symlink} isNoAccess={file.is_noaccess} />
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                        <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={(e) => { e.stopPropagation(); hookToggleSelection(file.path, !e.metaKey && !e.ctrlKey, false, index); }}>{renderFileName(file)}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={(e) => { e.stopPropagation(); hookToggleSelection(file.path, !e.metaKey && !e.ctrlKey, false, index); }}>{file.file_type}</span>
                        {!file.is_dir && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); hookToggleSelection(file.path, !e.metaKey && !e.ctrlKey, false, index); }}>{file.size_formatted}</span>}
                    </div>
                </div>
            ))}
        </div>
    );

    const renderContentView = () => (
        <div style={{ display: 'flex', flexDirection: 'column', padding: '8px', alignContent: 'flex-start' }}>
            {files.map((file, index) => (
                <div
                    key={file.path}
                    draggable
                    onDragStart={(e) => handleDragStart(e, file)}
                    onDragOver={(e) => handleDragOverItem(e, file)}
                    onDragEnter={(e) => handleDragEnterItem(e, file)}
                    onDragLeave={(e) => handleDragLeaveItem(e, file)}
                    onDrop={(e) => handleDropItem(e, file)}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (renamingPath) return;
                        if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);

                        const isAlreadySelected = selectedPaths.has(file.path) && selectedPaths.size === 1;
                        if (isAlreadySelected && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                            renameTimeoutRef.current = setTimeout(() => {
                                startRename(file.path);
                            }, 500);
                        }
                        hookToggleSelection(file.path, !e.ctrlKey && !e.metaKey, e.shiftKey, index);
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (renameTimeoutRef.current) clearTimeout(renameTimeoutRef.current);
                        if (renamingPath) return;
                        handleDoubleClick(file);
                    }}
                    onContextMenu={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, file.path);
                    }}
                    className={`file-item${selectedPaths.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}${dragTarget === file.path ? ' drag-target' : ''}`}
                    data-filepath={file.path}
                    style={{
                        cursor: 'default',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        width: '100%',
                        maxWidth: '800px'
                    }}
                >
                    <FileIcon isDir={file.is_dir} iconId={file.icon_id} size={32} isSymlink={file.is_symlink} isNoAccess={file.is_noaccess} />
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 'bold' }}>{renderFileName(file)}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{file.modified_formatted}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.file_type}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{file.size_formatted}</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    const marqueeRect = marquee ? {
        left: Math.min(marquee.x1, marquee.x2),
        top: Math.min(marquee.y1, marquee.y2),
        width: Math.abs(marquee.x2 - marquee.x1),
        height: Math.abs(marquee.y2 - marquee.y1),
    } : null;

    return (
        <div
            ref={containerRef}
            className={styles.paneContainer}
            onClick={() => {
                if (renamingPath) {
                    commitRename();
                } else if (!marquee && !marqueeJustEnded.current) {
                    clearSelection();
                }
            }}
            onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('.file-item')) return;
                if ((e.target as HTMLElement).closest('th')) return;
                goUp();
            }}
            onContextMenu={(e) => handleContextMenu(e, null)}
            onKeyDown={handleKeyDown}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    setIconSize(prev => Math.max(16, Math.min(256, prev + (e.deltaY < 0 ? 8 : -8))));
                }
            }}
            tabIndex={0}
        >
            {files.length === 0 && (
                <div className={styles.detailCellText} style={{ padding: '32px', textAlign: 'center', width: '100%' }}>
                    このフォルダーは空です。
                </div>
            )}

            {files.length > 0 && viewMode === 'detail' && renderDetailView()}
            {files.length > 0 && viewMode === 'list' && renderListView()}
            {files.length > 0 && ['extra_large_icon', 'large_icon', 'medium_icon', 'small_icon', 'icon'].includes(viewMode as string) && renderIconView()}
            {files.length > 0 && viewMode === 'tiles' && renderTilesView()}
            {files.length > 0 && viewMode === 'content' && renderContentView()}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    targetPath={contextMenu.target}
                    onClose={() => setContextMenu(null)}
                    onStartRename={setRenamingPath}
                    onCreateFolder={handleCreateFolder}
                />
            )}

            {batchRenameState && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'var(--bg-main, #f0f0f0)', border: '1px solid var(--border-color, #ccc)',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.2)', padding: '20px', zIndex: 2000, width: '340px',
                    fontFamily: '"Segoe UI", sans-serif', borderRadius: '4px'
                }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>一括リネーム</h3>
                    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label>プレフィックス:
                            <input value={batchRenameState.prefix} onChange={e => setBatchRenameState({ ...batchRenameState, prefix: e.target.value })}
                                style={{ marginLeft: '8px', padding: '2px 6px', width: '140px' }} />
                        </label>
                        <label>開始番号:
                            <input type="number" value={batchRenameState.startNum} onChange={e => setBatchRenameState({ ...batchRenameState, startNum: parseInt(e.target.value) || 1 })}
                                style={{ marginLeft: '8px', padding: '2px 6px', width: '60px' }} />
                        </label>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                            例: {batchRenameState.prefix} ({batchRenameState.startNum}).ext, {batchRenameState.prefix} ({batchRenameState.startNum + 1}).ext, ...
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', marginTop: '15px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setBatchRenameState(null)} style={{ padding: '4px 12px' }}>キャンセル</button>
                        <button onClick={async () => {
                            const paths = Array.from(selectedPaths);
                            const newNames = paths.map((path, i) => {
                                const ext = path.split('.').pop() || '';
                                return `${batchRenameState.prefix} (${batchRenameState.startNum + i})${ext ? '.' + ext : ''}`;
                            });
                            handleBatchRename(paths, newNames);
                            setBatchRenameState(null);
                        }} style={{ padding: '4px 12px', backgroundColor: '#0078D7', color: 'white', border: 'none', borderRadius: '2px' }}>実行</button>
                    </div>
                </div>
            )}

            {marqueeRect && (
                <div className={styles.marquee} style={{
                    left: `${marqueeRect.left}px`,
                    top: `${marqueeRect.top}px`,
                    width: `${marqueeRect.width}px`,
                    height: `${marqueeRect.height}px`,
                }} />
            )}
        </div>
    );
};
