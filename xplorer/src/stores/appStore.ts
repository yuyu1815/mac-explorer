import { create } from 'zustand';

export interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    size: number;
    modified: number;
    created: number;
    file_type: string;
    is_hidden: boolean;
    is_symlink: boolean;
    permissions: string;
}

export type ViewMode = 'detail' | 'list' | 'icon';
export type SortColumn = 'name' | 'modified' | 'file_type' | 'size';

export interface Tab {
    id: string;
    currentPath: string;
    history: string[];
    historyIndex: number;
    files: FileEntry[];
    selectedFiles: Set<string>;
    focusedIndex: number;
    viewMode: ViewMode;
    sortBy: SortColumn;
    sortDesc: boolean;
    searchQuery: string;
}

interface AppState {
    tabs: Tab[];
    activeTabId: string;
    clipboard: { files: string[], operation: 'copy' | 'cut' } | null;
    renameTriggerId: number;
    showDetailsPane: boolean;
    loading: boolean;

    // Actions
    addTab: (path?: string) => void;
    closeTab: (id: string) => void;
    setActiveTab: (id: string) => void;

    setCurrentPath: (path: string) => void;
    goBack: () => void;
    goForward: () => void;
    goUp: () => void;
    setFiles: (files: FileEntry[]) => void;
    toggleSelection: (path: string, exclusive?: boolean, range?: boolean, orderedPaths?: string[]) => void;
    clearSelection: () => void;
    selectAll: () => void;
    invertSelection: () => void;
    setFocusedIndex: (index: number) => void;
    setClipboard: (clipboard: { files: string[], operation: 'copy' | 'cut' } | null) => void;
    triggerRename: () => void;

    setViewMode: (mode: ViewMode) => void;
    setSortParams: (column: SortColumn, desc?: boolean) => void;
    toggleDetailsPane: () => void;
    setSearchQuery: (query: string) => void;
    setLoading: (loading: boolean) => void;
}

const createNewTab = (id: string, path: string = ''): Tab => {
    return {
        id,
        currentPath: path,
        history: path ? [path] : [],
        historyIndex: path ? 0 : -1,
        files: [],
        selectedFiles: new Set(),
        focusedIndex: -1,
        viewMode: 'detail',
        sortBy: 'name',
        sortDesc: false,
        searchQuery: '', // Added searchQuery
    };
};

export const useAppStore = create<AppState>((set) => ({
    tabs: [createNewTab('default-tab')],
    activeTabId: 'default-tab',
    clipboard: null,
    renameTriggerId: 0,
    showDetailsPane: false,
    loading: false,

    addTab: (path) => set((state) => {
        const id = `tab-${Date.now()}`;
        const targetPath = path !== undefined ? path : (state.tabs.find(t => t.id === state.activeTabId)?.currentPath || '');
        const newTab = createNewTab(id, targetPath);
        return {
            tabs: [...state.tabs, newTab],
            activeTabId: id
        };
    }),

    closeTab: (id) => set((state) => {
        if (state.tabs.length <= 1) return state; // Prevent closing last tab
        const newTabs = state.tabs.filter(t => t.id !== id);
        let newActiveId = state.activeTabId;
        if (state.activeTabId === id) {
            newActiveId = newTabs[newTabs.length - 1].id;
        }
        return { tabs: newTabs, activeTabId: newActiveId };
    }),

    setActiveTab: (id) => set({ activeTabId: id }),

    setCurrentPath: (path) => set((state) => {
        const tabs = state.tabs.map(tab => {
            if (tab.id !== state.activeTabId) return tab;
            const newHistory = tab.history.slice(0, tab.historyIndex + 1);
            newHistory.push(path);
            return {
                ...tab,
                currentPath: path,
                history: newHistory,
                historyIndex: newHistory.length - 1,
                selectedFiles: new Set<string>(),
                focusedIndex: -1,
                searchQuery: '', // Clear search query on path change
            };
        });
        return { tabs };
    }),

    goBack: () => set((state) => {
        const tabs = state.tabs.map(tab => {
            if (tab.id !== state.activeTabId || tab.historyIndex <= 0) return tab;
            return {
                ...tab,
                historyIndex: tab.historyIndex - 1,
                currentPath: tab.history[tab.historyIndex - 1],
                selectedFiles: new Set<string>(),
                focusedIndex: -1,
                searchQuery: '', // Clear search query on navigation
            };
        });
        return { tabs };
    }),

    goForward: () => set((state) => {
        const tabs = state.tabs.map(tab => {
            if (tab.id !== state.activeTabId || tab.historyIndex >= tab.history.length - 1) return tab;
            return {
                ...tab,
                historyIndex: tab.historyIndex + 1,
                currentPath: tab.history[tab.historyIndex + 1],
                selectedFiles: new Set<string>(),
                focusedIndex: -1,
                searchQuery: '', // Clear search query on navigation
            };
        });
        return { tabs };
    }),

    goUp: () => set((state) => {
        const tabs = state.tabs.map(tab => {
            if (tab.id !== state.activeTabId) return tab;
            const parts = tab.currentPath.split(/[/\\]/).filter(Boolean);
            if (parts.length > 1) {
                parts.pop();
                const parent = tab.currentPath.startsWith('/') ? '/' + parts.join('/') : parts.join('\\');
                const newHistory = tab.history.slice(0, tab.historyIndex + 1);
                newHistory.push(parent);
                return {
                    ...tab,
                    currentPath: parent,
                    history: newHistory,
                    historyIndex: newHistory.length - 1,
                    selectedFiles: new Set<string>(),
                    focusedIndex: -1,
                    searchQuery: '', // Clear search query on navigation
                };
            }
            return tab;
        });
        return { tabs };
    }),

    setFiles: (files) => set((state) => {
        const tabs = state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, files } : tab);
        return { tabs };
    }),

    toggleSelection: (path, exclusive = false, range = false, orderedPaths = undefined) => set((state) => {
        const tabs = state.tabs.map(tab => {
            if (tab.id !== state.activeTabId) return tab;
            let newSelected = new Set(tab.selectedFiles);

            if (exclusive) {
                newSelected.clear();
                newSelected.add(path);
            } else if (range) {
                if (tab.selectedFiles.size > 0 && tab.files.length > 0) {
                    const paths = orderedPaths || tab.files.map(f => f.path);
                    const lastSelectedArray = Array.from(tab.selectedFiles);
                    const lastSelected = lastSelectedArray[lastSelectedArray.length - 1];

                    const startIdx = paths.indexOf(lastSelected);
                    const endIdx = paths.indexOf(path);

                    if (startIdx !== -1 && endIdx !== -1) {
                        const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
                        for (let i = min; i <= max; i++) {
                            newSelected.add(paths[i]);
                        }
                    } else {
                        newSelected.add(path);
                    }
                } else {
                    newSelected.add(path);
                }
            } else {
                if (newSelected.has(path)) {
                    newSelected.delete(path);
                } else {
                    newSelected.add(path);
                }
            }
            return { ...tab, selectedFiles: newSelected };
        });
        return { tabs };
    }),

    clearSelection: () => set((state) => {
        const tabs = state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, selectedFiles: new Set<string>() } : tab);
        return { tabs };
    }),

    selectAll: () => set((state) => {
        const tabs = state.tabs.map(tab => {
            if (tab.id !== state.activeTabId) return tab;
            return { ...tab, selectedFiles: new Set(tab.files.map(f => f.path)) };
        });
        return { tabs };
    }),

    invertSelection: () => set((state) => {
        const tabs = state.tabs.map(tab => {
            if (tab.id !== state.activeTabId) return tab;
            const newSelected = new Set(tab.files.map(f => f.path));
            tab.selectedFiles.forEach(path => newSelected.delete(path)); // remove currently selected
            return { ...tab, selectedFiles: newSelected };
        });
        return { tabs };
    }),

    setFocusedIndex: (index) => set((state) => {
        const tabs = state.tabs.map(tab => {
            if (tab.id !== state.activeTabId) return tab;
            return { ...tab, focusedIndex: index };
        });
        return { tabs };
    }),

    setClipboard: (clipboard) => set({ clipboard }),

    triggerRename: () => set(state => ({ renameTriggerId: state.renameTriggerId + 1 })),

    setViewMode: (mode) => set((state) => {
        const tabs = state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, viewMode: mode } : tab);
        return { tabs };
    }),

    setSortParams: (column, desc) => set((state) => {
        const tabs = state.tabs.map(tab => {
            if (tab.id === state.activeTabId) {
                const newDesc = desc !== undefined ? desc : (tab.sortBy === column ? !tab.sortDesc : false);
                return { ...tab, sortBy: column, sortDesc: newDesc };
            }
            return tab;
        });
        return { tabs };
    }),

    toggleDetailsPane: () => set(state => ({ showDetailsPane: !state.showDetailsPane })),

    setSearchQuery: (query) => set((state) => {
        const tabs = state.tabs.map(tab => {
            if (tab.id === state.activeTabId) {
                return { ...tab, searchQuery: query };
            }
            return tab;
        });
        return { tabs };
    }),

    setLoading: (loading) => set({ loading }),
}));
