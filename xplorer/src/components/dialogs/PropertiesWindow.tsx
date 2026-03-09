import React, { useEffect, useState } from 'react';
import { PropertiesDialog } from './PropertiesDialog';
import styles from '@/styles/components/dialogs/PropertiesWindow.module.css';

export const PropertiesWindow: React.FC = () => {
    const [path, setPath] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const filePath = searchParams.get('path');
        if (!filePath) {
            setError('ファイルパスが指定されていません');
            return;
        }
        setPath(filePath);
    }, []);

    if (error) {
        return (
            <div className={styles.errorContainer}>
                <h3 className={styles.errorTitle}>エラー</h3>
                <p>{error}</p>
            </div>
        );
    }

    if (!path) {
        return <div className={styles.loading}>読み込み中...</div>;
    }

    return <PropertiesDialog path={path} />;
};
