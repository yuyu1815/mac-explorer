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
    const { tabs, activeTabId, setFiles, setCurrentPath, toggleSelection, clearSelection, selectAll, setFocusedIndex, goBack, goUp, addTab, setSortParams, renameTriggerId, clipboard, setClipboard, setLoading, setViewMode } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    const currentPath = activeTab?.currentPath || '';
    const files = activeTab?.files || [];
    const searchQuery = activeTab?.searchQuery || '';
    const selectedFiles = activeTab?.selectedFiles || new Set<string>();
    const viewMode = activeTab?.viewMode || 'detail';
    const sortBy = activeTab?.sortBy || 'name';
    const sortDesc = activeTab?.sortDesc || false;

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, target: string | null } | null>(null);
    const [showProperties, setShowProperties] = useState(false);
    const [dragTarget, setDragTarget] = useState<string | null>(null);
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameWarning, setRenameWarning] = useState<string | null>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const renameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [colWidths, setColWidths] = useState({ name: 0, modified: 150, file_type: 120, size: 100 });
    const [iconSize, setIconSize] = useState(48);
    const [marquee, setMarquee] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
    const paneRef = useRef<HTMLDivElement>(null);
    const marqueeJustEnded = useRef(false);
    const [batchRename, setBatchRename] = useState<{ prefix: string; startNum: number } | null>(null);

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
                const result = await invoke('list_files_sorted', {
                    path: currentPath,
                    showHidden: false,
                    sortBy,
                    sortDesc,
                    searchQuery: searchQuery || ''
                });
                setFiles(result as any);
            } catch (err) {
                console.error('Failed to list_files_sorted', err);
            }
        };

        fetchFiles();
    }, [currentPath, activeTabId, setFiles, setCurrentPath, sortBy, sortDesc, searchQuery]);

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
        setLoading(true);
        try {
            const result = await invoke('list_files_sorted', {
                path: currentPath,
                showHidden: false,
                sortBy,
                sortDesc,
                searchQuery: searchQuery || ''
            });
            setFiles(result as any);
        } catch (err) {
            console.error('Failed to refresh directory', err);
        } finally {
            setLoading(false);
        }
    };

    // Per-folder view settings (localStorage)
    useEffect(() => {
        try {
            const saved = localStorage.getItem(`viewMode:${currentPath}`);
            if (saved && (saved === 'detail' || saved === 'list' || saved === 'icon')) {
                setViewMode(saved as any);
            }
        } catch { /* localStorage unavailable */ }
    }, [currentPath]);

    useEffect(() => {
        try {
            if (currentPath && viewMode) {
                localStorage.setItem(`viewMode:${currentPath}`, viewMode);
            }
        } catch { /* localStorage unavailable */ }
    }, [viewMode, currentPath]);

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

    const handleDragStart = (e: React.DragEvent, file: { path: string; name: string; is_dir: boolean }) => {
        if (renamingPath === file.path) {
            e.preventDefault();
            return;
        }

        const isSelected = selectedFiles.has(file.path);
        const dragCount = isSelected ? selectedFiles.size : 1;
        const paths = isSelected ? Array.from(selectedFiles) : [file.path];

        if (!isSelected) {
            toggleSelection(file.path, true);
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
        if (file.is_dir && !selectedFiles.has(file.path)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey || e.altKey ? 'copy' : 'move';
        }
    };

    const handleDragEnterItem = (_e: React.DragEvent, file: { path: string; is_dir: boolean }) => {
        if (file.is_dir && !selectedFiles.has(file.path)) {
            setDragTarget(file.path);
        }
    };

    const handleDragLeaveItem = (_e: React.DragEvent, file: { path: string; is_dir: boolean }) => {
        if (dragTarget === file.path) {
            setDragTarget(null);
        }
    };

    const handleDropItem = async (e: React.DragEvent, file: { path: string; is_dir: boolean }) => {
        if (!file.is_dir || selectedFiles.has(file.path)) return;
        e.preventDefault();
        e.stopPropagation();
        setDragTarget(null);
        try {
            const data = e.dataTransfer.getData('application/json');
            if (data) {
                const { sourcePaths } = JSON.parse(data);
                const isCopy = e.ctrlKey || e.metaKey || e.altKey;

                // Prevent dropping into itself or its own subdirectories
                const sep = file.path.includes('\\') ? '\\' : '/';
                const invalidDrop = sourcePaths.some((p: string) => file.path === p || file.path.startsWith(p + sep));
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

        // Ctrl+T 新規タブ
        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
            e.preventDefault();
            addTab();
            return;
        }

        // Ctrl+Tab タブ切替
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

        // Alt+Enter プロパティ
        if (e.altKey && e.key === 'Enter') {
            e.preventDefault();
            setShowProperties(true);
            return;
        }

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
            if (e.shiftKey) {
                toggleSelection(sortedFiles[nextIndex].path, false, true, sortedFiles.map(f => f.path));
            } else if (!e.ctrlKey) {
                toggleSelection(sortedFiles[nextIndex].path, true);
            }
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

        // Ctrl+M 一括リネーム
        if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
            e.preventDefault();
            if (selectedFiles.size > 1) {
                setBatchRename({ prefix: 'File', startNum: 1 });
            }
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

    // Rust側のlist_files_sortedでソート済みのファイル一覧をそのまま使用
    const sortedFiles = files;

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
                            border: '1px solid black',
                            color: '#000000',
                            padding: '0 2px',
                            height: '20px',
                            fontSize: '12px',
                            outline: 'none',
                            width: '300px',
                            maxWidth: '100%',
                            fontFamily: 'Segoe UI',
                            userSelect: 'text'
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
        if (!searchQuery) return <span>{file.name}</span>;

        const parts = file.name.split(new RegExp(`(${searchQuery})`, 'gi'));
        return (
            <span>
                {parts.map((part: string, i: number) =>
                    part.toLowerCase() === searchQuery.toLowerCase() ? (
                        <span key={i} style={{ backgroundColor: '#FFE200', color: '#000' }}>{part}</span>
                    ) : (
                        part
                    )
                )}
            </span>
        );
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
                {sortedFiles.map((file, index) => (
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

                            const isAlreadySelected = selectedFiles.has(file.path) && selectedFiles.size === 1;
                            if (isAlreadySelected && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                renameTimeoutRef.current = setTimeout(() => {
                                    startRename(file.path);
                                }, 500);
                            }
                            toggleSelection(file.path, !e.ctrlKey && !e.metaKey, e.shiftKey, sortedFiles.map(f => f.path));
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
                        className={`file-item${selectedFiles.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}${index % 2 === 1 ? ' zebra' : ''}${dragTarget === file.path ? ' drag-target' : ''}`}
                        data-filepath={file.path}
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

                        const isAlreadySelected = selectedFiles.has(file.path) && selectedFiles.size === 1;
                        if (isAlreadySelected && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                            renameTimeoutRef.current = setTimeout(() => {
                                startRename(file.path);
                            }, 500);
                        }
                        toggleSelection(file.path, !e.ctrlKey && !e.metaKey, e.shiftKey, sortedFiles.map(f => f.path));
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
                    className={`file-item${selectedFiles.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}${dragTarget === file.path ? ' drag-target' : ''}`}
                    data-filepath={file.path}
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

                        const isAlreadySelected = selectedFiles.has(file.path) && selectedFiles.size === 1;
                        if (isAlreadySelected && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                            renameTimeoutRef.current = setTimeout(() => {
                                startRename(file.path);
                            }, 500);
                        }
                        toggleSelection(file.path, !e.ctrlKey && !e.metaKey, e.shiftKey, sortedFiles.map(f => f.path));
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
                    className={`file-item${selectedFiles.has(file.path) ? ' selected' : ''}${file.is_hidden ? ' hidden' : ''}${dragTarget === file.path ? ' drag-target' : ''}`}
                    data-filepath={file.path}
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
            // Apply selection via store — clear first, then add intersecting
            const { clearSelection: clr, toggleSelection: tog } = useAppStore.getState();
            clr();
            newSelected.forEach(p => tog(p, false));
        };

        const onUp = () => {
            marqueeJustEnded.current = true;
            setMarquee(null);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            setTimeout(() => { marqueeJustEnded.current = false; }, 0);
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
            style={{ flex: 1, backgroundColor: 'var(--bg-main)', overflowY: 'auto', outline: 'none', position: 'relative', userSelect: 'none' }}
            onClick={() => { if (!renamingPath && !marquee && !marqueeJustEnded.current) clearSelection(); }}
            onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('.file-item')) return;
                if ((e.target as HTMLElement).closest('th')) return;
                goUp();
            }}
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

            {showProperties && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: '#f0f0f0', border: '1px solid #ccc', boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                    padding: '20px', zIndex: 2000, width: '300px', fontFamily: 'Segoe UI'
                }}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'normal' }}>プロパティ</h3>
                    <div style={{ fontSize: '12px' }}>
                        <p>選択された項目: {selectedFiles.size}</p>
                        <p>この機能は現在モック版です。</p>
                    </div>
                    <div style={{ textAlign: 'right', marginTop: '15px' }}>
                        <button onClick={() => setShowProperties(false)} style={{ padding: '4px 12px' }}>OK</button>
                    </div>
                </div>
            )}

            {batchRename && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'var(--bg-main, #f0f0f0)', border: '1px solid var(--border-color, #ccc)',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.2)', padding: '20px', zIndex: 2000, width: '340px',
                    fontFamily: '"Segoe UI", sans-serif', borderRadius: '4px'
                }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>一括リネーム</h3>
                    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label>プレフィックス:
                            <input value={batchRename.prefix} onChange={e => setBatchRename({ ...batchRename, prefix: e.target.value })}
                                style={{ marginLeft: '8px', padding: '2px 6px', width: '140px' }} />
                        </label>
                        <label>開始番号:
                            <input type="number" value={batchRename.startNum} onChange={e => setBatchRename({ ...batchRename, startNum: parseInt(e.target.value) || 1 })}
                                style={{ marginLeft: '8px', padding: '2px 6px', width: '60px' }} />
                        </label>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                            例: {batchRename.prefix} ({batchRename.startNum}).ext, {batchRename.prefix} ({batchRename.startNum + 1}).ext, ...
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', marginTop: '15px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setBatchRename(null)} style={{ padding: '4px 12px' }}>キャンセル</button>
                        <button onClick={async () => {
                            const paths = Array.from(selectedFiles);
                            let num = batchRename.startNum;
                            for (const p of paths) {
                                const ext = p.includes('.') ? '.' + p.split('.').pop() : '';
                                const newName = `${batchRename.prefix} (${num})${ext}`;
                                try { await invoke('rename_file', { path: p, newName }); } catch (err) { console.error(err); }
                                num++;
                            }
                            setBatchRename(null);
                            await refreshFiles();
                        }} style={{ padding: '4px 12px', backgroundColor: '#0078D7', color: 'white', border: 'none', borderRadius: '2px' }}>実行</button>
                    </div>
                </div>
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
