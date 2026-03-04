import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { invoke } from '@tauri-apps/api/core';
import {
    ClipboardPaste, Scissors, Copy, Link as LinkIcon, Edit2, Trash2, FolderPlus,
    FilePlus, List, AlignJustify, LayoutGrid, CheckSquare, XSquare, ArrowRightSquare,
    FolderOpen, Settings, ChevronUp, ChevronDown, Monitor, PanelRight, ArrowDownAZ, EyeOff
} from 'lucide-react';

export const Toolbar = () => {
    const { tabs, activeTabId, clipboard, setClipboard, setFiles, setViewMode, selectAll, clearSelection, invertSelection, triggerRename, showDetailsPane, toggleDetailsPane, openPropertiesDialog, showHiddenFiles, setShowHiddenFiles, showFileExtensions, setShowFileExtensions, showItemCheckBoxes, setShowItemCheckBoxes } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    const selectedFiles = activeTab?.selectedFiles || new Set<string>();
    const currentPath = activeTab?.currentPath || '';
    const viewMode = activeTab?.viewMode || 'detail';

    const [isPinned, setIsPinned] = useState(true);
    const [activeRibbonTab, setActiveRibbonTab] = useState<'home' | 'share' | 'view'>('home');
    const [isPopupOpen, setIsPopupOpen] = useState(false);

    const popupRef = useRef<HTMLDivElement>(null);

    // Global click listener to close unpinned ribbon popup
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!isPinned && isPopupOpen && popupRef.current && !popupRef.current.contains(e.target as Node)) {
                // If clicked outside the ribbon, close it
                // Make sure we didn't click the tabs themselves (handled in tab click)
                const target = e.target as HTMLElement;
                if (!target.closest('.ribbon-tabs-container')) {
                    setIsPopupOpen(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isPinned, isPopupOpen]);

    const handleTabClick = (tabId: 'home' | 'share' | 'view') => {
        setActiveRibbonTab(tabId);
        if (!isPinned) {
            setIsPopupOpen(true);
        }
    };

    const togglePin = () => {
        setIsPinned(!isPinned);
        setIsPopupOpen(false); // If we unpin, close it immediately until clicked. If we pin, it just shows normally.
    };

    const refreshFiles = async () => {
        try {
            const result = await invoke('list_directory', { path: currentPath, showHidden: false });
            setFiles(result as any);
        } catch (err) {
            console.error('Refresh failed', err);
        }
    };

    const handleCopy = () => { if (selectedFiles.size > 0) setClipboard({ files: Array.from(selectedFiles), operation: 'copy' }); };
    const handleCut = () => { if (selectedFiles.size > 0) setClipboard({ files: Array.from(selectedFiles), operation: 'cut' }); };
    const handleCopyPath = async () => {
        if (selectedFiles.size > 0) {
            try {
                const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
                const paths = Array.from(selectedFiles).join('\n');
                await writeText(paths);
            } catch (err) {
                console.error('Failed to copy path', err);
            }
        }
    };
    const handlePaste = async () => {
        if (!clipboard || clipboard.files.length === 0) return;
        try {
            if (clipboard.operation === 'copy') {
                await invoke('copy_files', { sources: clipboard.files, dest: currentPath });
            } else {
                await invoke('move_files', { sources: clipboard.files, dest: currentPath });
                setClipboard(null);
            }
            refreshFiles();
        } catch (err) { }
    };

    const handleCopyTo = async () => {
        if (selectedFiles.size === 0) return;
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const destDir = await open({ directory: true, multiple: false });
            if (destDir && typeof destDir === 'string') {
                await invoke('copy_files', { sources: Array.from(selectedFiles), dest: destDir });
            }
        } catch (err) {
            console.error('Failed to copy to', err);
        }
    };

    const handleMoveTo = async () => {
        if (selectedFiles.size === 0) return;
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const destDir = await open({ directory: true, multiple: false });
            if (destDir && typeof destDir === 'string') {
                await invoke('move_files', { sources: Array.from(selectedFiles), dest: destDir });
                refreshFiles();
            }
        } catch (err) {
            console.error('Failed to move to', err);
        }
    };

    const handleOpen = async () => {
        if (selectedFiles.size !== 1) return;
        const targetPath = Array.from(selectedFiles)[0];
        const targetFile = activeTab?.files.find(f => f.path === targetPath);
        if (targetFile) {
            if (targetFile.is_dir) {
                useAppStore.getState().setCurrentPath(targetFile.path); // Use global state action
            } else {
                try {
                    await invoke('open_file_default', { path: targetFile.path });
                } catch (err) {
                    console.error('Failed to open file', err);
                }
            }
        }
    };

    const handleNewFile = async () => {
        try {
            const sep = currentPath.includes('\\') ? '\\' : '/';
            let newPath = currentPath.endsWith(sep) ? `${currentPath}新しいテキスト ドキュメント.txt` : `${currentPath}${sep}新しいテキスト ドキュメント.txt`;
            await invoke('create_file', { path: newPath });
            refreshFiles();
        } catch (err) { }
    };

    const handleProperties = async () => {
        if (selectedFiles.size === 0) return;
        const targetPath = Array.from(selectedFiles)[0];
        try {
            openPropertiesDialog(targetPath);
        } catch (err) {
            console.error('Failed to show properties', err);
        }
    };

    const handleDelete = async () => {
        if (selectedFiles.size === 0) return;
        try {
            if (confirm(`選択したアイテムをゴミ箱に移動しますか？`)) {
                await invoke('delete_files', { paths: Array.from(selectedFiles), toTrash: true });
                refreshFiles();
            }
        } catch (err) { }
    };
    const handleNewFolder = async () => {
        try {
            const sep = currentPath.includes('\\') ? '\\' : '/';
            let newPath = currentPath.endsWith(sep) ? `${currentPath}新しいフォルダー` : `${currentPath}${sep}新しいフォルダー`;
            await invoke('create_directory', { path: newPath });
            refreshFiles();
        } catch (err) { }
    };

    const renderHomeTab = () => (
        <div className="ribbon-content">
            <div className="ribbon-group">
                <div className="ribbon-group-items">
                    <LargeButton icon={<ClipboardPaste size={32} strokeWidth={1} color="#A0A0A0" fill="#F0F0F0" />} label="貼り付け" onClick={handlePaste} disabled={clipboard === null} />
                    <div className="small-button-col">
                        <SmallButton icon={<Scissors size={16} color="#0078D7" />} label="切り取り" onClick={handleCut} disabled={selectedFiles.size === 0} />
                        <SmallButton icon={<Copy size={16} color="#0078D7" />} label="コピー" onClick={handleCopy} disabled={selectedFiles.size === 0} />
                        <SmallButton icon={<LinkIcon size={16} color="#A0A0A0" />} label="パスのコピー" onClick={handleCopyPath} disabled={selectedFiles.size === 0} />
                    </div>
                </div>
                <div className="ribbon-group-title">クリップボード</div>
            </div>

            <div className="ribbon-group">
                <div className="ribbon-group-items">
                    <LargeButton icon={<ArrowRightSquare size={32} strokeWidth={1} color="#217346" />} label="移動先" onClick={handleMoveTo} disabled={selectedFiles.size === 0} />
                    <LargeButton icon={<Copy size={32} strokeWidth={1} color="#0078D7" />} label="コピー先" onClick={handleCopyTo} disabled={selectedFiles.size === 0} />
                    <LargeButton icon={<Trash2 size={32} strokeWidth={1} color="#E81123" />} label="削除" onClick={handleDelete} disabled={selectedFiles.size === 0} />
                    <LargeButton icon={<Edit2 size={32} strokeWidth={1} color="#0078D7" />} label="名前の変更" onClick={triggerRename} disabled={selectedFiles.size !== 1} />
                </div>
                <div className="ribbon-group-title">整理</div>
            </div>

            <div className="ribbon-group">
                <div className="ribbon-group-items">
                    <LargeButton icon={<FolderPlus size={32} strokeWidth={1} color="#F2A000" fill="#FFB900" />} label="新しい\nフォルダー" onClick={handleNewFolder} />
                    <LargeButton icon={<FilePlus size={32} strokeWidth={1} color="#0078D7" />} label="新しい\n項目" onClick={handleNewFile} />
                </div>
                <div className="ribbon-group-title">新規作成</div>
            </div>

            <div className="ribbon-group">
                <div className="ribbon-group-items">
                    <LargeButton icon={<Settings size={32} strokeWidth={1} color="#A0A0A0" />} label="プロパティ" onClick={handleProperties} disabled={selectedFiles.size === 0} />
                    <LargeButton icon={<FolderOpen size={32} strokeWidth={1} color="#F2A000" fill="#FFB900" />} label="開く" onClick={handleOpen} disabled={selectedFiles.size !== 1} />
                </div>
                <div className="ribbon-group-title">開く</div>
            </div>

            <div className="ribbon-group" style={{ borderRight: 'none' }}>
                <div className="ribbon-group-items">
                    <div className="small-button-col" style={{ width: '100px' }}>
                        <SmallButton icon={<CheckSquare size={16} color="#0078D7" />} label="すべて選択" onClick={selectAll} />
                        <SmallButton icon={<XSquare size={16} color="#A0A0A0" />} label="選択解除" onClick={clearSelection} />
                        <SmallButton icon={<CheckSquare size={16} color="#0078D7" />} label="選択の切り替え" onClick={invertSelection} />
                    </div>
                </div>
                <div className="ribbon-group-title">選択</div>
            </div>
        </div>
    );

    const renderViewTab = () => (
        <div className="ribbon-content">
            <div className="ribbon-group">
                <div className="ribbon-group-items">
                    <LargeButton icon={<Monitor size={32} strokeWidth={1} color="#5D5D5D" />} label="ナビゲーション\nウィンドウ" onClick={() => { }} />
                    <div className="small-button-col">
                        <SmallButton icon={<PanelRight size={16} color="#5D5D5D" />} label="プレビュー ウィンドウ" onClick={() => { }} disabled />
                        <SmallButton icon={<PanelRight size={16} color={showDetailsPane ? '#0078D7' : '#5D5D5D'} />} label="詳細ウィンドウ" onClick={toggleDetailsPane} active={showDetailsPane} />
                    </div>
                </div>
                <div className="ribbon-group-title">ペイン</div>
            </div>

            <div className="ribbon-group">
                <div className="ribbon-group-items">
                    <div className="view-grid">
                        <SmallButton icon={<LayoutGrid size={16} color={viewMode === 'extra_large_icon' ? '#0078D7' : '#5D5D5D'} />} label="特大アイコン" onClick={() => setViewMode('extra_large_icon')} active={viewMode === 'extra_large_icon'} />
                        <SmallButton icon={<LayoutGrid size={16} color={viewMode === 'large_icon' ? '#0078D7' : '#5D5D5D'} />} label="大アイコン" onClick={() => setViewMode('large_icon')} active={viewMode === 'large_icon'} />
                        <SmallButton icon={<LayoutGrid size={16} color={viewMode === 'medium_icon' ? '#0078D7' : '#5D5D5D'} />} label="中アイコン" onClick={() => setViewMode('medium_icon')} active={viewMode === 'medium_icon'} />
                        <SmallButton icon={<LayoutGrid size={16} color={viewMode === 'small_icon' ? '#0078D7' : '#5D5D5D'} />} label="小アイコン" onClick={() => setViewMode('small_icon')} active={viewMode === 'small_icon'} />
                        <SmallButton icon={<List size={16} color={viewMode === 'list' ? '#0078D7' : '#5D5D5D'} />} label="一覧" onClick={() => setViewMode('list')} active={viewMode === 'list'} />
                        <SmallButton icon={<AlignJustify size={16} color={viewMode === 'detail' ? '#0078D7' : '#5D5D5D'} />} label="詳細" onClick={() => setViewMode('detail')} active={viewMode === 'detail'} />
                        <SmallButton icon={<LayoutGrid size={16} color={viewMode === 'tiles' ? '#0078D7' : '#5D5D5D'} />} label="並べて表示" onClick={() => setViewMode('tiles')} active={viewMode === 'tiles'} />
                        <SmallButton icon={<AlignJustify size={16} color={viewMode === 'content' ? '#0078D7' : '#5D5D5D'} />} label="コンテンツ" onClick={() => setViewMode('content')} active={viewMode === 'content'} />
                    </div>
                </div>
                <div className="ribbon-group-title">レイアウト</div>
            </div>

            <div className="ribbon-group">
                <div className="ribbon-group-items">
                    <LargeButton icon={<ArrowDownAZ size={32} strokeWidth={1} color="#5D5D5D" />} label="並べ替え" onClick={() => { }} />
                    <LargeButton icon={<List size={32} strokeWidth={1} color="#5D5D5D" />} label="グループ化" onClick={() => { }} disabled />
                    <div className="small-button-col" style={{ width: '150px' }}>
                        <SmallButton icon={<CheckSquare size={16} color="#5D5D5D" />} label="列の追加" onClick={() => { }} disabled />
                        <SmallButton icon={<AlignJustify size={16} color="#5D5D5D" />} label="すべての列のサイズ..." onClick={() => { }} disabled />
                    </div>
                </div>
                <div className="ribbon-group-title">現在のビュー</div>
            </div>

            <div className="ribbon-group">
                <div className="ribbon-group-items">
                    <div className="ribbon-checkbox-col">
                        <label className="ribbon-checkbox-label">
                            <input type="checkbox" checked={showItemCheckBoxes} onChange={e => setShowItemCheckBoxes(e.target.checked)} /> 項目チェック ボックス
                        </label>
                        <label className="ribbon-checkbox-label">
                            <input type="checkbox" checked={showFileExtensions} onChange={e => setShowFileExtensions(e.target.checked)} /> ファイル名拡張子
                        </label>
                        <label className="ribbon-checkbox-label">
                            <input type="checkbox" checked={showHiddenFiles} onChange={e => setShowHiddenFiles(e.target.checked)} /> 隠しファイル
                        </label>
                    </div>
                    <div style={{ width: '1px', backgroundColor: 'var(--border-color)', margin: '4px' }}></div>
                    <LargeButton icon={<EyeOff size={32} strokeWidth={1} color="#5D5D5D" />} label="選択した項目を\n表示しない" onClick={() => { }} disabled />
                </div>
                <div className="ribbon-group-title">表示/非表示</div>
            </div>

            <div className="ribbon-group" style={{ borderRight: 'none' }}>
                <div className="ribbon-group-items">
                    <LargeButton icon={<Settings size={32} strokeWidth={1} color="#5D5D5D" />} label="オプション" onClick={() => { }} disabled />
                </div>
                <div className="ribbon-group-title">オプション</div>
            </div>
        </div>
    );

    const renderShareTab = () => (
        <div className="ribbon-content">
            <div className="ribbon-group" style={{ borderRight: 'none' }}>
                <div className="ribbon-group-title" style={{ marginTop: '54px' }}>共有機能は現在使用できません</div>
            </div>
        </div>
    );

    const showRibbonPane = isPinned || isPopupOpen;

    return (
        <div className="ribbon-container">
            {/* Tabs Row */}
            <div className="ribbon-tabs-container">
                <div className="file-menu-btn">ファイル</div>
                <div className={`ribbon-tab ${activeRibbonTab === 'home' && showRibbonPane ? 'active' : ''}`} onClick={() => handleTabClick('home')}>ホーム</div>
                <div className={`ribbon-tab ${activeRibbonTab === 'share' && showRibbonPane ? 'active' : ''}`} onClick={() => handleTabClick('share')}>共有</div>
                <div className={`ribbon-tab ${activeRibbonTab === 'view' && showRibbonPane ? 'active' : ''}`} onClick={() => handleTabClick('view')}>表示</div>

                <div style={{ flex: 1 }} />

                {/* Pin toggle button */}
                <div className="ribbon-pin-btn" onClick={togglePin}>
                    {isPinned ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            {/* Ribbon Pane Main Area */}
            {(isPinned || isPopupOpen) && (
                <div
                    ref={popupRef}
                    className={`ribbon-pane ${!isPinned ? 'popup-mode' : ''}`}
                >
                    {activeRibbonTab === 'home' && renderHomeTab()}
                    {activeRibbonTab === 'share' && renderShareTab()}
                    {activeRibbonTab === 'view' && renderViewTab()}
                </div>
            )}

            <style>{`
                .ribbon-container {
                    background-color: var(--bg-titlebar);
                    color: var(--text-main);
                    border-bottom: 1px solid var(--border-color);
                    position: relative;
                    z-index: 100;
                }

                .ribbon-tabs-container {
                    height: 24px;
                    display: flex;
                    align-items: flex-end;
                    padding-left: 0px;
                    background-color: transparent;
                }

                .file-menu-btn {
                    height: 24px;
                    background-color: #1979CA;
                    color: white;
                    padding: 0 16px;
                    display: flex;
                    align-items: center;
                    font-size: 12px;
                    cursor: default;
                }
                .file-menu-btn:hover { background-color: #2b88d8; }

                .ribbon-tab {
                    height: 24px;
                    padding: 0 12px;
                    display: flex;
                    align-items: center;
                    font-size: 12px;
                    cursor: default;
                    border: 1px solid transparent;
                    border-bottom: none;
                    margin-left: 2px;
                    color: var(--text-main);
                }
                .ribbon-tab:hover:not(.active) {
                    background-color: var(--hover-bg);
                    border-color: transparent;
                }
                .ribbon-tab.active {
                    background-color: var(--bg-main);
                    border-color: var(--border-color);
                    border-bottom: 1px solid var(--bg-main);
                    position: relative;
                    z-index: 102; /* sit above the pane border */
                }

                .ribbon-pin-btn {
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: default;
                }
                .ribbon-pin-btn:hover {
                    background-color: var(--hover-bg);
                }

                .ribbon-pane {
                    height: 94px; /* classic ribbon height */
                    background-color: var(--bg-main);
                    border-top: 1px solid var(--border-color);
                    display: flex;
                    width: 100%;
                    overflow: hidden;
                    box-sizing: border-box;
                }
                .ribbon-pane.popup-mode {
                    position: absolute;
                    top: 24px;
                    left: 0;
                    right: 0;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                    z-index: 101;
                }

                .ribbon-content {
                    display: flex;
                    height: 100%;
                    padding: 2px 0;
                }

                .ribbon-group {
                    display: flex;
                    flex-direction: column;
                    border-right: 1px solid var(--border-color);
                    height: 88px;
                    margin: 0 2px;
                }
                .ribbon-group-items {
                    display: flex;
                    flex: 1;
                    padding: 0 2px;
                    gap: 2px;
                }
                .ribbon-group-title {
                    height: 16px;
                    font-size: 11px;
                    color: #666;
                    text-align: center;
                    line-height: 16px;
                }

                .small-button-col {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    gap: 2px;
                }

                .view-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: repeat(4, 22px);
                    gap: 1px;
                    margin-left: 8px;
                    width: 220px;
                    height: 66px;
                    border: 1px solid var(--border-color);
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding: 1px;
                    background-color: var(--bg-main);
                }

                .ribbon-checkbox-col {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    gap: 6px;
                    padding: 0 8px;
                    height: 100%;
                }

                .ribbon-checkbox-label {
                    display: flex;
                    align-items: center;
                    font-size: 11px;
                    cursor: pointer;
                    user-select: none;
                }

                .ribbon-checkbox-label input[type="checkbox"] {
                    margin: 0 6px 0 0;
                }
            `}</style>
        </div>
    );
};

const LargeButton = ({ icon, label, onClick, disabled }: any) => {
    return (
        <div className={`ribbon-btn large ${disabled ? 'disabled' : ''}`} onClick={!disabled ? onClick : undefined}>
            <div className="icon-container">{icon}</div>
            <div className="label-container" dangerouslySetInnerHTML={{ __html: label.replace('\\n', '<br/>') }} />
            <style>{`
                .ribbon-btn.large {
                    min-width: 56px;
                    width: max-content;
                    height: 68px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    padding: 4px 6px;
                    cursor: default;
                    border: 1px solid transparent;
                    border-radius: 0;
                }
                .ribbon-btn.large:hover:not(.disabled) {
                    background-color: var(--hover-bg);
                    border-color: var(--hover-border);
                }
                .ribbon-btn.large.disabled {
                    opacity: 0.5;
                }
                .ribbon-btn.large .icon-container {
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 2px;
                }
                .ribbon-btn.large .label-container {
                    font-size: 11px;
                    text-align: center;
                    line-height: 1.2;
                    white-space: pre-wrap;
                }
            `}</style>
        </div>
    );
};

const SmallButton = ({ icon, label, onClick, disabled, active }: any) => {
    return (
        <div className={`ribbon-btn small ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`} onClick={!disabled ? onClick : undefined}>
            <div className="icon-container">{icon}</div>
            <div className="label-container">{label}</div>
            <style>{`
                .ribbon-btn.small {
                    height: 22px;
                    display: flex;
                    align-items: center;
                    padding: 0 4px;
                    cursor: default;
                    border: 1px solid transparent;
                    border-radius: 0;
                }
                .ribbon-btn.small:hover:not(.disabled) {
                    background-color: var(--hover-bg);
                    border-color: var(--hover-border);
                }
                .ribbon-btn.small.active {
                    background-color: var(--selected-bg);
                    border-color: var(--selected-border);
                }
                .ribbon-btn.small.disabled {
                    opacity: 0.5;
                }
                .ribbon-btn.small .icon-container {
                    width: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 4px;
                }
                .ribbon-btn.small .label-container {
                    font-size: 12px;
                    white-space: nowrap;
                }
            `}</style>
        </div>
    );
};
