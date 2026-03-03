import { useEffect, useState, useRef, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { format } from 'date-fns';
import { ContextMenu } from '../ContextMenu/ContextMenu';
import { Folder, FileText } from 'lucide-react';

const FileIcon = ({ isDir, size = 16 }: { isDir: boolean, size?: number }) => (
    isDir
        ? <Folder size={size} fill="#FFCA28" color="#F5B041" strokeWidth={1} style={{ flexShrink: 0 }} />
        : <FileText size={size} fill="var(--bg-main)" color="var(--text-muted)" strokeWidth={1.5} style={{ flexShrink: 0 }} />
);

export const MainPane = () => {
    const { tabs, activeTabId, setFiles, setCurrentPath, toggleSelection, clearSelection, setSortParams } = useAppStore();
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
    const renameInputRef = useRef<HTMLInputElement>(null);

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
            // 作成直後にインラインリネームモードに入る
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
        if (is_dir) return '--';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const handleContextMenu = (e: ReactMouseEvent, path: string | null) => {
        e.preventDefault();
        if (path && !selectedFiles.has(path)) {
            toggleSelection(path, true);
        }
        setContextMenu({ x: e.clientX, y: e.clientY, target: path });
    };

    const handleKeyDown = async (e: KeyboardEvent) => {
        // リネーム中はキーボードショートカットを無効化
        if (renamingPath) return;

        if (selectedFiles.size === 0) return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (confirm(`選択した${selectedFiles.size}項目をゴミ箱に移動しますか？`)) {
                await invoke('delete_files', { paths: Array.from(selectedFiles), toTrash: true });
                await refreshFiles();
            }
        }

        if (e.key === 'F2' && selectedFiles.size === 1) {
            const targetPath = Array.from(selectedFiles)[0];
            startRename(targetPath);
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
        return <span style={{ marginLeft: '4px', fontSize: '10px' }}>{sortDesc ? '▼' : '▲'}</span>;
    };

    const renderFileName = (file: any) => {
        if (renamingPath === file.path) {
            return (
                <input
                    ref={renameInputRef}
                    data-testid="rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') cancelRename();
                    }}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--accent-blue)',
                        color: 'var(--text-main)',
                        padding: '2px 4px',
                        fontSize: '13px',
                        outline: 'none',
                        width: '100%',
                        borderRadius: '2px',
                    }}
                />
            );
        }
        return <>{file.name}</>;
    };

    const renderDetailView = () => (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-main)', zIndex: 10 }}>
                <tr style={{ borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 16px', fontWeight: 'normal', cursor: 'pointer' }} onClick={() => setSortParams('name')}>
                        名前 <SortIndicator column="name" />
                    </th>
                    <th style={{ padding: '8px 16px', fontWeight: 'normal', width: '200px', cursor: 'pointer' }} onClick={() => setSortParams('modified')}>
                        更新日時 <SortIndicator column="modified" />
                    </th>
                    <th style={{ padding: '8px 16px', fontWeight: 'normal', width: '150px', cursor: 'pointer' }} onClick={() => setSortParams('file_type')}>
                        種類 <SortIndicator column="file_type" />
                    </th>
                    <th style={{ padding: '8px 16px', fontWeight: 'normal', width: '100px', textAlign: 'right', cursor: 'pointer' }} onClick={() => setSortParams('size')}>
                        サイズ <SortIndicator column="size" />
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
                        style={{
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border-color)',
                            backgroundColor: selectedFiles.has(file.path) ? 'var(--selected-bg)' : 'transparent'
                        }}
                    >
                        <td style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <FileIcon isDir={file.is_dir} size={18} /> {renderFileName(file)}
                        </td>
                        <td style={{ padding: '8px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {format(new Date(file.modified * 1000), 'yyyy/MM/dd HH:mm')}
                        </td>
                        <td style={{ padding: '8px 16px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.file_type}
                        </td>
                        <td style={{ padding: '8px 16px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {formatSize(file.size, file.is_dir)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderListView = () => (
        <div style={{ display: 'flex', flexWrap: 'wrap', padding: '8px', alignContent: 'flex-start' }}>
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
                    style={{
                        cursor: 'pointer',
                        padding: '4px 12px',
                        width: '250px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: selectedFiles.has(file.path) ? 'var(--selected-bg)' : 'transparent'
                    }}
                >
                    <FileIcon isDir={file.is_dir} size={18} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{renderFileName(file)}</span>
                </div>
            ))}
        </div>
    );

    const renderIconView = () => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '16px', padding: '16px' }}>
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
                    style={{
                        cursor: 'pointer',
                        padding: '12px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: selectedFiles.has(file.path) ? 'var(--selected-bg)' : 'transparent',
                        textAlign: 'center'
                    }}
                >
                    <FileIcon isDir={file.is_dir} size={48} />
                    <span style={{
                        fontSize: '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-all',
                        width: '100%'
                    }}>{renderFileName(file)}</span>
                </div>
            ))}
        </div>
    );

    return (
        <div
            style={{ flex: 1, backgroundColor: 'var(--bg-main)', overflowY: 'auto' }}
            onClick={() => { if (!renamingPath) clearSelection(); }}
            onContextMenu={(e) => handleContextMenu(e, null)}
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            {files.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', width: '100%' }}>
                    空のフォルダーです。
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
        </div>
    );
};
