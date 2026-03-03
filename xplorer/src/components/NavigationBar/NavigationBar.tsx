import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useAppStore } from '../../stores/appStore';
import { ArrowLeft, ArrowRight, ArrowUp, RotateCw, Search, ChevronRight } from 'lucide-react';

export const NavigationBar = () => {
    const { tabs, activeTabId, goBack, goForward, goUp, setCurrentPath } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);

    const canGoBack = activeTab ? activeTab.historyIndex > 0 : false;
    const canGoForward = activeTab ? activeTab.historyIndex < activeTab.history.length - 1 : false;
    const currentPath = activeTab?.currentPath || '';

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
            // Very basic normalization (e.g. remove trailing slash if not root)
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
            // Windows
            newPath = parts.slice(0, index + 1).join('\\');
            if (newPath.endsWith(':')) newPath += '\\';
        }
        setCurrentPath(newPath);
    };

    const renderBreadcrumbs = () => {
        if (!currentPath) return null;
        const sep = currentPath.includes('\\') ? '\\' : '/';
        let parts = currentPath.split(sep);

        // Handle unix root
        if (sep === '/' && currentPath.startsWith('/')) {
            parts.shift(); // remove empty first element
        }

        return (
            <div
                style={{ display: 'flex', alignItems: 'center', height: '100%', flex: 1, padding: '0 4px', cursor: 'text' }}
                onClick={() => setIsEditing(true)}
            >
                {/* For Unix root */}
                {sep === '/' && currentPath.startsWith('/') && (
                    <div
                        onClick={(e) => { e.stopPropagation(); setCurrentPath('/'); }}
                        style={breadcrumbItemStyle}
                        className="breadcrumb-item"
                    >
                        /
                    </div>
                )}
                {sep === '/' && currentPath.startsWith('/') && parts.length > 0 && parts[0] !== "" && (
                    <ChevronRight size={14} color="var(--text-muted)" style={{ margin: '0 2px' }} />
                )}
                {parts.map((part, i) => {
                    if (!part) return null;
                    return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                            <div
                                onClick={(e) => handleBreadcrumbClick(e, i, parts)}
                                style={breadcrumbItemStyle}
                                className="breadcrumb-item"
                            >
                                {part}
                            </div>
                            {i < parts.length - 1 && (
                                <ChevronRight size={14} color="var(--text-muted)" style={{ margin: '0 2px' }} />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const breadcrumbItemStyle = {
        padding: '2px 6px',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-main)',
        fontSize: '13px',
        cursor: 'pointer',
        userSelect: 'none' as const
    };

    const navBtnStyle = {
        width: 32,
        height: 32,
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        border: 'none',
        color: 'var(--text-main)',
        cursor: 'pointer'
    };

    return (
        <div style={{
            height: 'var(--navbar-height)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-main)',
            gap: '8px'
        }}>
            <button
                onClick={goBack}
                disabled={!canGoBack}
                style={{ ...navBtnStyle, opacity: canGoBack ? 1 : 0.5 }}
                className="nav-btn"
            ><ArrowLeft size={16} /></button>
            <button
                onClick={goForward}
                disabled={!canGoForward}
                style={{ ...navBtnStyle, opacity: canGoForward ? 1 : 0.5 }}
                className="nav-btn"
            ><ArrowRight size={16} /></button>
            <button
                onClick={goUp}
                style={navBtnStyle}
                className="nav-btn"
            ><ArrowUp size={16} /></button>
            <button
                style={{ ...navBtnStyle, marginLeft: '4px' }}
                className="nav-btn"
            ><RotateCw size={14} /></button>

            <div style={{
                flex: 1,
                border: '1px solid var(--border-color)',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                backgroundColor: isEditing ? 'var(--bg-main)' : 'transparent',
                boxShadow: isEditing ? '0 0 0 2px rgba(0, 120, 212, 0.3)' : 'none'
            }}>
                {isEditing ? (
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
                            width: '100%',
                            height: '100%',
                            padding: '0 12px',
                            color: 'var(--text-main)',
                            fontSize: '13px',
                            fontFamily: 'inherit'
                        }}
                    />
                ) : (
                    renderBreadcrumbs()
                )}
            </div>

            <div style={{
                width: '240px',
                border: '1px solid var(--border-color)',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                backgroundColor: 'transparent'
            }}>
                <Search size={14} color="var(--text-muted)" style={{ marginRight: '6px' }} />
                <input
                    placeholder="検索"
                    style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', color: 'var(--text-main)', fontSize: '13px' }}
                />
            </div>
        </div>
    );
};
