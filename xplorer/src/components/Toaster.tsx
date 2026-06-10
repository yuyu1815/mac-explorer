import { X } from 'lucide-react';
import { useNotificationStore } from '@/stores/notificationStore';
import styles from '@/styles/components/Toaster.module.css';

export const Toaster = () => {
    const { notifications, dismiss } = useNotificationStore();

    if (notifications.length === 0) return null;

    return (
        <div className={styles.container}>
            {notifications.map((n) => (
                <div key={n.id} className={styles.toast} role="alert">
                    <span className={styles.message}>{n.message}</span>
                    <button className={styles.close} onClick={() => dismiss(n.id)} aria-label="閉じる">
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
};
