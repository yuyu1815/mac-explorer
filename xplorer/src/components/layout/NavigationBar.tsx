import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useAppStore } from '@/stores/appStore';
import { ArrowLeft, ArrowRight, ArrowUp, RotateCw, Search, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigationBar } from '@/hooks/useNavigationBar';
import styles from '@/styles/components/layout/NavigationBar.module.css';

export const NavigationBar = () => {
    const { tabs, activeTabId, goBack, goForward, goUp, setCurrentPath, setFiles, setSearchQuery, toggleSelection, openLocationNotAvailableDialog } = useAppStore();
    const activeTab = tabs.find((t: any) => t.id === activeTabId);

    const canGoBack = activeTab ? activeTab.historyIndex > 0 : false;
    const canGoForward = activeTab ? activeTab.historyIndex < activeTab.history.length - 1 : false;
    const searchQuery = activeTab?.searchQuery || '';
    const currentPath = activeTab?.currentPath || '/'; // default to something so it doesn't crash
    const folderName = currentPath.split('/').pop() || 'エクスプローラー';

    const { inputValue, setInputValue, suggestions, handleInputChange, breadcrumbs } = useNavigationBar(currentPath);
    const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
    const [dropdownPath, setDropdownPath] = useState<string | null>(null);
    const [dropdownItems, setDropdownItems] = useState<{ name: string, path: string }[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
            if (((e.ctrlKey || e.metaKey) && (e.key === 'F' || e.key === 'f')) || e.key === 'F3') {
                e.preventDefault();
                if (searchInputRef.current) {
                    searchInputRef.current.focus();
                    searchInputRef.current.select();
                }
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    const handlePathSubmit = async () => {
        let finalPath = inputValue.trim();
        const command = finalPath.toLowerCase();

        if (command === 'cmd' || command === 'terminal') {
            try {
                await invoke('open_terminal_at', { path: currentPath });
            } catch (e) {
                console.error('Failed to open terminal:', e);
            }
            setInputValue(currentPath);
            setIsEditing(false);
            return;
        }

        if (finalPath && finalPath !== currentPath) {
            if (finalPath.length > 1 && finalPath.endsWith('/')) {
                finalPath = finalPath.slice(0, -1);
            }

            if (finalPath === 'this-pc') {
                setCurrentPath(finalPath);
                setIsEditing(false);
                return;
            }

            // パスの存在チェック
            try {
                await invoke('list_directory', { path: finalPath, showHidden: false });
                setCurrentPath(finalPath);
            } catch {
                // パスが存在しない場合、エラーダイアログを表示
                openLocationNotAvailableDialog(finalPath);
                setInputValue(currentPath);
            }
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handlePathSubmit();
        } else if (e.key === 'Escape') {
            setInputValue(currentPath);
            setIsEditing(false);
        }
    };

    const handleArrowClick = async (e: React.MouseEvent, path: string) => {
        e.stopPropagation();
        if (dropdownPath === path) {
            setDropdownPath(null);
            return;
        }
        try {
            const res = await invoke<any[]>('list_directory', { path, showHidden: false });
            const dirs = res.filter((f: any) => f.is_dir).sort((a: any, b: any) => a.name.localeCompare(b.name));
            setDropdownItems(dirs);
            setDropdownPath(path);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest(`.${styles.dropdown}`) || target.closest(`.${styles.breadcrumbArrow}`) || target.closest(`.${styles.dropdownToggle}`)) {
                return;
            }
            setDropdownPath(null);
            setShowHistoryDropdown(false);
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const renderBreadcrumbs = () => {
        return (
            <div className={styles.breadcrumbContainer} onClick={() => setIsEditing(true)}>
                <div className={styles.folderIconWrapper} onClick={(e) => e.stopPropagation()}>
                    <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />
                </div>
                <ChevronRight size={14} color="var(--text-muted)" className={styles.chevron} />

                <div className={styles.breadcrumbWrapper}>
                    <div onClick={(e) => { e.stopPropagation(); setCurrentPath('/'); }} className={styles.breadcrumbItem}>/</div>
                    <div className={styles.breadcrumbArrow} onClick={(e) => handleArrowClick(e, '/')}>
                        <ChevronRight size={14} />
                    </div>
                    {dropdownPath === '/' && (
                        <div className={styles.dropdown}>
                            {dropdownItems.map(item => (
                                <div key={item.path} className={styles.dropdownItem} onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setCurrentPath(item.path);
                                    setDropdownPath(null);
                                }}>
                                    <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />
                                    <span>{item.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {breadcrumbs.map((bc, i) => (
                    <div key={i} className={styles.breadcrumbWrapper}>
                        <div onClick={(e) => { e.stopPropagation(); setCurrentPath(bc.path); }} className={styles.breadcrumbItem}>
                            {bc.name}
                        </div>
                        <div className={styles.breadcrumbArrow} onClick={(e) => handleArrowClick(e, bc.path)}>
                            <ChevronRight size={14} />
                        </div>
                        {dropdownPath === bc.path && (
                            <div className={styles.dropdown}>
                                {dropdownItems.map((item: any) => (
                                    <div key={item.path} className={styles.dropdownItem} onMouseDown={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        setCurrentPath(item.path);
                                        setDropdownPath(null);
                                    }}>
                                        <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />
                                        <span>{item.name}</span>
                                    </div>
                                ))}
                                {dropdownItems.length === 0 && <div className={`${styles.dropdownItem} ${styles.emptyDropdown}`}>空のフォルダー</div>}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className={styles.container}>
            {/* Nav Buttons */}
            <div className={styles.navButtonContainer}>
                <button onClick={goBack} disabled={!canGoBack} className={`${styles.navBtn} ${!canGoBack ? styles.navBtnDisabled : ''}`}>
                    <ArrowLeft size={16} strokeWidth={1.5} />
                </button>
                <button onClick={goForward} disabled={!canGoForward} className={`${styles.navBtn} ${!canGoForward ? styles.navBtnDisabled : ''}`}>
                    <ArrowRight size={16} strokeWidth={1.5} />
                </button>
                <div className={styles.spacer}></div> {/* Tiny spacer */}
                <button onClick={goUp} className={styles.navBtn}>
                    <ArrowUp size={16} strokeWidth={1.5} />
                </button>
                <button className={styles.navBtn} onClick={async () => {
                    const result = await invoke('list_directory', { path: currentPath, showHidden: false });
                    setFiles(result as any);
                    toggleSelection(currentPath, true, false, []);
                }}>
                    <RotateCw size={14} strokeWidth={1.5} />
                </button>
            </div>

            {/* Address Bar */}
            <div className={`${styles.addressBar} ${isEditing ? styles.addressBarEditing : ''}`} onClick={() => !isEditing && setIsEditing(true)}>
                {isEditing ? (
                    <div className={styles.editingWrapper}>
                        <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} className={styles.editingIcon} />
                        <input
                            ref={inputRef}
                            value={inputValue}
                            onChange={(e) => handleInputChange(e.target.value)}
                            onBlur={() => {
                                setTimeout(() => handlePathSubmit(), 150);
                            }}
                            onKeyDown={handleKeyDown}
                            className={styles.addressInput}
                        />
                        {suggestions.length > 0 && (
                            <div className={styles.dropdown} style={{ width: '100%' }}>
                                {suggestions.map((item: any) => (
                                    <div
                                        key={item.path}
                                        className={styles.dropdownItem}
                                        onMouseDown={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            setCurrentPath(item.path);
                                            setIsEditing(false);
                                        }}
                                    >
                                        <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />
                                        <span>{item.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    renderBreadcrumbs()
                )}

                {/* History Dropdown Toggle */}
                <div
                    className={styles.dropdownToggle}
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowHistoryDropdown(!showHistoryDropdown);
                        setDropdownPath(null);
                    }}
                >
                    <ChevronDown size={14} color="var(--text-muted)" />
                </div>
                {showHistoryDropdown && activeTab && (
                    <div className={`${styles.dropdown} ${styles.dropdownRight}`}>
                        {[...activeTab.history].reverse().map((path, idx) => (
                            <div key={idx} className={styles.dropdownItem} onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCurrentPath(path);
                                setShowHistoryDropdown(false);
                            }}>
                                <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} style={{ flexShrink: 0 }} />
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{path}</span>
                            </div>
                        ))}
                        {activeTab.history.length === 0 && <div className={`${styles.dropdownItem} ${styles.emptyDropdown}`}>履歴がありません</div>}
                    </div>
                )}
            </div>

            {/* Search Box */}
            <div className={styles.searchBar}>
                <input
                    ref={searchInputRef}
                    placeholder={`${folderName} の検索`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                />
                <div className={styles.searchIconWrapper}>
                    <Search size={14} color="var(--text-muted)" strokeWidth={1.5} />
                </div>
            </div>
        </div>
    );
};
