import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useAppStore } from '../../stores/appStore';
import { ArrowLeft, ArrowRight, ArrowUp, RotateCw, Search, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export const NavigationBar = () => {
    const { tabs, activeTabId, goBack, goForward, goUp, setCurrentPath, setFiles, setSearchQuery } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    const canGoBack = activeTab ? activeTab.historyIndex > 0 : false;
    const canGoForward = activeTab ? activeTab.historyIndex < activeTab.history.length - 1 : false;
    const searchQuery = activeTab?.searchQuery || '';
    const currentPath = activeTab?.currentPath || 'C:\\'; // default to something so it doesn't crash
    const folderName = currentPath.split(/[/\\]/).pop() || 'エクスプローラー';

    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(currentPath);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [dropdownPath, setDropdownPath] = useState<string | null>(null);
    const [dropdownItems, setDropdownItems] = useState<{ name: string, path: string }[]>([]);
    const [pathSuggestions, setPathSuggestions] = useState<{ name: string, path: string }[]>([]);
    const [suggestionIndex, setSuggestionIndex] = useState(-1);
    const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

    useEffect(() => {
        setEditValue(currentPath);
    }, [currentPath]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'F' || e.key === 'f') || e.key === 'F3') {
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

    useEffect(() => {
        if (!isEditing || !editValue) {
            setPathSuggestions([]);
            return;
        }

        const fetchSuggestions = async () => {
            try {
                const sep = editValue.includes('\\') ? '\\' : '/';
                const lastSepIndex = editValue.lastIndexOf(sep);
                let dirPath = '';
                let searchPrefix = '';

                if (lastSepIndex === -1) {
                    if (editValue.endsWith(':')) {
                        dirPath = editValue + '\\';
                    } else if (editValue === '') {
                        dirPath = '/';
                    } else {
                        setPathSuggestions([]);
                        return;
                    }
                } else {
                    dirPath = editValue.substring(0, lastSepIndex + 1);
                    searchPrefix = editValue.substring(lastSepIndex + 1).toLowerCase();
                }

                const res = await invoke<{ name: string; path: string }[]>('complete_path', {
                    dirPath: dirPath,
                    prefix: searchPrefix,
                    showHidden: false
                });
                setPathSuggestions(res);
                setSuggestionIndex(-1);
            } catch (e) {
                setPathSuggestions([]);
            }
        };

        const timer = setTimeout(fetchSuggestions, 150);
        return () => clearTimeout(timer);
    }, [editValue, isEditing]);

    const handlePathSubmit = () => {
        let finalPath = editValue.trim();
        if (finalPath && finalPath !== currentPath) {
            if (finalPath.length > 1 && (finalPath.endsWith('/') || finalPath.endsWith('\\'))) {
                finalPath = finalPath.slice(0, -1);
            }
            setCurrentPath(finalPath);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSuggestionIndex(prev => Math.min(prev + 1, pathSuggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSuggestionIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (suggestionIndex >= 0 && suggestionIndex < pathSuggestions.length) {
                let p = pathSuggestions[suggestionIndex].path;
                if (!p.endsWith('/') && !p.endsWith('\\')) p += p.includes('\\') ? '\\' : '/';
                setEditValue(p);
                setPathSuggestions([]);
                setSuggestionIndex(-1);
            } else {
                handlePathSubmit();
            }
        } else if (e.key === 'Escape') {
            setEditValue(currentPath);
            setIsEditing(false);
            setPathSuggestions([]);
            setSuggestionIndex(-1);
        }
    };

    const handleBreadcrumbClick = (e: React.MouseEvent, index: number, parts: string[]) => {
        e.stopPropagation();
        const sep = currentPath.includes('\\') ? '\\' : '/';
        let newPath = '';
        if (sep === '/') {
            newPath = '/' + parts.slice(0, index + 1).join('/');
            if (newPath === '//') newPath = '/';
        } else {
            newPath = parts.slice(0, index + 1).join('\\');
            if (newPath.endsWith(':')) newPath += '\\';
        }
        setCurrentPath(newPath);
    };

    const handleArrowClick = async (e: React.MouseEvent, path: string) => {
        e.stopPropagation();
        if (dropdownPath === path) {
            setDropdownPath(null);
            return;
        }
        try {
            const res = await invoke<any[]>('list_directory', { path, showHidden: false });
            const dirs = res.filter(f => f.is_dir).sort((a, b) => a.name.localeCompare(b.name));
            setDropdownItems(dirs);
            setDropdownPath(path);
        } catch (err) {
            console.error(err);
        }
    };

    // Click outside to close dropdown
    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.breadcrumb-dropdown') || target.closest('.breadcrumb-arrow') || target.closest('.history-dropdown-toggle')) {
                return;
            }
            setDropdownPath(null);
            setShowHistoryDropdown(false);
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const renderBreadcrumbs = () => {
        if (!currentPath) return null;
        const sep = currentPath.includes('\\') ? '\\' : '/';
        let parts = currentPath.split(sep);
        if (sep === '/' && currentPath.startsWith('/')) {
            parts.shift();
        }

        return (
            <div
                style={{ display: 'flex', alignItems: 'center', height: '100%', flex: 1, paddingLeft: '4px' }}
                onClick={() => setIsEditing(true)}
            >
                {/* Fixed Folder Icon on the left of breadcrumbs */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />
                </div>
                <ChevronRight size={14} color="var(--text-muted)" style={{ margin: '0 2px' }} />

                {sep === '/' && currentPath.startsWith('/') && (
                    <div className="breadcrumb-wrapper" style={{ position: 'relative' }}>
                        <div onClick={(e) => { e.stopPropagation(); setCurrentPath('/'); }} className="breadcrumb-item">
                            /
                        </div>
                        <div className="breadcrumb-arrow" onClick={(e) => handleArrowClick(e, '/')}>
                            <ChevronRight size={14} />
                        </div>
                        {dropdownPath === '/' && (
                            <div className="breadcrumb-dropdown">
                                {dropdownItems.map(item => (
                                    <div key={item.path} className="breadcrumb-dropdown-item" onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setCurrentPath(item.path);
                                        setDropdownPath(null);
                                    }}>
                                        <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />
                                        <span>{item.name}</span>
                                    </div>
                                ))}
                                {dropdownItems.length === 0 && <div className="breadcrumb-dropdown-item" style={{ color: '#888' }}>空のフォルダー</div>}
                            </div>
                        )}
                    </div>
                )}

                {parts.map((part, i) => {
                    if (!part) return null;

                    let thisPath = '';
                    if (sep === '/') {
                        thisPath = '/' + parts.slice(0, i + 1).join('/');
                        if (thisPath === '//') thisPath = '/';
                    } else {
                        thisPath = parts.slice(0, i + 1).join('\\');
                        if (thisPath.endsWith(':')) thisPath += '\\';
                    }

                    return (
                        <div key={i} className="breadcrumb-wrapper" style={{ position: 'relative' }}>
                            <div onClick={(e) => handleBreadcrumbClick(e, i, parts)} className="breadcrumb-item">
                                {part}
                            </div>
                            <div className="breadcrumb-arrow" onClick={(e) => handleArrowClick(e, thisPath)}>
                                <ChevronRight size={14} />
                            </div>
                            {dropdownPath === thisPath && (
                                <div className="breadcrumb-dropdown">
                                    {dropdownItems.map(item => (
                                        <div key={item.path} className="breadcrumb-dropdown-item" onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setCurrentPath(item.path);
                                            setDropdownPath(null);
                                        }}>
                                            <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />
                                            <span>{item.name}</span>
                                        </div>
                                    ))}
                                    {dropdownItems.length === 0 && <div className="breadcrumb-dropdown-item" style={{ color: '#888' }}>空のフォルダー</div>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div style={{
            height: '38px', // Extremely compact Win10 style
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            backgroundColor: 'var(--bg-main)',
            gap: '4px',
            borderBottom: '1px solid var(--border-color)'
        }}>
            {/* Nav Buttons */}
            <div style={{ display: 'flex', gap: '2px' }}>
                <button onClick={goBack} disabled={!canGoBack} className="win10-nav-btn" style={{ opacity: canGoBack ? 1 : 0.4 }}>
                    <ArrowLeft size={16} strokeWidth={1.5} />
                </button>
                <button onClick={goForward} disabled={!canGoForward} className="win10-nav-btn" style={{ opacity: canGoForward ? 1 : 0.4 }}>
                    <ArrowRight size={16} strokeWidth={1.5} />
                </button>
                <div style={{ width: '4px' }}></div> {/* Tiny spacer */}
                <button onClick={goUp} className="win10-nav-btn" style={{ marginLeft: '2px' }}>
                    <ArrowUp size={16} strokeWidth={1.5} />
                </button>
                <button className="win10-nav-btn" onClick={async () => {
                    const result = await invoke('list_directory', { path: currentPath, showHidden: false });
                    setFiles(result as any);
                }}>
                    <RotateCw size={14} strokeWidth={1.5} />
                </button>
            </div>

            {/* Address Bar */}
            <div className={`win10-address-bar ${isEditing ? 'editing' : ''}`} style={{ position: 'relative' }} onClick={() => !isEditing && setIsEditing(true)}>
                {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', paddingLeft: '4px' }}>
                        <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} style={{ marginRight: '6px' }} />
                        <input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => {
                                // Short delay to allow mousedown on suggestions to fire
                                setTimeout(() => handlePathSubmit(), 150);
                            }}
                            onKeyDown={handleKeyDown}
                            style={{
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                flex: 1,
                                height: '100%',
                                color: 'var(--text-main)',
                                fontSize: '13px',
                                fontFamily: 'Segoe UI, sans-serif'
                            }}
                        />
                        {pathSuggestions.length > 0 && (
                            <div className="breadcrumb-dropdown" style={{ width: '100%' }}>
                                {pathSuggestions.map((item, idx) => (
                                    <div
                                        key={item.path}
                                        className="breadcrumb-dropdown-item"
                                        style={idx === suggestionIndex ? { backgroundColor: 'var(--hover-bg)' } : {}}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            let p = item.path;
                                            if (!p.endsWith('/') && !p.endsWith('\\')) p += p.includes('\\') ? '\\' : '/';
                                            setEditValue(p);
                                            setPathSuggestions([]);
                                            setSuggestionIndex(-1);
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
                    className="history-dropdown-toggle"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowHistoryDropdown(!showHistoryDropdown);
                        setDropdownPath(null);
                    }}
                >
                    <ChevronDown size={14} color="var(--text-muted)" />
                </div>
                {showHistoryDropdown && activeTab && (
                    <div className="breadcrumb-dropdown" style={{ right: 0, left: 'auto', minWidth: '300px' }}>
                        {[...activeTab.history].reverse().map((path, idx) => (
                            <div key={idx} className="breadcrumb-dropdown-item" onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCurrentPath(path);
                                setShowHistoryDropdown(false);
                            }}>
                                <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} style={{ flexShrink: 0 }} />
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{path}</span>
                            </div>
                        ))}
                        {activeTab.history.length === 0 && <div className="breadcrumb-dropdown-item" style={{ color: '#888' }}>履歴がありません</div>}
                    </div>
                )}
            </div>

            {/* Search Box */}
            <div className="win10-search-bar">
                <input
                    ref={searchInputRef}
                    placeholder={`${folderName} の検索`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        flex: 1,
                        color: 'var(--text-main)',
                        fontSize: '12px',
                        paddingLeft: '8px'
                    }}
                />
                <div className="search-icon-wrapper">
                    <Search size={14} color="var(--text-muted)" strokeWidth={1.5} />
                </div>
            </div>

            {/* Embedded styles for extreme density */}
            <style>{`
                .win10-nav-btn {
                    width: 34px;
                    height: 34px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 4px; /* Win11 uses more rounded, Win10 uses less */
                    color: var(--text-main);
                    cursor: pointer;
                    outline: none;
                }
                .win10-nav-btn:hover {
                    background-color: var(--hover-bg);
                }
                .win10-nav-btn:active {
                    background-color: var(--selected-bg);
                }
                
                .win10-address-bar {
                    flex: 1;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    background-color: transparent;
                    border: 1px solid transparent;
                    padding: 0 2px;
                    margin: 0 4px;
                    cursor: default;
                }
                .win10-address-bar:hover {
                    background-color: transparent;
                    border: 1px solid var(--border-color);
                }
                .win10-address-bar.editing {
                    background-color: var(--bg-main);
                    border: 1px solid #0078D7;
                    outline: 1px auto #0078D7;
                    cursor: text;
                }

                .win10-search-bar {
                    width: 240px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    background-color: transparent;
                    border: 1px solid var(--border-color);
                    padding: 0 4px;
                    margin-left: 2px;
                }
                .win10-search-bar:hover {
                    border: 1px solid #999;
                }
                .win10-search-bar:focus-within {
                    border: 1px solid #0078D7;
                    box-shadow: inset 0 0 0 1px #0078D7;
                }

                .search-icon-wrapper {
                    width: 24px;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: default;
                }
                .search-icon-wrapper:hover {
                    background-color: var(--hover-bg);
                }

                .breadcrumb-wrapper {
                    display: flex;
                    align-items: center;
                    height: 24px;
                }
                .breadcrumb-item {
                    display: flex;
                    align-items: center;
                    padding: 0 4px;
                    height: 100%;
                    font-size: 13px;
                    color: var(--text-main);
                    cursor: pointer;
                    border: 1px solid transparent;
                }
                .breadcrumb-item:hover {
                    background-color: var(--hover-bg);
                    border: 1px solid var(--hover-border);
                }
                .breadcrumb-arrow {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 16px;
                    height: 24px;
                    color: var(--text-muted);
                    cursor: pointer;
                    border: 1px solid transparent;
                }
                .breadcrumb-arrow:hover {
                    background-color: var(--hover-bg);
                    border: 1px solid var(--hover-border);
                }

                .history-dropdown-toggle {
                    width: 24px;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    border: 1px solid transparent;
                }
                .history-dropdown-toggle:hover {
                    background-color: var(--hover-bg);
                    border: 1px solid var(--hover-border);
                }

                .breadcrumb-dropdown {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    min-width: 200px;
                    max-height: 400px;
                    overflow-y: auto;
                    background-color: var(--bg-main);
                    border: 1px solid var(--border-color);
                    box-shadow: 2px 2px 5px rgba(0,0,0,0.2);
                    z-index: 1000;
                    padding: 2px 0;
                }
                .breadcrumb-dropdown-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 12px;
                    font-size: 13px;
                    color: var(--text-main);
                    cursor: pointer;
                }
                .breadcrumb-dropdown-item:hover {
                    background-color: var(--hover-bg);
                }
            `}</style>
        </div>
    );
};
