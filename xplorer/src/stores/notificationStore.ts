import { create } from 'zustand';

export interface Notification {
    id: number;
    message: string;
}

interface NotificationState {
    notifications: Notification[];
    notifyError: (message: string) => void;
    dismiss: (id: number) => void;
}

// 自動消滅までの時間。エラー文を読み切れる程度に長めをとる
const AUTO_DISMISS_MS = 5000;

let nextId = 0;

export const useNotificationStore = create<NotificationState>((set) => ({
    notifications: [],
    notifyError: (message) => {
        const id = nextId++;
        set((state) => ({ notifications: [...state.notifications, { id, message }] }));
        setTimeout(() => {
            set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
        }, AUTO_DISMISS_MS);
    },
    dismiss: (id) =>
        set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
}));
