import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
    ClipboardPaste, Scissors, Copy, Link as LinkIcon, Edit2, Trash2, FolderPlus,
    FilePlus, List, AlignJustify, LayoutGrid, CheckSquare, XSquare, ArrowRightSquare,
    FolderOpen, Settings, ChevronUp, ChevronDown, Monitor, PanelRight, ArrowDownAZ, EyeOff,
    Archive, FileArchive
} from 'lucide-react';
import { isArchive, getArchiveFormat, getFileNameWithoutExtension } from '@/utils/archive';
import { FileEntry } from '@/types';
import styles from '@/styles/components/layout/Toolbar.module.css';

export const Toolbar = () => {
    const { tabs, activeTabId, clipboard, setClipboard, setFiles, setViewMode, selectAll, clearSelection, invertSelection, triggerRename, showDetailsPane, toggleDetailsPane, openPropertiesDialog, showHiddenFiles, setShowHiddenFiles, showFileExtensions, setShowFileExtensions, showItemCheckBoxes, setShowItemCheckBoxes, confirmOverwrite, openLocationNotAvailableDialog } = useAppStore();
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
                if (!target.closest(`.${styles.tabsContainer}`)) {
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
            const result = await invoke<FileEntry[]>('list_directory', { path: currentPath, showHidden: false });
            setFiles(result);
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
        } catch (err) {
            console.error('Toolbar action failed:', err);
        }
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
                try {
                    await invoke('list_directory', { path: targetFile.path, showHidden: false });
                    useAppStore.getState().setCurrentPath(targetFile.path);
                } catch {
                    openLocationNotAvailableDialog(targetFile.path);
                }
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
            let newPath = currentPath.endsWith('/') ? `${currentPath}新しいテキスト ドキュメント.txt` : `${currentPath}/新しいテキスト ドキュメント.txt`;
            await invoke('create_file', { path: newPath });
            refreshFiles();
        } catch (err) {
            console.error('Toolbar action failed:', err);
        }
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
        } catch (err) {
            console.error('Toolbar action failed:', err);
        }
    };

    const handleCompress = async () => {
        if (selectedFiles.size === 0) return;
        try {
            const firstPath = Array.from(selectedFiles)[0];
            const defaultName = selectedFiles.size === 1
                ? getFileNameWithoutExtension(firstPath || 'archive') + '.zip'
                : 'archive.zip';

            const archivePath = currentPath.endsWith('/') ? `${currentPath}${defaultName}` : `${currentPath}/${defaultName}`;

            const exists = await invoke<boolean>('check_exists', { path: archivePath });
            if (exists) {
                const shouldOverwrite = await confirmOverwrite(archivePath);
                if (!shouldOverwrite) return;
            }

            const payload = {
                sources: Array.from(selectedFiles),
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
            const [pos, size, factor] = await Promise.all([
                mainWindow.innerPosition(),
                mainWindow.innerSize(),
                mainWindow.scaleFactor()
            ]);

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
        if (selectedFiles.size !== 1) return;
        const targetPath = Array.from(selectedFiles)[0];
        if (!isArchive(targetPath)) return;
        try {
            const baseDir = getFileNameWithoutExtension(targetPath);
            const defaultDestDir = currentPath.endsWith('/') ? `${currentPath}${baseDir}` : `${currentPath}/${baseDir}`;

            const promptResult = await useAppStore.getState().promptExtract(targetPath, defaultDestDir);
            if (!promptResult) return;

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
            const [pos, size, factor] = await Promise.all([
                mainWindow.innerPosition(),
                mainWindow.innerSize(),
                mainWindow.scaleFactor()
            ]);

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

    const handleNewFolder = async () => {
        try {
            let newPath = currentPath.endsWith('/') ? `${currentPath}新しいフォルダー` : `${currentPath}/新しいフォルダー`;
            await invoke('create_directory', { path: newPath });
            refreshFiles();
        } catch (err) {
            console.error('Toolbar action failed:', err);
        }
    };

    const renderHomeTab = () => (
        <div className={styles.content}>
            <div className={styles.group}>
                <div className={styles.groupItems}>
                    <LargeButton icon={<ClipboardPaste size={32} strokeWidth={1} color="#A0A0A0" fill="#F0F0F0" />} label="貼り付け" onClick={handlePaste} disabled={clipboard === null} />
                    <div className={styles.smallButtonCol}>
                        <SmallButton icon={<Scissors size={16} color="#0078D7" />} label="切り取り" onClick={handleCut} disabled={selectedFiles.size === 0} />
                        <SmallButton icon={<Copy size={16} color="#0078D7" />} label="コピー" onClick={handleCopy} disabled={selectedFiles.size === 0} />
                        <SmallButton icon={<LinkIcon size={16} color="#A0A0A0" />} label="パスのコピー" onClick={handleCopyPath} disabled={selectedFiles.size === 0} />
                    </div>
                </div>
                <div className={styles.groupTitle}>クリップボード</div>
            </div>

            <div className={styles.group}>
                <div className={styles.groupItems}>
                    <LargeButton icon={<ArrowRightSquare size={32} strokeWidth={1} color="#217346" />} label="移動先" onClick={handleMoveTo} disabled={selectedFiles.size === 0} />
                    <LargeButton icon={<Copy size={32} strokeWidth={1} color="#0078D7" />} label="コピー先" onClick={handleCopyTo} disabled={selectedFiles.size === 0} />
                    <LargeButton icon={<Trash2 size={32} strokeWidth={1} color="#E81123" />} label="削除" onClick={handleDelete} disabled={selectedFiles.size === 0} />
                    <LargeButton icon={<Edit2 size={32} strokeWidth={1} color="#0078D7" />} label="名前の変更" onClick={triggerRename} disabled={selectedFiles.size !== 1} />
                </div>
                <div className={styles.groupTitle}>整理</div>
            </div>

            <div className={styles.group}>
                <div className={styles.groupItems}>
                    <LargeButton icon={<FolderPlus size={32} strokeWidth={1} color="#F2A000" fill="#FFB900" />} label="新しい\nフォルダー" onClick={handleNewFolder} />
                    <LargeButton icon={<FilePlus size={32} strokeWidth={1} color="#0078D7" />} label="新しい\n項目" onClick={handleNewFile} />
                </div>
                <div className={styles.groupTitle}>新規作成</div>
            </div>

            <div className={styles.group}>
                <div className={styles.groupItems}>
                    <LargeButton icon={<Settings size={32} strokeWidth={1} color="#A0A0A0" />} label="プロパティ" onClick={handleProperties} disabled={selectedFiles.size === 0} />
                    <LargeButton icon={<FolderOpen size={32} strokeWidth={1} color="#F2A000" fill="#FFB900" />} label="開く" onClick={handleOpen} disabled={selectedFiles.size !== 1} />
                </div>
                <div className={styles.groupTitle}>開く</div>
            </div>

            <div className={styles.group}>
                <div className={styles.groupItems}>
                    <LargeButton icon={<Archive size={32} strokeWidth={1} color="#0078D7" />} label="圧縮" onClick={handleCompress} disabled={selectedFiles.size === 0} />
                    <LargeButton icon={<FileArchive size={32} strokeWidth={1} color="#107C10" />} label="展開" onClick={handleExtract} disabled={selectedFiles.size !== 1 || !isArchive(Array.from(selectedFiles)[0])} />
                </div>
                <div className={styles.groupTitle}>圧縮/展開</div>
            </div>

            <div className={styles.group} style={{ borderRight: 'none' }}>
                <div className={styles.groupItems}>
                    <div className={styles.smallButtonCol} style={{ width: '100px' }}>
                        <SmallButton icon={<CheckSquare size={16} color="#0078D7" />} label="すべて選択" onClick={selectAll} />
                        <SmallButton icon={<XSquare size={16} color="#A0A0A0" />} label="選択解除" onClick={clearSelection} />
                        <SmallButton icon={<CheckSquare size={16} color="#0078D7" />} label="選択の切り替え" onClick={invertSelection} />
                    </div>
                </div>
                <div className={styles.groupTitle}>選択</div>
            </div>
        </div>
    );

    const renderViewTab = () => (
        <div className={styles.content}>
            <div className={styles.group}>
                <div className={styles.groupItems}>
                    <LargeButton icon={<Monitor size={32} strokeWidth={1} color="#5D5D5D" />} label="ナビゲーション\nウィンドウ" onClick={() => { }} />
                    <div className={styles.smallButtonCol}>
                        <SmallButton icon={<PanelRight size={16} color="#5D5D5D" />} label="プレビュー ウィンドウ" onClick={() => { }} disabled />
                        <SmallButton icon={<PanelRight size={16} color={showDetailsPane ? '#0078D7' : '#5D5D5D'} />} label="詳細ウィンドウ" onClick={toggleDetailsPane} active={showDetailsPane} />
                    </div>
                </div>
                <div className={styles.groupTitle}>ペイン</div>
            </div>

            <div className={styles.group}>
                <div className={styles.groupItems}>
                    <div className={styles.viewGrid}>
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
                <div className={styles.groupTitle}>レイアウト</div>
            </div>

            <div className={styles.group}>
                <div className={styles.groupItems}>
                    <LargeButton icon={<ArrowDownAZ size={32} strokeWidth={1} color="#5D5D5D" />} label="並べ替え" onClick={() => { }} />
                    <LargeButton icon={<List size={32} strokeWidth={1} color="#5D5D5D" />} label="グループ化" onClick={() => { }} disabled />
                    <div className={styles.smallButtonCol} style={{ width: '150px' }}>
                        <SmallButton icon={<CheckSquare size={16} color="#5D5D5D" />} label="列の追加" onClick={() => { }} disabled />
                        <SmallButton icon={<AlignJustify size={16} color="#5D5D5D" />} label="すべての列のサイズ..." onClick={() => { }} disabled />
                    </div>
                </div>
                <div className={styles.groupTitle}>現在のビュー</div>
            </div>

            <div className={styles.group}>
                <div className={styles.groupItems}>
                    <div className={styles.checkboxCol}>
                        <label className={styles.checkboxLabel}>
                            <input type="checkbox" checked={showItemCheckBoxes} onChange={e => setShowItemCheckBoxes(e.target.checked)} /> 項目チェック ボックス
                        </label>
                        <label className={styles.checkboxLabel}>
                            <input type="checkbox" checked={showFileExtensions} onChange={e => setShowFileExtensions(e.target.checked)} /> ファイル名拡張子
                        </label>
                        <label className={styles.checkboxLabel}>
                            <input type="checkbox" checked={showHiddenFiles} onChange={e => setShowHiddenFiles(e.target.checked)} /> 隠しファイル
                        </label>
                    </div>
                    <div className={styles.verticalSeparator}></div>
                    <LargeButton icon={<EyeOff size={32} strokeWidth={1} color="#5D5D5D" />} label="選択した項目を\n表示しない" onClick={() => { }} disabled />
                </div>
                <div className={styles.groupTitle}>表示/非表示</div>
            </div>

            <div className={styles.group} style={{ borderRight: 'none' }}>
                <div className={styles.groupItems}>
                    <LargeButton icon={<Settings size={32} strokeWidth={1} color="#5D5D5D" />} label="オプション" onClick={() => { }} disabled />
                </div>
                <div className={styles.groupTitle}>オプション</div>
            </div>
        </div>
    );

    const renderShareTab = () => (
        <div className={styles.content}>
            <div className={styles.group} style={{ borderRight: 'none' }}>
                <div className={styles.groupTitle} style={{ marginTop: '54px' }}>共有機能は現在使用できません</div>
            </div>
        </div>
    );

    const showRibbonPane = isPinned || isPopupOpen;

    return (
        <div className={styles.ribbonContainer}>
            {/* Tabs Row */}
            <div className={styles.tabsContainer}>
                <div className={styles.fileMenuBtn}>ファイル</div>
                <div className={`${styles.tab} ${activeRibbonTab === 'home' && showRibbonPane ? styles.active : ''}`} onClick={() => handleTabClick('home')}>ホーム</div>
                <div className={`${styles.tab} ${activeRibbonTab === 'share' && showRibbonPane ? styles.active : ''}`} onClick={() => handleTabClick('share')}>共有</div>
                <div className={`${styles.tab} ${activeRibbonTab === 'view' && showRibbonPane ? styles.active : ''}`} onClick={() => handleTabClick('view')}>表示</div>

                <div style={{ flex: 1 }} />

                {/* Pin toggle button */}
                <div className={styles.pinBtn} onClick={togglePin}>
                    {isPinned ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            {/* Ribbon Pane Main Area */}
            {(isPinned || isPopupOpen) && (
                <div
                    ref={popupRef}
                    className={`${styles.pane} ${!isPinned ? styles.popupMode : ''}`}
                >
                    {activeRibbonTab === 'home' && renderHomeTab()}
                    {activeRibbonTab === 'share' && renderShareTab()}
                    {activeRibbonTab === 'view' && renderViewTab()}
                </div>
            )}
        </div>
    );
};

const LargeButton = ({ icon, label, onClick, disabled }: any) => {
    return (
        <div className={`${styles.btnLarge} ${disabled ? styles.disabled : ''}`} onClick={!disabled ? onClick : undefined}>
            <div className={styles.largeIconContainer}>{icon}</div>
            <div className={styles.largeLabelContainer} dangerouslySetInnerHTML={{ __html: label.replace('\\n', '<br/>') }} />
        </div>
    );
};

const SmallButton = ({ icon, label, onClick, disabled, active }: any) => {
    return (
        <div className={`${styles.btnSmall} ${disabled ? styles.disabled : ''} ${active ? styles.active : ''}`} onClick={!disabled ? onClick : undefined}>
            <div className={styles.smallIconContainer}>{icon}</div>
            <div className={styles.smallLabelContainer}>{label}</div>
        </div>
    );
};
