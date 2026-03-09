import { useEffect, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import styles from '@/styles/components/dialogs/LocationNotAvailableWindow.module.css';

/**
 * Windows 11 の「場所が利用できません」エラーダイアログ
 *
 * 存在しないパスに移動しようとした場合に、独立ポップアップウィンドウとして表示されます。
 * URLパラメータ: window=location-error&path=xxx
 */
export const LocationNotAvailableWindow = () => {
    const [path, setPath] = useState<string | null>(null);

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const pathParam = searchParams.get('path');
        if (pathParam) {
            setPath(pathParam);
        }
    }, []);

    const handleClose = async () => {
        await getCurrentWebviewWindow().close();
    };

    if (!path) {
        return (
            <div className={styles.window}>
                <div className={styles.content}>
                    <div className={styles.loading}>読み込み中...</div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.window}>
            {/* カスタムタイトルバー */}
            <div data-tauri-drag-region className={styles.titlebar}>
                <div data-tauri-drag-region className={styles.titlebarText}>場所が利用できません</div>
                <div className={styles.titlebarClose} onClick={handleClose}>✕</div>
            </div>

            {/* コンテンツエリア */}
            <div className={styles.content}>
                {/* エラーアイコンとメッセージ */}
                <div className={styles.errorContainer}>
                    <div className={styles.errorIcon}>
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                            <circle cx="24" cy="24" r="22" fill="#C5282F" />
                            <path d="M15 15L33 33M33 15L15 33" stroke="white" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                    </div>
                    <div className={styles.messageContainer}>
                        <p className={styles.message}>
                            {path} は利用できません。<br />
                            場所がこの PC 上にある場合は、デバイスまたはドライブが接続されていること、<br />
                            またはディスクが挿入されていることを確認してください。<br />
                            別の場所を試してください。<br />
                            場所がネットワーク上にある場合は、ネットワークに接続していることを確認してください。
                        </p>
                    </div>
                </div>

                {/* OKボタン */}
                <div className={styles.buttonContainer}>
                    <button
                        onClick={handleClose}
                        className={styles.okButton}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};
