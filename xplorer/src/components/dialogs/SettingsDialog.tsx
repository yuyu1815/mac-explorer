import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { DisplaySettings, ApplicationSettings } from '@/types';
import { Palette, Settings2, ChevronRight } from 'lucide-react';
import styles from '@/styles/components/dialogs/SettingsDialog.module.css';

type SettingsTab = 'display' | 'application';

export const SettingsDialog: React.FC = () => {
    const { settings, loaded, settingsOpen, loadSettings, closeSettings, updateDisplaySettings, updateAppSettings } = useSettingsStore();
    const [activeTab, setActiveTab] = useState<SettingsTab>('display');

    useEffect(() => {
        if (!loaded) {
            loadSettings();
        }
    }, [loaded, loadSettings]);

    if (!loaded || !settingsOpen) return null;

    const handleClose = () => {
        closeSettings();
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    };

    return (
        <div className={styles.overlay} onClick={handleOverlayClick}>
            <div className={styles.dialog}>
                <div className={styles.titleBar}>
                    <div className={styles.title}>設定</div>
                    <button onClick={handleClose} className={styles.closeButton}>✕</button>
                </div>

                <div className={styles.content}>
                    <div className={styles.sidebar}>
                        <button
                            className={`${styles.navItem} ${activeTab === 'display' ? styles.active : ''}`}
                            onClick={() => setActiveTab('display')}
                        >
                            <Palette size={16} />
                            <span>表示</span>
                            <ChevronRight size={14} className={styles.chevron} />
                        </button>
                        <button
                            className={`${styles.navItem} ${activeTab === 'application' ? styles.active : ''}`}
                            onClick={() => setActiveTab('application')}
                        >
                            <Settings2 size={16} />
                            <span>アプリ</span>
                            <ChevronRight size={14} className={styles.chevron} />
                        </button>
                    </div>

                    <div className={styles.mainContent}>
                        {activeTab === 'display' ? (
                            <DisplaySettingsPanel
                                settings={settings.display}
                                onUpdate={updateDisplaySettings}
                            />
                        ) : (
                            <ApplicationSettingsPanel
                                settings={settings.app}
                                onUpdate={updateAppSettings}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

interface DisplaySettingsPanelProps {
    settings: DisplaySettings;
    onUpdate: (updates: Partial<DisplaySettings>) => Promise<void>;
}

const DisplaySettingsPanel: React.FC<DisplaySettingsPanelProps> = ({ settings, onUpdate }) => {
    return (
        <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>外観</h3>

            <div className={styles.field}>
                <label className={styles.label}>テーマ</label>
                <select
                    className={styles.select}
                    value={settings.theme}
                    onChange={(e) => onUpdate({ theme: e.target.value as typeof settings.theme })}
                >
                    <option value="system">システム設定に従う</option>
                    <option value="light">ライト</option>
                    <option value="dark">ダーク</option>
                </select>
            </div>

            <div className={styles.field}>
                <label className={styles.label}>フォントサイズ</label>
                <select
                    className={styles.select}
                    value={settings.fontSize}
                    onChange={(e) => onUpdate({ fontSize: e.target.value as typeof settings.fontSize })}
                >
                    <option value="small">小</option>
                    <option value="medium">中</option>
                    <option value="large">大</option>
                </select>
            </div>

            <h3 className={styles.sectionTitle}>ビュー</h3>

            <div className={styles.field}>
                <label className={styles.label}>デフォルトのビューモード</label>
                <select
                    className={styles.select}
                    value={settings.defaultViewMode}
                    onChange={(e) => onUpdate({ defaultViewMode: e.target.value as typeof settings.defaultViewMode })}
                >
                    <option value="detail">詳細</option>
                    <option value="icon">アイコン</option>
                    <option value="list">一覧</option>
                    <option value="tiles">タイル</option>
                    <option value="content">コンテンツ</option>
                </select>
            </div>

            <h3 className={styles.sectionTitle}>表示オプション</h3>

            <div className={styles.checkboxField}>
                <input
                    type="checkbox"
                    id="showHiddenFiles"
                    checked={settings.showHiddenFiles}
                    onChange={(e) => onUpdate({ showHiddenFiles: e.target.checked })}
                />
                <label htmlFor="showHiddenFiles">隠しファイルを表示</label>
            </div>

            <div className={styles.checkboxField}>
                <input
                    type="checkbox"
                    id="showFileExtensions"
                    checked={settings.showFileExtensions}
                    onChange={(e) => onUpdate({ showFileExtensions: e.target.checked })}
                />
                <label htmlFor="showFileExtensions">ファイル拡張子を表示</label>
            </div>

            <div className={styles.checkboxField}>
                <input
                    type="checkbox"
                    id="showItemCheckboxes"
                    checked={settings.showItemCheckboxes}
                    onChange={(e) => onUpdate({ showItemCheckboxes: e.target.checked })}
                />
                <label htmlFor="showItemCheckboxes">アイテムチェックボックスを表示</label>
            </div>

            <div className={styles.checkboxField}>
                <input
                    type="checkbox"
                    id="showDetailsPane"
                    checked={settings.showDetailsPane}
                    onChange={(e) => onUpdate({ showDetailsPane: e.target.checked })}
                />
                <label htmlFor="showDetailsPane">詳細ペインを表示</label>
            </div>
        </div>
    );
};

interface ApplicationSettingsPanelProps {
    settings: ApplicationSettings;
    onUpdate: (updates: Partial<ApplicationSettings>) => Promise<void>;
}

const ApplicationSettingsPanel: React.FC<ApplicationSettingsPanelProps> = ({ settings, onUpdate }) => {
    return (
        <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>全般</h3>

            <div className={styles.field}>
                <label className={styles.label}>言語</label>
                <select
                    className={styles.select}
                    value={settings.language}
                    onChange={(e) => onUpdate({ language: e.target.value as typeof settings.language })}
                >
                    <option value="ja">日本語</option>
                    <option value="en">English</option>
                </select>
            </div>

            <h3 className={styles.sectionTitle}>起動</h3>

            <div className={styles.field}>
                <label className={styles.label}>起動時の動作</label>
                <select
                    className={styles.select}
                    value={settings.startupBehavior}
                    onChange={(e) => onUpdate({ startupBehavior: e.target.value as typeof settings.startupBehavior })}
                >
                    <option value="default_folder">デフォルトフォルダを開く</option>
                    <option value="last_folder">最後に開いたフォルダを開く</option>
                </select>
            </div>

            <div className={styles.field}>
                <label className={styles.label}>デフォルトフォルダ</label>
                <div className={styles.inputWithButton}>
                    <input
                        type="text"
                        className={styles.input}
                        value={settings.defaultFolder}
                        onChange={(e) => onUpdate({ defaultFolder: e.target.value })}
                    />
                </div>
            </div>

            <h3 className={styles.sectionTitle}>確認</h3>

            <div className={styles.checkboxField}>
                <input
                    type="checkbox"
                    id="confirmTrash"
                    checked={settings.confirmTrash}
                    onChange={(e) => onUpdate({ confirmTrash: e.target.checked })}
                />
                <label htmlFor="confirmTrash">ゴミ箱への移動前に確認する</label>
            </div>

            <div className={styles.checkboxField}>
                <input
                    type="checkbox"
                    id="confirmPermanentDelete"
                    checked={settings.confirmPermanentDelete}
                    onChange={(e) => onUpdate({ confirmPermanentDelete: e.target.checked })}
                />
                <label htmlFor="confirmPermanentDelete">完全削除前に確認する</label>
            </div>
        </div>
    );
};
