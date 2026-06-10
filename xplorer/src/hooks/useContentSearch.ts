import { useState, useCallback } from 'react';
import { ipc } from '@/services/ipc';
import { ContentMatch } from '@/types';
import { useNotificationStore } from '@/stores/notificationStore';

export interface FileMatchGroup {
    path: string;
    matches: ContentMatch[];
}

interface ContentSearchState {
    groups: FileMatchGroup[];
    truncated: boolean;
    searching: boolean;
    hasSearched: boolean;
}

const groupByPath = (matches: ContentMatch[]): FileMatchGroup[] => {
    const order: string[] = [];
    const byPath = new Map<string, ContentMatch[]>();
    for (const m of matches) {
        const existing = byPath.get(m.path);
        if (existing) {
            existing.push(m);
            continue;
        }
        order.push(m.path);
        byPath.set(m.path, [m]);
    }
    return order.map(path => ({ path, matches: byPath.get(path)! }));
};

const EMPTY: ContentSearchState = { groups: [], truncated: false, searching: false, hasSearched: false };

export const useContentSearch = (dir: string) => {
    const [state, setState] = useState<ContentSearchState>(EMPTY);
    const notifyError = useNotificationStore(s => s.notifyError);

    const search = useCallback(async (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return;

        setState({ ...EMPTY, searching: true });
        try {
            const result = await ipc.searchFileContents(dir, trimmed);
            setState({
                groups: groupByPath(result.matches),
                truncated: result.truncated,
                searching: false,
                hasSearched: true,
            });
        } catch (err) {
            notifyError(err instanceof Error ? err.message : String(err));
            setState({ ...EMPTY, hasSearched: true });
        }
    }, [dir, notifyError]);

    const reset = useCallback(() => setState(EMPTY), []);

    return { ...state, search, reset };
};
