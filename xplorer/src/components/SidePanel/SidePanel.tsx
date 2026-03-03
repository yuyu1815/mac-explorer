import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Home, Image as ImageIcon, Laptop, Download, FileText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export const SidePanel = () => {
    const { tabs, activeTabId, setCurrentPath } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const currentPath = activeTab?.currentPath || '';

    const [homeDir, setHomeDir] = useState<string | null>(null);

    useEffect(() => {
        invoke<string>('get_home_dir').then(setHomeDir).catch(console.error);
    }, []);

    const menuItems = [
        { label: 'ホーム', path: '/', icon: <Home size={16} /> },
        ...(homeDir ? [
            { label: 'デスクトップ', path: `${homeDir}/Desktop`, icon: <Laptop size={16} strokeWidth={1.5} color="#4CC2FF" /> },
            { label: 'ダウンロード', path: `${homeDir}/Downloads`, icon: <Download size={16} strokeWidth={1.5} color="#4CC2FF" /> },
            { label: 'ドキュメント', path: `${homeDir}/Documents`, icon: <FileText size={16} strokeWidth={1.5} color="#4CC2FF" /> },
            { label: 'ピクチャ', path: `${homeDir}/Pictures`, icon: <ImageIcon size={16} strokeWidth={1.5} color="#4CC2FF" /> }
        ] : [])
    ];

    return (
        <div style={{
            width: 'var(--sidepanel-width)',
            height: '100%',
            backgroundColor: 'var(--bg-side)',
            borderRight: '1px solid var(--border-color)',
            padding: '12px 0',
            overflowY: 'auto'
        }}>
            <div style={{ padding: '0 16px', marginBottom: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                クイックアクセス
            </div>
            {menuItems.map(item => {
                const isSelected = currentPath === item.path;
                return (
                    <div
                        key={item.path}
                        style={{
                            padding: '6px 24px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            cursor: 'pointer',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: isSelected ? 'var(--hover-side-bg)' : 'transparent',
                            color: 'var(--text-main)',
                            fontSize: '13px'
                        }}
                        onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--hover-side-bg)';
                        }}
                        onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={() => setCurrentPath(item.path)}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px' }}>
                            {item.icon}
                        </span>
                        <span style={{ fontWeight: isSelected ? 600 : 400 }}>{item.label}</span>
                    </div>
                );
            })}
        </div>
    );
};
