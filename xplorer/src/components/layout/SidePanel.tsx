import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { Home, Laptop, Download, FileText, ChevronRight, ChevronDown, Monitor, HardDrive } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import styles from '@/styles/components/layout/SidePanel.module.css';

interface NodeProps {
    path: string;
    name: string;
    icon: React.ReactNode;
    level: number;
    defaultExpanded?: boolean;
    autoExpand?: boolean;
}

interface VolumeInfo {
    name: string;
    path: string;
    total_bytes: number;
    free_bytes: number;
    total_bytes_formatted: string;
    free_bytes_formatted: string;
}

const FolderTreeItem = ({ path, name, icon, level, defaultExpanded = false, autoExpand = true }: NodeProps) => {
    const { tabs, activeTabId, setCurrentPath } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const currentPath = activeTab?.currentPath || '';
    const isExactMatch = currentPath === path;

    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [children, setChildren] = useState<{ name: string, path: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);

    useEffect(() => {
        if (autoExpand && currentPath.startsWith(path) && path !== currentPath) {
            setIsExpanded(true);
        }
    }, [currentPath, path, autoExpand]);

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
                className={`${styles.treeItem} ${isExactMatch ? styles.selected : ''}`}
                style={{ paddingLeft: `${indent}px` }}
                onClick={handleSelect}
                onDoubleClick={handleToggle}
            >
                <div onClick={handleToggle} className={styles.toggleIcon}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                <div className={styles.itemIcon}>{icon}</div>
                <div className={styles.itemName}>{name}</div>
            </div>

            {isExpanded && (
                <div>
                    {loading && <div className={styles.loading} style={{ paddingLeft: `${indent + 40}px` }}>読み込み中...</div>}
                    {!loading && children.map(child => (
                        <FolderTreeItem key={child.path} path={child.path} name={child.name} icon={<FileText size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />} level={level + 1} autoExpand={autoExpand} />
                    ))}
                </div>
            )}
        </div>
    );
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
            className={`${styles.volumeItem} ${isExactMatch ? styles.selected : ''}`}
            onClick={() => setCurrentPath(vol.path)}
        >
            <div className={styles.volumeHeader}>
                <HardDrive size={16} color="#555" />
                <span className={styles.volumeName}>{vol.name}</span>
            </div>
            {vol.total_bytes > 0 && (
                <div className={styles.volumeBarContainer}>
                    <div className={styles.progressBarBack}>
                        <div className={styles.progressBarFill} style={{ width: `${usedPercent}%`, backgroundColor: barColor }} />
                    </div>
                    <div className={styles.volumeStats}>
                        {vol.free_bytes_formatted} 空き / {vol.total_bytes_formatted}
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
        { label: 'ホーム', path: homeDir || '/', icon: <Home size={16} color="#0078D7" /> },
        ...(homeDir ? [
            { label: 'デスクトップ', path: `${homeDir}/Desktop`, icon: <Laptop size={16} color="#0078D7" /> },
            { label: 'ダウンロード', path: `${homeDir}/Downloads`, icon: <Download size={16} color="#0078D7" /> },
            { label: 'ドキュメント', path: `${homeDir}/Documents`, icon: <FileText size={16} color="#0078D7" /> }
        ] : [])
    ];

    return (
        <div className={styles.sidePanel}>
            {/* Quick Access */}
            <div className={styles.section}>
                <FolderTreeItem path="quick-access-root" name="クイックアクセス" icon={<Home size={16} color="#0078D7" fill="transparent" />} level={0} defaultExpanded={true} />
                <div style={{ paddingLeft: '8px' }}>
                    {quickAccessItems.map(item => (
                        <FolderTreeItem key={item.path} path={item.path} name={item.label} icon={item.icon} level={1} autoExpand={false} />
                    ))}
                </div>
            </div>

            <div className={styles.divider} />

            {/* PC */}
            <div className={styles.section}>
                <FolderTreeItem path="/" name="PC" icon={<Monitor size={16} color="#555" />} level={0} defaultExpanded={true} autoExpand={false} />
                {homeDir && (
                    <FolderTreeItem path={homeDir} name={homeDir.split('/').pop() || 'User'} icon={<FileText size={16} fill="#FFB900" color="#F2A000" strokeWidth={1} />} level={1} defaultExpanded={false} autoExpand={false} />
                )}
            </div>

            {/* Volumes / Drives */}
            {volumes.length > 0 && (
                <>
                    <div className={styles.divider} />
                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>ドライブ</div>
                        {volumes.map(vol => (
                            <VolumeItem key={vol.path} vol={vol} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
