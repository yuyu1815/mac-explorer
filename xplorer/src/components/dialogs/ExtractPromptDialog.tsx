import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import styles from '@/styles/components/dialogs/ExtractPromptDialog.module.css';

export const ExtractPromptDialog: React.FC = () => {
    const extractPrompt = useAppStore(state => state.extractPrompt);
    const resolveExtract = useAppStore(state => state.resolveExtract);
    const [destPath, setDestPath] = useState('');
    const [showFiles, setShowFiles] = useState(true);

    useEffect(() => {
        if (extractPrompt) {
            setDestPath(extractPrompt.destPath);
            setShowFiles(true);
        }
    }, [extractPrompt]);

    if (!extractPrompt) return null;

    const handleBrowse = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: destPath || undefined,
                title: '展開先フォルダーを選択',
            });
            if (selected && typeof selected === 'string') {
                setDestPath(selected);
            }
        } catch (error) {
            console.error('Failed to select directory:', error);
        }
    };

    const handleExtract = () => {
        resolveExtract({ destPath, showFiles });
    };

    const handleCancel = () => {
        resolveExtract(null);
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.dialog}>
                {/* タイトルバー */}
                <div className={styles.titleBar}>
                    <div className={styles.titleGroup}>
                        <span className={styles.titleIcon}>📁</span>
                        <span className={styles.titleText}>圧縮 (ZIP 形式) フォルダーの展開</span>
                    </div>
                    <button onClick={handleCancel} className={styles.closeBtn}>✕</button>
                </div>

                {/* メインコンテンツ */}
                <div className={styles.content}>
                    <h2 className={styles.header}>
                        展開先の選択とファイルの展開
                    </h2>

                    <div className={styles.label}>
                        ファイルを下のフォルダーに展開する(F):
                    </div>

                    <div className={styles.inputGroup}>
                        <input
                            type="text"
                            value={destPath}
                            onChange={(e) => setDestPath(e.target.value)}
                            className={styles.input}
                        />
                        <button onClick={handleBrowse} className={styles.browseBtn}>参照(R)...</button>
                    </div>

                    <label className={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={showFiles}
                            onChange={(e) => setShowFiles(e.target.checked)}
                        />
                        完了時に展開されたファイルを表示する(H)
                    </label>
                </div>

                {/* フッター */}
                <div className={styles.footer}>
                    <button onClick={handleExtract} className={styles.actionBtn}>展開(E)</button>
                    <button onClick={handleCancel} className={styles.actionBtn}>キャンセル</button>
                </div>
            </div>
        </div>
    );
};
