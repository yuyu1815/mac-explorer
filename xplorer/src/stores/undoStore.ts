import { create } from 'zustand';
import { ipc } from '@/services/ipc';
import { useAppStore } from '@/stores/appStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { baseName, parentDir, joinPath } from '@/utils/path';

// 記録するファイル操作。delete はゴミ箱からの正確な復元が保証できないため対象外とする。
export type FileOp =
    | { type: 'rename'; from: string; to: string }
    | { type: 'move'; originalPaths: string[]; dest: string }
    | { type: 'copy'; sources: string[]; dest: string; createdPaths: string[] }
    | { type: 'create'; path: string };

const HISTORY_LIMIT = 50;

// 操作種別 → 逆操作。undo 実行時にこの逆操作を呼ぶ。
const invert: Record<FileOp['type'], (op: FileOp) => Promise<void>> = {
    rename: async (op) => {
        const o = op as Extract<FileOp, { type: 'rename' }>;
        await ipc.renameFile(o.to, baseName(o.from));
    },
    move: async (op) => {
        const o = op as Extract<FileOp, { type: 'move' }>;
        for (const p of o.originalPaths) {
            await ipc.moveFiles([joinPath(o.dest, baseName(p))], parentDir(p));
        }
    },
    copy: async (op) => {
        const o = op as Extract<FileOp, { type: 'copy' }>;
        if (o.createdPaths.length === 0) return;
        await ipc.deleteFiles(o.createdPaths);
    },
    create: async (op) => {
        const o = op as Extract<FileOp, { type: 'create' }>;
        await ipc.deleteFiles([o.path]);
    },
};

// 操作種別 → 順操作。redo 実行時に元の操作を再現し、undo スタックへ積み直す op を返す。
// copy は再実行のたびに連番名（xxx - コピー (n)）が変わりうるため、実際の作成パスで記録を更新する。
const replay: Record<FileOp['type'], (op: FileOp) => Promise<FileOp>> = {
    rename: async (op) => {
        const o = op as Extract<FileOp, { type: 'rename' }>;
        await ipc.renameFile(o.from, baseName(o.to));
        return o;
    },
    move: async (op) => {
        const o = op as Extract<FileOp, { type: 'move' }>;
        await ipc.moveFiles(o.originalPaths, o.dest);
        return o;
    },
    copy: async (op) => {
        const o = op as Extract<FileOp, { type: 'copy' }>;
        const { created_paths, errors } = await ipc.copyFiles(o.sources, o.dest);
        if (errors.length > 0) throw new Error(errors.join('\n'));
        return { ...o, createdPaths: created_paths };
    },
    create: async (op) => {
        const o = op as Extract<FileOp, { type: 'create' }>;
        if (o.path.endsWith('/') || !baseName(o.path).includes('.')) {
            await ipc.createDirectory(o.path);
            return o;
        }
        await ipc.createFile(o.path);
        return o;
    },
};

// 現在表示中のディレクトリを再読込する。各コンポーネントの refreshFiles と同じ手順。
const refreshActiveTab = async () => {
    const { tabs, activeTabId, setFiles } = useAppStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || tab.currentPath === 'this-pc') return;
    const result = await ipc.listFilesSorted(tab.currentPath, false, tab.sortBy, tab.sortDesc, tab.searchQuery);
    setFiles(result);
};

interface UndoState {
    undoStack: FileOp[];
    redoStack: FileOp[];
    record: (op: FileOp) => void;
    undo: () => Promise<void>;
    redo: () => Promise<void>;
}

export const useUndoStore = create<UndoState>((set, get) => ({
    undoStack: [],
    redoStack: [],

    // 新しい操作を記録すると redo は無効化される。
    record: (op) =>
        set((state) => ({
            undoStack: [...state.undoStack, op].slice(-HISTORY_LIMIT),
            redoStack: [],
        })),

    undo: async () => {
        const op = get().undoStack[get().undoStack.length - 1];
        if (!op) return;
        set((state) => ({ undoStack: state.undoStack.slice(0, -1) }));
        try {
            await invert[op.type](op);
            await refreshActiveTab();
            set((state) => ({ redoStack: [...state.redoStack, op].slice(-HISTORY_LIMIT) }));
        } catch (err) {
            useNotificationStore.getState().notifyError(`元に戻せませんでした: ${err}`);
        }
    },

    redo: async () => {
        const op = get().redoStack[get().redoStack.length - 1];
        if (!op) return;
        set((state) => ({ redoStack: state.redoStack.slice(0, -1) }));
        try {
            const replayed = await replay[op.type](op);
            await refreshActiveTab();
            set((state) => ({ undoStack: [...state.undoStack, replayed].slice(-HISTORY_LIMIT) }));
        } catch (err) {
            useNotificationStore.getState().notifyError(`やり直せませんでした: ${err}`);
        }
    },
}));
