import React from 'react';
import { useAppStore } from '@/stores/appStore';
import { Check, SkipForward } from 'lucide-react';
import '@/styles/global.css';
import styles from '@/styles/components/dialogs/OverwriteConfirmDialog.module.css';

// Windows 10 の「ファイルの置換またはスキップ」ダイアログ
export const OverwriteConfirmDialog: React.FC = () => {
    const { overwriteConfirm, resolveOverwrite } = useAppStore();

    if (!overwriteConfirm) return null;

    const { targetFile } = overwriteConfirm;
    const fileName = targetFile.split('/').pop() || targetFile;

    return (
        <div className={styles.overlay}>
            <div className={styles.dialog}>
                {/* タイトルバー */}
                <div className={styles.titleBar}>
                    <div className={styles.title}>ファイルの置換またはスキップ</div>
                    <button
                        onClick={() => resolveOverwrite(false)}
                        className={styles.closeButton}
                    >✕</button>
                </div>

                {/* メインコンテンツ */}
                <div className={styles.content}>
                    <h2 className={styles.header}>
                        宛先には既に "{fileName}" という名前のファイルが存在します。
                    </h2>

                    {/* 選択肢リスト */}
                    <div className={styles.optionsList}>
                        {/* 置換ボタン */}
                        <OptionButton
                            icon={<Check size={28} strokeWidth={1.5} color="#0078D7" />}
                            title="宛先のファイルを置き換える(R)"
                            description="展開元のファイルで上書きします"
                            onClick={() => resolveOverwrite(true)}
                        />

                        {/* スキップボタン */}
                        <OptionButton
                            icon={<SkipForward size={28} strokeWidth={1.5} color="#0078D7" />}
                            title="このファイルをスキップする(S)"
                            description="宛先にあるファイルはそのまま残ります"
                            onClick={() => resolveOverwrite(false)}
                        />
                    </div>
                </div>

                {/* 下部チェックボックス（ダミーデザイン） */}
                <div className={styles.footer}>
                    <input type="checkbox" id="doForAll" />
                    <label htmlFor="doForAll" className={styles.checkboxLabel}>
                        すべてのコンフリクトで同じ処理を行う
                    </label>
                </div>
            </div>
        </div>
    );
};

// 選択肢ボタン
const OptionButton: React.FC<{
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick: () => void;
}> = ({ icon, title, description, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={styles.optionButton}
        >
            <div className={styles.optionIcon}>{icon}</div>
            <div className={styles.optionText}>
                <div className={styles.optionTitle}>{title}</div>
                <div className={styles.optionDescription}>{description}</div>
            </div>
        </button>
    );
};
