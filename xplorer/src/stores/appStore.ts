import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    size: number;
    size_formatted: string;
    modified: number;
    modified_formatted: string;
    created: number;
    created_formatted: string;
    file_type: string;
    is_hidden: boolean;
    is_symlink: boolean;
    permissions: string;
    icon_id: string;
}

export type ViewMode = 'extra_large_icon' | 'large_icon' | 'medium_icon' | 'small_icon' | 'list' | 'detail' | 'tiles' | 'content';
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
    propertiesDialogTarget: string | null;
    showHiddenFiles: boolean;
    showFileExtensions: boolean;
    showItemCheckBoxes: boolean;

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
    openPropertiesDialog: (path: string | null) => void;
    setShowHiddenFiles: (show: boolean) => void;
    setShowFileExtensions: (show: boolean) => void;
    setShowItemCheckBoxes: (show: boolean) => void;
}

const createNewTab = (id: string, path: string = ''): Tab => ({
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
    searchQuery: '',
});

export const useAppStore = create<AppState>((set) => ({
    tabs: [createNewTab('default-tab')],
    activeTabId: 'default-tab',
    clipboard: null,
    renameTriggerId: 0,
    showDetailsPane: false,
    loading: false,
    propertiesDialogTarget: null,
    showHiddenFiles: false,
    showFileExtensions: true,
    showItemCheckBoxes: false,

    addTab: (path) => set((state) => {
        const id = `tab-${Date.now()}`;
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        const targetPath = path ?? activeTab?.currentPath ?? '';
        return { tabs: [...state.tabs, createNewTab(id, targetPath)], activeTabId: id };
    }),

    closeTab: (id) => set((state) => {
        if (state.tabs.length <= 1) return state;
        const newTabs = state.tabs.filter(t => t.id !== id);
        const activeTabId = state.activeTabId === id ? newTabs[newTabs.length - 1].id : state.activeTabId;
        return { tabs: newTabs, activeTabId };
    }),

    setActiveTab: (id) => set({ activeTabId: id }),

    setCurrentPath: (path) => set((state) => ({
        tabs: state.tabs.map(tab => {
            if (tab.id !== state.activeTabId) return tab;
            const newHistory = [...tab.history.slice(0, tab.historyIndex + 1), path];
            return {
                ...tab,
                currentPath: path,
                history: newHistory,
                historyIndex: newHistory.length - 1,
                selectedFiles: new Set(),
                focusedIndex: -1,
                searchQuery: '',
            };
        })
    })),

    goBack: () => set((state) => ({
        tabs: state.tabs.map(tab => {
            if (tab.id !== state.activeTabId || tab.historyIndex <= 0) return tab;
            return {
                ...tab,
                historyIndex: tab.historyIndex - 1,
                currentPath: tab.history[tab.historyIndex - 1],
                selectedFiles: new Set(),
                focusedIndex: -1,
                searchQuery: '',
            };
        })
    })),

    goForward: () => set((state) => ({
        tabs: state.tabs.map(tab => {
            if (tab.id !== state.activeTabId || tab.historyIndex >= tab.history.length - 1) return tab;
            return {
                ...tab,
                historyIndex: tab.historyIndex + 1,
                currentPath: tab.history[tab.historyIndex + 1],
                selectedFiles: new Set(),
                focusedIndex: -1,
                searchQuery: '',
            };
        })
    })),

    goUp: async () => {
        const { tabs, activeTabId } = useAppStore.getState();
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (!activeTab) return;

        const parent = await invoke<string>('get_parent_path', { path: activeTab.currentPath });
        if (parent && parent !== activeTab.currentPath) {
            useAppStore.getState().setCurrentPath(parent);
        }
    },

    setFiles: (files) => set((state) => ({
        tabs: state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, files } : tab)
    })),

    toggleSelection: (path, exclusive, range, orderedPaths) => set((state) => ({
        tabs: state.tabs.map(tab => {
            if (tab.id !== state.activeTabId) return tab;
            const newSelected = new Set(exclusive ? [] : tab.selectedFiles);

            if (range && tab.selectedFiles.size > 0) {
                const paths = orderedPaths ?? tab.files.map(f => f.path);
                const start = paths.indexOf(Array.from(tab.selectedFiles).pop()!);
                const end = paths.indexOf(path);
                const [min, max] = [Math.min(start, end), Math.max(start, end)];
                for (let i = min; i <= max; i++) newSelected.add(paths[i]);
            } else {
                newSelected.has(path) ? newSelected.delete(path) : newSelected.add(path);
            }
            return { ...tab, selectedFiles: newSelected };
        })
    })),

    clearSelection: () => set((state) => ({
        tabs: state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, selectedFiles: new Set() } : tab)
    })),

    selectAll: () => set((state) => ({
        tabs: state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, selectedFiles: new Set(tab.files.map(f => f.path)) } : tab)
    })),

    invertSelection: () => set((state) => ({
        tabs: state.tabs.map(tab => {
            if (tab.id !== state.activeTabId) return tab;
            const newSelected = new Set(tab.files.map(f => f.path));
            tab.selectedFiles.forEach(p => newSelected.delete(p));
            return { ...tab, selectedFiles: newSelected };
        })
    })),

    setFocusedIndex: (index) => set((state) => ({
        tabs: state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, focusedIndex: index } : tab)
    })),

    setClipboard: (clipboard) => set({ clipboard }),
    triggerRename: () => set(state => ({ renameTriggerId: state.renameTriggerId + 1 })),
    setViewMode: (mode) => set((state) => ({
        tabs: state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, viewMode: mode } : tab)
    })),

    setSortParams: (column, desc) => set((state) => ({
        tabs: state.tabs.map(tab => {
            if (tab.id !== state.activeTabId) return tab;
            const sortDesc = desc ?? (tab.sortBy === column ? !tab.sortDesc : false);
            return { ...tab, sortBy: column, sortDesc };
        })
    })),

    toggleDetailsPane: () => set(state => ({ showDetailsPane: !state.showDetailsPane })),
    setSearchQuery: (query) => set((state) => ({
        tabs: state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, searchQuery: query } : tab)
    })),
    setLoading: (loading) => set({ loading }),
    openPropertiesDialog: (path) => set({ propertiesDialogTarget: path }),
    setShowHiddenFiles: (show) => set({ showHiddenFiles: show }),
    setShowFileExtensions: (show) => set({ showFileExtensions: show }),
    setShowItemCheckBoxes: (show) => set({ showItemCheckBoxes: show }),
}));
