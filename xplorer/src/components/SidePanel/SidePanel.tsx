import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Home, Laptop, Download, FileText, ChevronRight, ChevronDown, Monitor } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface NodeProps {
    path: string;
    name: string;
    icon: React.ReactNode;
    level: number;
    defaultExpanded?: boolean;
}

const FolderTreeItem = ({ path, name, icon, level, defaultExpanded = false }: NodeProps) => {
    const { tabs, activeTabId, setCurrentPath } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const currentPath = activeTab?.currentPath || '';

    const isExactMatch = currentPath === path;

    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [children, setChildren] = useState<{ name: string, path: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);

    useEffect(() => {
        // Auto expand if current path is under this node
        if (currentPath.startsWith(path) && path !== currentPath) {
            setIsExpanded(true);
        }
    }, [currentPath, path]);

    useEffect(() => {
        if (isExpanded && !hasFetched) {
            setLoading(true);
            invoke('list_directory', { path, showHidden: false })
                .then((res: any) => {
                    const dirs = res.filter((f: any) => f.is_dir).sort((a: any, b: any) => a.name.localeCompare(b.name));
                    setChildren(dirs);
                    setHasFetched(true);
                })
                .catch(err => console.error('Failed to list dir in tree', err))
                .finally(() => setLoading(false));
        }
    }, [isExpanded, path, hasFetched]);

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    };

    const handleSelect = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentPath(path);
        // Do not force expand on click, let toggle handle expansion unless it's a double click or similar
    };

    const indent = level * 16;

    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: `4px 0`,
                    paddingLeft: `${indent}px`,
                    cursor: 'pointer',
                    backgroundColor: isExactMatch ? 'var(--selected-bg)' : 'transparent',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    height: '24px',
                    outline: 'none',
                    border: '1px solid transparent',
                    boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => {
                    if (!isExactMatch) e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                }}
                onMouseLeave={(e) => {
                    if (!isExactMatch) e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={handleSelect}
                onDoubleClick={handleToggle}
            >
                {/* Expander Arrow */}
                <div
                    onClick={handleToggle}
                    style={{
                        width: '16px',
                        height: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                        paddingLeft: '4px'
                    }}
                >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>

                <div style={{ marginLeft: '4px', display: 'flex', alignItems: 'center' }}>
                    {icon}
                </div>
                <div style={{ marginLeft: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {name}
                </div>
            </div>

            {isExpanded && (
                <div>
                    {loading && <div style={{ paddingLeft: `${indent + 40}px`, fontSize: '11px', color: '#999', paddingTop: '2px' }}>読み込み中...</div>}
                    {!loading && children.map(child => (
                        <FolderTreeItem
                            key={child.path}
                            path={child.path}
                            name={child.name}
                            icon={<FileText size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />}
                            level={level + 1}
                        />
                    ))}
                    {!loading && children.length === 0 && hasFetched && (
                        <div style={{ paddingLeft: `${indent + 40}px`, fontSize: '11px', color: '#999', display: 'none' }}>
                            {/* Empty marker if needed */}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const SidePanel = () => {
    const [homeDir, setHomeDir] = useState<string | null>(null);

    useEffect(() => {
        invoke<string>('get_home_dir').then(setHomeDir).catch(console.error);
    }, []);

    const quickAccessItems = [
        { label: 'ホーム', path: '/', icon: <Home size={16} color="#0078D7" /> },
        ...(homeDir ? [
            { label: 'デスクトップ', path: `${homeDir}/Desktop`, icon: <Laptop size={16} color="#0078D7" /> },
            { label: 'ダウンロード', path: `${homeDir}/Downloads`, icon: <Download size={16} color="#0078D7" /> },
            { label: 'ドキュメント', path: `${homeDir}/Documents`, icon: <FileText size={16} color="#0078D7" /> }
        ] : [])
    ];

    return (
        <div style={{
            width: 'var(--sidepanel-width)',
            height: '100%',
            backgroundColor: 'var(--bg-main)', // Windows 10 explorer side panel is typically white like main
            borderRight: '1px solid var(--border-color)',
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingTop: '8px'
        }}>
            <style>{`
                /* Hide scrollbar typically or use win10 scrollbar */
                ::-webkit-scrollbar {
                    width: 17px;
                    background-color: #F0F0F0;
                }
            `}</style>

            {/* Quick Access Top Level */}
            <div style={{ padding: '0 8px' }}>
                <FolderTreeItem
                    path="quick-access-root"
                    name="クイックアクセス"
                    icon={<Home size={16} color="#0078D7" fill="transparent" />}
                    level={0}
                    defaultExpanded={true}
                />

                {/* Flat list for quick access (fake tree) */}
                <div style={{ paddingLeft: '8px' }}>
                    {quickAccessItems.map(item => (
                        <FolderTreeItem
                            key={item.path}
                            path={item.path}
                            name={item.label}
                            icon={item.icon}
                            level={1}
                        />
                    ))}
                </div>
            </div>

            <div style={{ margin: '16px 0', borderBottom: '1px solid #E5E5E5', width: '90%', marginLeft: '5%' }} />

            {/* This PC Top Level */}
            <div style={{ padding: '0 8px' }}>
                <FolderTreeItem
                    path="/"
                    name="PC"
                    icon={<Monitor size={16} color="#555" />}
                    level={0}
                    defaultExpanded={true}
                />

                {/* For Mac, usually root / is equivalent to PC, but home dir is more useful */}
                {homeDir && (
                    <FolderTreeItem
                        path={homeDir}
                        name={homeDir.split('/').pop() || 'User'}
                        icon={<FileText size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />}
                        level={1}
                        defaultExpanded={false}
                    />
                )}
            </div>

        </div>
    );
};
