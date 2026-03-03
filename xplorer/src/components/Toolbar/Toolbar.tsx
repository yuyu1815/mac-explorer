import { useAppStore } from '../../stores/appStore';
import { invoke } from '@tauri-apps/api/core';
import { FolderPlus, Scissors, Copy, ClipboardPaste, Trash2, List, AlignJustify, LayoutGrid } from 'lucide-react';

export const Toolbar = () => {
    const { tabs, activeTabId, clipboard, setClipboard, setFiles, setViewMode } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    const selectedFiles = activeTab ? activeTab.selectedFiles : new Set<string>();
    const currentPath = activeTab?.currentPath || '';
    const viewMode = activeTab?.viewMode || 'detail';

    const handleCopy = () => {
        if (selectedFiles.size > 0) {
            setClipboard({ files: Array.from(selectedFiles), operation: 'copy' });
        }
    };

    const handleCut = () => {
        if (selectedFiles.size > 0) {
            setClipboard({ files: Array.from(selectedFiles), operation: 'cut' });
        }
    };

    const handlePaste = async () => {
        if (!clipboard || clipboard.files.length === 0) return;

        try {
            if (clipboard.operation === 'copy') {
                await invoke('copy_files', { sources: clipboard.files, dest: currentPath });
            } else {
                await invoke('move_files', { sources: clipboard.files, dest: currentPath });
                setClipboard(null); // Clear clipboard after cut & paste
            }
            // Refresh directory
            const result = await invoke('list_directory', { path: currentPath, showHidden: false });
            setFiles(result as any);
        } catch (err) {
            console.error('Paste failed', err);
        }
    };

    const handleDelete = async () => {
        if (selectedFiles.size === 0) return;
        try {
            await invoke('delete_files', { paths: Array.from(selectedFiles), toTrash: true });
            // Refresh directory
            const result = await invoke('list_directory', { path: currentPath, showHidden: false });
            setFiles(result as any);
        } catch (err) {
            console.error('Delete failed', err);
        }
    };

    const handleNewFolder = async () => {
        const name = prompt('フォルダ名を入力してください', '新しいフォルダー');
        if (!name) return;
        try {
            const sep = currentPath.includes('\\') ? '\\' : '/';
            const newPath = currentPath.endsWith(sep) ? `${currentPath}${name}` : `${currentPath}${sep}${name}`;
            await invoke('create_directory', { path: newPath });
            const result = await invoke('list_directory', { path: currentPath, showHidden: false });
            setFiles(result as any);
        } catch (err) {
            console.error('Create folder failed', err);
        }
    };

    const buttonStyle = {
        padding: '4px 12px',
        border: 'none',
        backgroundColor: 'transparent',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-main)',
        cursor: 'pointer',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    };

    return (
        <div style={{
            height: '40px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-main)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            gap: '4px'
        }}>
            <button style={buttonStyle} onClick={handleNewFolder}><FolderPlus size={16} /> <span style={{ marginLeft: '4px' }}>新規作成</span></button>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />
            <button style={{ ...buttonStyle, opacity: selectedFiles.size > 0 ? 1 : 0.5 }} onClick={handleCut} disabled={selectedFiles.size === 0}><Scissors size={16} /> <span style={{ marginLeft: '4px' }}>切り取り</span></button>
            <button style={{ ...buttonStyle, opacity: selectedFiles.size > 0 ? 1 : 0.5 }} onClick={handleCopy} disabled={selectedFiles.size === 0}><Copy size={16} /> <span style={{ marginLeft: '4px' }}>コピー</span></button>
            <button style={{ ...buttonStyle, opacity: clipboard !== null ? 1 : 0.5 }} onClick={handlePaste} disabled={clipboard === null}><ClipboardPaste size={16} /> <span style={{ marginLeft: '4px' }}>貼り付け</span></button>
            <button style={{ ...buttonStyle, opacity: selectedFiles.size > 0 ? 1 : 0.5 }} onClick={handleDelete} disabled={selectedFiles.size === 0}><Trash2 size={16} /> <span style={{ marginLeft: '4px' }}>削除</span></button>

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', gap: '2px', backgroundColor: 'var(--border-color)', padding: '2px', borderRadius: 'var(--radius-sm)' }}>
                <button
                    style={{ ...buttonStyle, backgroundColor: viewMode === 'detail' ? 'var(--bg-side)' : 'transparent', padding: '4px 8px' }}
                    onClick={() => setViewMode('detail')}
                    title="詳細"
                >
                    <List size={16} />
                </button>
                <button
                    style={{ ...buttonStyle, backgroundColor: viewMode === 'list' ? 'var(--bg-side)' : 'transparent', padding: '4px 8px' }}
                    onClick={() => setViewMode('list')}
                    title="リスト"
                >
                    <AlignJustify size={16} />
                </button>
                <button
                    style={{ ...buttonStyle, backgroundColor: viewMode === 'icon' ? 'var(--bg-side)' : 'transparent', padding: '4px 8px' }}
                    onClick={() => setViewMode('icon')}
                    title="アイコン"
                >
                    <LayoutGrid size={16} />
                </button>
            </div>
        </div>
    );
};
