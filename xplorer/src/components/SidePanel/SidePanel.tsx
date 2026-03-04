import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Home, Laptop, Download, FileText, ChevronRight, ChevronDown, Monitor, HardDrive } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface NodeProps {
    path: string;
    name: string;
    icon: React.ReactNode;
    level: number;
    defaultExpanded?: boolean;
}

interface VolumeInfo {
    name: string;
    path: string;
    total_bytes: number;
    free_bytes: number;
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
    };

    const indent = level * 16;

    return (
        <div>
            <div
                style={{
                    display: 'flex', alignItems: 'center', padding: '4px 0',
                    paddingLeft: `${indent}px`, cursor: 'pointer',
                    backgroundColor: isExactMatch ? 'var(--selected-bg)' : 'transparent',
                    color: 'var(--text-main)', fontSize: '13px', height: '24px',
                    outline: 'none', border: '1px solid transparent', boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => { if (!isExactMatch) e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
                onMouseLeave={(e) => { if (!isExactMatch) e.currentTarget.style.backgroundColor = 'transparent'; }}
                onClick={handleSelect}
                onDoubleClick={handleToggle}
            >
                <div onClick={handleToggle} style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', paddingLeft: '4px' }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                <div style={{ marginLeft: '4px', display: 'flex', alignItems: 'center' }}>{icon}</div>
                <div style={{ marginLeft: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            </div>

            {isExpanded && (
                <div>
                    {loading && <div style={{ paddingLeft: `${indent + 40}px`, fontSize: '11px', color: '#999', paddingTop: '2px' }}>読み込み中...</div>}
                    {!loading && children.map(child => (
                        <FolderTreeItem key={child.path} path={child.path} name={child.name} icon={<FileText size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const VolumeItem = ({ vol }: { vol: VolumeInfo }) => {
    const { tabs, activeTabId, setCurrentPath } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const currentPath = activeTab?.currentPath || '';
    const isExactMatch = currentPath === vol.path;

    const usedBytes = vol.total_bytes - vol.free_bytes;
    const usedPercent = vol.total_bytes > 0 ? (usedBytes / vol.total_bytes) * 100 : 0;
    const barColor = usedPercent > 90 ? '#E81123' : usedPercent > 70 ? '#FFB900' : '#0078D7';

    return (
        <div
            style={{ padding: '4px 8px 4px 28px', cursor: 'pointer', backgroundColor: isExactMatch ? 'var(--selected-bg)' : 'transparent', fontSize: '13px' }}
            onMouseEnter={(e) => { if (!isExactMatch) e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
            onMouseLeave={(e) => { if (!isExactMatch) e.currentTarget.style.backgroundColor = 'transparent'; }}
            onClick={() => setCurrentPath(vol.path)}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HardDrive size={16} color="#555" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vol.name}</span>
            </div>
            {vol.total_bytes > 0 && (
                <div style={{ marginTop: '2px', marginLeft: '22px' }}>
                    <div style={{ height: '4px', backgroundColor: '#e0e0e0', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${usedPercent}%`, height: '100%', backgroundColor: barColor, borderRadius: '2px' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '1px' }}>
                        {formatBytes(vol.free_bytes)} 空き / {formatBytes(vol.total_bytes)}
                    </div>
                </div>
            )}
        </div>
    );
};

export const SidePanel = () => {
    const [homeDir, setHomeDir] = useState<string | null>(null);
    const [volumes, setVolumes] = useState<VolumeInfo[]>([]);

    useEffect(() => {
        invoke<string>('get_home_dir').then(setHomeDir).catch(console.error);
        invoke<VolumeInfo[]>('list_volumes').then(setVolumes).catch(console.error);
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
        <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--bg-main)', borderRight: 'none', overflowY: 'auto', overflowX: 'hidden', paddingTop: '8px' }}>
            {/* Quick Access */}
            <div style={{ padding: '0 8px' }}>
                <FolderTreeItem path="quick-access-root" name="クイックアクセス" icon={<Home size={16} color="#0078D7" fill="transparent" />} level={0} defaultExpanded={true} />
                <div style={{ paddingLeft: '8px' }}>
                    {quickAccessItems.map(item => (
                        <FolderTreeItem key={item.path} path={item.path} name={item.label} icon={item.icon} level={1} />
                    ))}
                </div>
            </div>

            <div style={{ margin: '16px 0', borderBottom: '1px solid #E5E5E5', width: '90%', marginLeft: '5%' }} />

            {/* PC */}
            <div style={{ padding: '0 8px' }}>
                <FolderTreeItem path="/" name="PC" icon={<Monitor size={16} color="#555" />} level={0} defaultExpanded={true} />
                {homeDir && (
                    <FolderTreeItem path={homeDir} name={homeDir.split('/').pop() || 'User'} icon={<FileText size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />} level={1} defaultExpanded={false} />
                )}
            </div>

            {/* Volumes / Drives */}
            {volumes.length > 0 && (
                <>
                    <div style={{ margin: '16px 0', borderBottom: '1px solid #E5E5E5', width: '90%', marginLeft: '5%' }} />
                    <div style={{ padding: '0 8px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 8px', fontWeight: 'bold' }}>ドライブ</div>
                        {volumes.map(vol => (
                            <VolumeItem key={vol.path} vol={vol} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
