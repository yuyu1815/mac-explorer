import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useAppStore } from '../../stores/appStore';
import { ArrowLeft, ArrowRight, ArrowUp, RotateCw, Search, ChevronRight, Folder } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export const NavigationBar = () => {
    const { tabs, activeTabId, goBack, goForward, goUp, setCurrentPath, setFiles } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    const canGoBack = activeTab ? activeTab.historyIndex > 0 : false;
    const canGoForward = activeTab ? activeTab.historyIndex < activeTab.history.length - 1 : false;
    const currentPath = activeTab?.currentPath || 'C:\\'; // default to something so it doesn't crash
    const folderName = currentPath.split(/[/\\]/).pop() || 'エクスプローラー';

    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(currentPath);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setEditValue(currentPath);
    }, [currentPath]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

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
        if (e.key === 'Enter') {
            handlePathSubmit();
        } else if (e.key === 'Escape') {
            setEditValue(currentPath);
            setIsEditing(false);
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
                    <div className="breadcrumb-wrapper">
                        <div onClick={(e) => { e.stopPropagation(); setCurrentPath('/'); }} className="breadcrumb-item">
                            /
                        </div>
                        <div className="breadcrumb-arrow" onClick={(e) => e.stopPropagation()}>
                            <ChevronRight size={14} />
                        </div>
                    </div>
                )}

                {parts.map((part, i) => {
                    if (!part) return null;
                    return (
                        <div key={i} className="breadcrumb-wrapper">
                            <div onClick={(e) => handleBreadcrumbClick(e, i, parts)} className="breadcrumb-item">
                                {part}
                            </div>
                            <div className="breadcrumb-arrow" onClick={(e) => e.stopPropagation()}>
                                <ChevronRight size={14} />
                            </div>
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
            <div className={`win10-address-bar ${isEditing ? 'editing' : ''}`} onClick={() => !isEditing && setIsEditing(true)}>
                {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', paddingLeft: '4px' }}>
                        <Folder size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} style={{ marginRight: '6px' }} />
                        <input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handlePathSubmit}
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
                    </div>
                ) : (
                    renderBreadcrumbs()
                )}
            </div>

            {/* Search Box */}
            <div className="win10-search-bar">
                <input
                    placeholder={`${folderName} の検索`}
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

            <style>{`
                .win10-nav-btn {
                    width: 28px;
                    height: 28px;
                    border: 1px solid transparent;
                    background: transparent;
                    color: var(--text-main);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: default;
                }
                .win10-nav-btn:hover:not(:disabled) {
                    background-color: var(--hover-bg);
                    border-color: var(--hover-border);
                }
                .win10-nav-btn:active:not(:disabled) {
                    background-color: var(--selected-bg);
                    border-color: var(--selected-border);
                }
                
                .win10-address-bar {
                    flex: 1;
                    height: 26px;
                    border: 1px solid var(--border-color);
                    background-color: var(--bg-main);
                    display: flex;
                    align-items: center;
                    cursor: text;
                    position: relative;
                }
                .win10-address-bar:hover {
                    border-color: #A0A0A0; /* Slightly darker border on hover */
                }
                .win10-address-bar.editing {
                    border-color: var(--accent-color);
                    box-shadow: inset 0 0 0 1px var(--accent-color);
                }

                .breadcrumb-wrapper {
                    display: flex;
                    align-items: center;
                    height: 100%;
                }
                .breadcrumb-item {
                    padding: 0 4px;
                    height: 22px;
                    display: flex;
                    align-items: center;
                    cursor: default;
                    font-size: 13px;
                    border: 1px solid transparent;
                }
                .breadcrumb-item:hover {
                    background-color: var(--hover-bg);
                    border-color: var(--hover-border);
                }
                
                .breadcrumb-arrow {
                    padding: 0 2px;
                    height: 22px;
                    display: flex;
                    align-items: center;
                    cursor: default;
                    border: 1px solid transparent;
                    color: var(--text-muted);
                }
                .breadcrumb-arrow:hover {
                    background-color: var(--hover-bg);
                    border-color: var(--hover-border);
                }

                .win10-search-bar {
                    width: 260px;
                    height: 26px;
                    border: 1px solid var(--border-color);
                    background-color: var(--bg-main);
                    display: flex;
                    align-items: center;
                    transition: none;
                }
                .win10-search-bar:hover {
                    border-color: #A0A0A0;
                }
                .win10-search-bar:focus-within {
                    border-color: var(--accent-color);
                    box-shadow: inset 0 0 0 1px var(--accent-color);
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
            `}</style>
        </div>
    );
};
