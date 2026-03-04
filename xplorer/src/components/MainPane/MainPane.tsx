import { useEffect, useState, useRef, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { format } from 'date-fns';
import { ContextMenu } from '../ContextMenu/ContextMenu';
import { Folder, FileText } from 'lucide-react';

const FileIcon = ({ isDir, size = 16 }: { isDir: boolean, size?: number }) => (
    isDir
        ? <Folder size={size} fill="#FFB900" color="#F2A000" strokeWidth={1} style={{ flexShrink: 0 }} />
        : <FileText size={size} fill="#FFFFFF" color="#5D5D5D" strokeWidth={1.5} style={{ flexShrink: 0 }} />
);

export const MainPane = () => {
    const { tabs, activeTabId, setFiles, setCurrentPath, toggleSelection, clearSelection, selectAll, setFocusedIndex, goBack, setSortParams, renameTriggerId, clipboard, setClipboard } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    const currentPath = activeTab?.currentPath || '';
    const files = activeTab?.files || [];
    const selectedFiles = activeTab?.selectedFiles || new Set<string>();
    const viewMode = activeTab?.viewMode || 'detail';
    const sortBy = activeTab?.sortBy || 'name';
    const sortDesc = activeTab?.sortDesc || false;

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, target: string | null } | null>(null);
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameWarning, setRenameWarning] = useState<string | null>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const [colWidths, setColWidths] = useState({ name: 0, modified: 150, file_type: 120, size: 100 });
    const [iconSize, setIconSize] = useState(48);
    const [marquee, setMarquee] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
    const paneRef = useRef<HTMLDivElement>(null);

    // Context menu opening ignores default behavior
    useEffect(() => {
        const handleNativeContextMenu = (e: globalThis.MouseEvent) => e.preventDefault();
        document.addEventListener('contextmenu', handleNativeContextMenu);
        return () => document.removeEventListener('contextmenu', handleNativeContextMenu);
    }, []);

    useEffect(() => {
        if (!currentPath) {
            setCurrentPath('/');
            return;
        }

        const fetchFiles = async () => {
            try {
                const result = await invoke('list_directory', { path: currentPath, showHidden: false });
                setFiles(result as any);
            } catch (err) {
                console.error('Failed to list directory', err);
            }
        };

        fetchFiles();
    }, [currentPath, activeTabId, setFiles, setCurrentPath]);

    // リネーム開始時にinputをフォーカス＆全選択
    useEffect(() => {
        if (renamingPath && renameInputRef.current) {
            renameInputRef.current.focus();
            // 拡張子を除いた名前部分のみを選択
            const dotIndex = renameValue.lastIndexOf('.');
            if (dotIndex > 0) {
                renameInputRef.current.setSelectionRange(0, dotIndex);
            } else {
                renameInputRef.current.select();
            }
        }
    }, [renamingPath]);

    // リボン等からの外部リネームトリガー監視
    useEffect(() => {
        if (renameTriggerId > 0 && selectedFiles.size === 1) {
            const targetPath = Array.from(selectedFiles)[0];
            startRename(targetPath);
        }
    }, [renameTriggerId]);

    const refreshFiles = async () => {
        try {
            const result = await invoke('list_directory', { path: currentPath, showHidden: false });
            setFiles(result as any);
        } catch (err) {
            console.error('Failed to refresh directory', err);
        }
    };

    const startRename = (path: string) => {
        const fileName = path.split('/').pop() || path.split('\\').pop() || '';
        setRenamingPath(path);
        setRenameValue(fileName);
    };

    const commitRename = async () => {
        if (!renamingPath || !renameValue.trim()) {
            setRenamingPath(null);
            return;
        }

        const originalName = renamingPath.split('/').pop() || '';
        if (renameValue.trim() === originalName) {
            setRenamingPath(null);
            return;
        }

        try {
            await invoke('rename_file', { path: renamingPath, newName: renameValue.trim() });
            await refreshFiles();
        } catch (err) {
            console.error('Failed to rename', err);
        }
        setRenamingPath(null);
    };

    const cancelRename = () => {
        setRenamingPath(null);
    };

    const handleCreateFolder = async () => {
        const sep = currentPath.includes('\\') ? '\\' : '/';
        const defaultName = '新しいフォルダー';
        const newPath = currentPath.endsWith(sep) ? `${currentPath}${defaultName}` : `${currentPath}${sep}${defaultName}`;

        try {
            await invoke('create_directory', { path: newPath });
            await refreshFiles();
            startRename(newPath);
        } catch (err) {
            console.error('Failed to create directory', err);
        }
    };

    const handleDoubleClick = async (file: any) => {
        if (file.is_dir) {
            setCurrentPath(file.path);
        } else {
            try {
                await invoke('open_file_default', { path: file.path });
            } catch (err) {
                console.error('Failed to open file', err);
            }
        }
    };

    const formatSize = (bytes: number, is_dir: boolean) => {
        if (is_dir) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return Math.ceil(bytes / 1024) + ' KB';
        return Math.ceil(bytes / 1024 / 1024) + ' MB';
    };

    const handleContextMenu = (e: ReactMouseEvent, path: string | null) => {
        e.preventDefault();
        if (path && !selectedFiles.has(path)) {
            toggleSelection(path, true);
        }
        setContextMenu({ x: e.clientX, y: e.clientY, target: path });
    };

    const typeAheadBuffer = useRef('');
    const typeAheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleKeyDown = async (e: KeyboardEvent) => {
        if (renamingPath) return;

        // Ctrl+A 全選択
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            selectAll();
            return;
        }

        // Ctrl+Shift+N 新規フォルダ
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
            e.preventDefault();
            handleCreateFolder();
            return;
        }

        // Ctrl+Shift+C パスコピー
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
            e.preventDefault();
            const paths = Array.from(selectedFiles);
            if (paths.length > 0) {
                navigator.clipboard.writeText(paths.join('\n'));
            }
            return;
        }

        // Ctrl+C ファイルコピー
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
            if (selectedFiles.size > 0) {
                e.preventDefault();
                setClipboard({ files: Array.from(selectedFiles), operation: 'copy' });
            }
            return;
        }

        // Ctrl+X ファイル切り取り
        if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) {
            if (selectedFiles.size > 0) {
                e.preventDefault();
                setClipboard({ files: Array.from(selectedFiles), operation: 'cut' });
            }
            return;
        }

        // Ctrl+V ファイル貼り付け
        if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
            e.preventDefault();
            if (clipboard) {
                if (clipboard.operation === 'copy') {
                    await invoke('copy_files', { sources: clipboard.files, dest: currentPath });
                } else {
                    await invoke('move_files', { sources: clipboard.files, dest: currentPath });
                    setClipboard(null);
                }
                await refreshFiles();
            }
            return;
        }

        // F5 リフレッシュ
        if (e.key === 'F5') {
            e.preventDefault();
            await refreshFiles();
            return;
        }

        // 矢印キーでフォーカス移動
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const focusedIndex = activeTab?.focusedIndex ?? -1;
            const maxIndex = sortedFiles.length - 1;
            if (maxIndex < 0) return;

            const nextIndex = e.key === 'ArrowDown'
                ? Math.min(focusedIndex + 1, maxIndex)
                : Math.max(focusedIndex - 1, 0);

            setFocusedIndex(nextIndex);
            toggleSelection(sortedFiles[nextIndex].path, true);
            return;
        }

        // Home / End キー
        if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            if (sortedFiles.length === 0) return;
            const idx = e.key === 'Home' ? 0 : sortedFiles.length - 1;
            setFocusedIndex(idx);
            toggleSelection(sortedFiles[idx].path, true);
            return;
        }

        // Enter でフォルダを開く/ファイル実行
        if (e.key === 'Enter' && selectedFiles.size === 1) {
            const targetPath = Array.from(selectedFiles)[0];
            const targetFile = files.find(f => f.path === targetPath);
            if (targetFile) {
                handleDoubleClick(targetFile);
            }
            return;
        }

        // Backspace で履歴を戻る
        if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            goBack();
            return;
        }

        // Shift+Delete 完全削除
        if (e.key === 'Delete' && e.shiftKey && selectedFiles.size > 0) {
            if (confirm(`選択した${selectedFiles.size}項目を完全に削除しますか？（元に戻せません）`)) {
                await invoke('delete_files', { paths: Array.from(selectedFiles), toTrash: false });
                await refreshFiles();
            }
            return;
        }

        // Delete ゴミ箱へ移動
        if (e.key === 'Delete' && selectedFiles.size > 0) {
            if (confirm(`選択した${selectedFiles.size}項目をゴミ箱に移動しますか？`)) {
                await invoke('delete_files', { paths: Array.from(selectedFiles), toTrash: true });
                await refreshFiles();
            }
            return;
        }

        // F2 リネーム（拡張子除外選択）
        if (e.key === 'F2' && selectedFiles.size === 1) {
            const targetPath = Array.from(selectedFiles)[0];
            startRename(targetPath);
            return;
        }

        // タイプアヘッド検索（英数字キー入力でファイル名ジャンプ）
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            typeAheadBuffer.current += e.key.toLowerCase();
            if (typeAheadTimer.current) clearTimeout(typeAheadTimer.current);
            typeAheadTimer.current = setTimeout(() => { typeAheadBuffer.current = ''; }, 800);

            const match = sortedFiles.findIndex(f =>
                f.name.toLowerCase().startsWith(typeAheadBuffer.current)
            );
            if (match !== -1) {
                setFocusedIndex(match);
                toggleSelection(sortedFiles[match].path, true);
            }
        }
    };

    const sortedFiles = [...files].sort((a, b) => {
        let valA: any = a[sortBy as keyof typeof a];
        let valB: any = b[sortBy as keyof typeof b];

        if (sortBy !== 'file_type' && a.is_dir !== b.is_dir) {
            return a.is_dir ? -1 : 1;
        }

        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB as string).toLowerCase();
        }

        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    });

    const SortIndicator = ({ column }: { column: string }) => {
        if (sortBy !== column) return null;
        return <span style={{ marginLeft: '4px', fontSize: '9px', color: '#666' }}>{sortDesc ? '▼' : '▲'}</span>;
    };

    const INVALID_CHARS = /[/:\\*?"<>|]/g; // Extended invalid chars per Windows

    const renderFileName = (file: any) => {
        if (renamingPath === file.path) {
            return (
                <div style={{ position: 'relative', width: '100%' }}>
                    <input
                        ref={renameInputRef}
                        data-testid="rename-input"
                        value={renameValue}
                        onChange={(e) => {
                            const raw = e.target.value;
                            if (INVALID_CHARS.test(raw)) {
                                setRenameWarning('ファイル名には / \\ : * ? " < > | は使えません');
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
                        style={{
                            background: '#FFFFFF',
                            border: '1px solid black', // Windows 10 uses black or blue border for inline rename
                            color: '#000000',
                            padding: '0 2px', // Minimal padding
                            height: '20px',
                            fontSize: '12px',
                            outline: 'none',
                            width: '300px', // Allow longer input width natively
                            maxWidth: '100%',
                            fontFamily: 'Segoe UI'
                        }}
                    />
                    {renameWarning && (
                        <div
                            data-testid="rename-warning"
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                color: '#fff',
                                backgroundColor: 'rgba(200, 50, 50, 0.9)',
                                whiteSpace: 'nowrap',
                                zIndex: 100,
                            }}
                        >
                            {renameWarning}
                        </div>
                    )}
                </div>
            );
        }
        return <span>{file.name}</span>;
    };

    const rowHeight = '22px'; // Extreme density

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
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '4px', cursor: 'col-resize', zIndex: 5 }}
        />
    );

    const renderDetailView = () => (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
            <colgroup>
                <col />
                <col style={{ width: colWidths.modified }} />
                <col style={{ width: colWidths.file_type }} />
                <col style={{ width: colWidths.size }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-main)', zIndex: 10 }}>
                <tr style={{ height: rowHeight, borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0 6px', fontWeight: 'normal', cursor: 'pointer', borderRight: '1px solid var(--border-color)', position: 'relative' }} onClick={() => setSortParams('name')}>
                        名前 <SortIndicator column="name" />
                    </th>
                    <th style={{ padding: '0 6px', fontWeight: 'normal', cursor: 'pointer', borderRight: '1px solid var(--border-color)', position: 'relative' }} onClick={() => setSortParams('modified')}>
                        更新日時 <SortIndicator column="modified" />
                        <ResizeHandle column="modified" />
                    </th>
                    <th style={{ padding: '0 6px', fontWeight: 'normal', cursor: 'pointer', borderRight: '1px solid var(--border-color)', position: 'relative' }} onClick={() => setSortParams('file_type')}>
                        種類 <SortIndicator column="file_type" />
                        <ResizeHandle column="file_type" />
                    </th>
                    <th style={{ padding: '0 6px', fontWeight: 'normal', textAlign: 'right', cursor: 'pointer', position: 'relative' }} onClick={() => setSortParams('size')}>
                        サイズ <SortIndicator column="size" />
                        <ResizeHandle column="size" />
                    </th>
                </tr>
            </thead>
            <tbody>
                {sortedFiles.map(file => (
                    <tr
                        key={file.path}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (renamingPath) return;
                            toggleSelection(file.path, !e.ctrlKey && !e.metaKey, e.shiftKey);
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (renamingPath) return;
                            handleDoubleClick(file);
                        }}
                        onContextMenu={(e) => {
                            e.stopPropagation();
                            handleContextMenu(e, file.path);
                        }}
                        className={`file-item${selectedFiles.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}`}
                        style={{ height: rowHeight, cursor: 'default' }}
                    >
                        <td style={{ padding: '0 4px', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', height: rowHeight }}>
                            <FileIcon isDir={file.is_dir} size={16} /> {renderFileName(file)}
                        </td>
                        <td style={{ padding: '0 6px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                            {format(new Date(file.modified * 1000), 'yyyy/MM/dd HH:mm')}
                        </td>
                        <td style={{ padding: '0 6px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.file_type}
                        </td>
                        <td style={{ padding: '0 6px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {formatSize(file.size, file.is_dir)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderListView = () => (
        <div style={{ display: 'flex', flexWrap: 'wrap', padding: '2px', alignContent: 'flex-start' }}>
            {sortedFiles.map(file => (
                <div
                    key={file.path}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (renamingPath) return;
                        toggleSelection(file.path, !e.ctrlKey && !e.metaKey, e.shiftKey);
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (renamingPath) return;
                        handleDoubleClick(file);
                    }}
                    onContextMenu={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, file.path);
                    }}
                    className={`file-item${selectedFiles.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}`}
                    style={{
                        cursor: 'default',
                        padding: '0 6px',
                        width: '240px',
                        height: rowHeight,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    <FileIcon isDir={file.is_dir} size={16} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{renderFileName(file)}</span>
                </div>
            ))}
        </div>
    );

    const renderIconView = () => (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${iconSize + 40}px, 1fr))`, gap: '4px', padding: '8px' }}>
            {sortedFiles.map(file => (
                <div
                    key={file.path}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (renamingPath) return;
                        toggleSelection(file.path, !e.ctrlKey && !e.metaKey, e.shiftKey);
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (renamingPath) return;
                        handleDoubleClick(file);
                    }}
                    onContextMenu={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, file.path);
                    }}
                    className={`file-item${selectedFiles.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}`}
                    style={{
                        cursor: 'default',
                        padding: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        textAlign: 'center'
                    }}
                >
                    <FileIcon isDir={file.is_dir} size={iconSize} />
                    <span style={{
                        fontSize: '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-all',
                        width: '100%',
                        lineHeight: '1.2'
                    }}>{renderFileName(file)}</span>
                </div>
            ))}
        </div>
    );

    const handleMarqueeStart = (e: React.MouseEvent) => {
        // Only start marquee from blank area (left button, no file-item clicked)
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('.file-item')) return;
        if ((e.target as HTMLElement).closest('th')) return;

        const pane = paneRef.current;
        if (!pane) return;

        const rect = pane.getBoundingClientRect();
        const startX = e.clientX - rect.left + pane.scrollLeft;
        const startY = e.clientY - rect.top + pane.scrollTop;

        setMarquee({ startX, startY, x: startX, y: startY });
        if (!e.ctrlKey && !e.metaKey) clearSelection();

        const onMove = (ev: MouseEvent) => {
            const mx = ev.clientX - rect.left + pane.scrollLeft;
            const my = ev.clientY - rect.top + pane.scrollTop;
            setMarquee(prev => prev ? { ...prev, x: mx, y: my } : null);

            // select items that intersect
            const selX = Math.min(startX, mx);
            const selY = Math.min(startY, my);
            const selW = Math.abs(mx - startX);
            const selH = Math.abs(my - startY);

            const items = pane.querySelectorAll('.file-item');
            const newSelected = new Set<string>();
            items.forEach(item => {
                const ir = item.getBoundingClientRect();
                const itemX = ir.left - rect.left + pane.scrollLeft;
                const itemY = ir.top - rect.top + pane.scrollTop;
                if (itemX < selX + selW && itemX + ir.width > selX &&
                    itemY < selY + selH && itemY + ir.height > selY) {
                    const path = (item as HTMLElement).dataset.filepath;
                    if (path) newSelected.add(path);
                }
            });
            // Apply selection via store
            newSelected.forEach(p => {
                if (!selectedFiles.has(p)) toggleSelection(p, false);
            });
        };

        const onUp = () => {
            setMarquee(null);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const marqueeRect = marquee ? {
        left: Math.min(marquee.startX, marquee.x),
        top: Math.min(marquee.startY, marquee.y),
        width: Math.abs(marquee.x - marquee.startX),
        height: Math.abs(marquee.y - marquee.startY),
    } : null;

    return (
        <div
            ref={paneRef}
            className="main-pane-container"
            style={{ flex: 1, backgroundColor: 'var(--bg-main)', overflowY: 'auto', outline: 'none', position: 'relative' }}
            onClick={() => { if (!renamingPath && !marquee) clearSelection(); }}
            onContextMenu={(e) => handleContextMenu(e, null)}
            onKeyDown={handleKeyDown}
            onMouseDown={handleMarqueeStart}
            onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    setIconSize(prev => Math.max(16, Math.min(256, prev + (e.deltaY < 0 ? 8 : -8))));
                }
            }}
            tabIndex={0}
        >
            {files.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', width: '100%' }}>
                    このフォルダーは空です。
                </div>
            )}

            {files.length > 0 && viewMode === 'detail' && renderDetailView()}
            {files.length > 0 && viewMode === 'list' && renderListView()}
            {files.length > 0 && viewMode === 'icon' && renderIconView()}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    targetPath={contextMenu.target}
                    onClose={() => setContextMenu(null)}
                    onStartRename={startRename}
                    onCreateFolder={handleCreateFolder}
                />
            )}

            {marqueeRect && (
                <div style={{
                    position: 'absolute',
                    left: `${marqueeRect.left}px`,
                    top: `${marqueeRect.top}px`,
                    width: `${marqueeRect.width}px`,
                    height: `${marqueeRect.height}px`,
                    backgroundColor: 'rgba(0, 120, 215, 0.4)',
                    border: '1px solid rgba(0, 120, 215, 0.8)',
                    pointerEvents: 'none',
                    zIndex: 1000
                }} />
            )}
        </div>
    );
};
