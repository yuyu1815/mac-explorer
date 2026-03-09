import React from 'react';
import { useAppStore } from '@/stores/appStore';
import { Trash2, AlertTriangle } from 'lucide-react';
import styles from '@/styles/components/dialogs/TrashConfirmDialog.module.css';

export const TrashConfirmDialog: React.FC = () => {
    const { trashConfirm, resolveTrash } = useAppStore();

    if (!trashConfirm) return null;

    const { itemCount, permanent } = trashConfirm;
    const itemText = itemCount === 1 ? '項目' : `${itemCount}項目`;

    const handleConfirm = () => {
        resolveTrash(true);
    };

    const handleCancel = () => {
        resolveTrash(false);
    };

    return (
        <div className={styles.overlay} onClick={handleCancel}>
            <div className={styles.dialog} onClick={e => e.stopPropagation()}>
                <div className={styles.titleBar}>
                    <div className={styles.title}>
                        {permanent ? '完全に削除' : 'ゴミ箱に移動'}
                    </div>
                    <button onClick={handleCancel} className={styles.closeButton}>✕</button>
                </div>

                <div className={styles.content}>
                    <div className={styles.iconContainer}>
                        {permanent ? (
                            <AlertTriangle size={48} strokeWidth={1.5} color="#E81123" />
                        ) : (
                            <Trash2 size={48} strokeWidth={1.5} color="#0078D7" />
                        )}
                    </div>

                    <div className={styles.messageContainer}>
                        {permanent ? (
                            <>
                                <h2 className={styles.header}>
                                    選択した{itemText}を完全に削除しますか？
                                </h2>
                                <p className={styles.warning}>
                                    この操作は元に戻せません。
                                </p>
                            </>
                        ) : (
                            <h2 className={styles.header}>
                                選択した{itemText}をゴミ箱に移動しますか？
                            </h2>
                        )}
                    </div>

                    <div className={styles.buttons}>
                        <button
                            onClick={handleConfirm}
                            className={permanent ? styles.deleteButton : styles.moveButton}
                        >
                            {permanent ? '削除' : '移動'}
                        </button>
                        <button onClick={handleCancel} className={styles.cancelButton}>
                            キャンセル
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
