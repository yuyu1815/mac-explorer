import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Tab, AppState } from '@/types';

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
    showHiddenFiles: false,
    showFileExtensions: true,
    showItemCheckBoxes: false,
    openPropertiesWindows: new Map<string, string>(),
    overwriteConfirm: null,
    extractPrompt: null,
    trashConfirm: null,

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
                const hasFocused = tab.focusedIndex >= 0 && tab.focusedIndex < paths.length;
                const anchorPath = hasFocused ? paths[tab.focusedIndex] : Array.from(tab.selectedFiles)[0];
                const start = paths.indexOf(anchorPath);
                const end = paths.indexOf(path);

                if (start !== -1 && end !== -1) {
                    const [min, max] = [Math.min(start, end), Math.max(start, end)];
                    for (let i = min; i <= max; i++) newSelected.add(paths[i]);
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

            const newFocusedIndex = orderedPaths ? orderedPaths.indexOf(path) : -1;
            return { ...tab, selectedFiles: newSelected, focusedIndex: newFocusedIndex !== -1 ? newFocusedIndex : tab.focusedIndex };
        })
    })),

    clearSelection: () => set((state) => ({
        tabs: state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, selectedFiles: new Set() } : tab)
    })),

    setSelectedFiles: (paths: Set<string>) => set((state) => ({
        tabs: state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, selectedFiles: paths } : tab)
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

    openPropertiesDialog: async (path) => {
        if (!path) return;

        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const { getCurrentWindow } = await import('@tauri-apps/api/window');

        // 既に開いている場合はフォーカスを移動
        const existingLabel = useAppStore.getState().openPropertiesWindows.get(path);
        if (existingLabel) {
            const existingWindow = await WebviewWindow.getByLabel(existingLabel);
            if (existingWindow) {
                await existingWindow.setFocus();
                await existingWindow.unminimize();
                return;
            }
            // ウィンドウが見つからない場合はマップから削除
            useAppStore.getState().openPropertiesWindows.delete(path);
        }

        const label = `properties-${Date.now()}`;
        const queryParams = new URLSearchParams({
            window: 'properties',
            path: path,
        });

        // メインウィンドウの中心に表示
        const mainWindow = getCurrentWindow();
        const [pos, size, factor] = await Promise.all([
            mainWindow.innerPosition(),
            mainWindow.innerSize(),
            mainWindow.scaleFactor()
        ]);

        const winWidth = 420;
        const winHeight = 550;
        const x = Math.round((pos.x / factor) + ((size.width / factor) - winWidth) / 2);
        const y = Math.round((pos.y / factor) + ((size.height / factor) - winHeight) / 2);

        const win = new WebviewWindow(label, {
            url: `/?${queryParams.toString()}`,
            title: 'プロパティ',
            width: winWidth,
            height: winHeight,
            x,
            y,
            resizable: false,
            maximizable: false,
            decorations: false,
            transparent: true,
        });

        // ウィンドウを追跡に追加
        useAppStore.getState().openPropertiesWindows.set(path, label);

        // ウィンドウが閉じられたらマップから削除
        win.once('tauri://closed', () => {
            useAppStore.getState().openPropertiesWindows.delete(path);
        });
    },

    openLocationNotAvailableDialog: async (path) => {
        if (!path) return;

        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const { getCurrentWindow } = await import('@tauri-apps/api/window');

        const label = `location-error-${Date.now()}`;
        const queryParams = new URLSearchParams({
            window: 'location-error',
            path: path,
        });

        // メインウィンドウの中心に表示
        const mainWindow = getCurrentWindow();
        const [pos, size, factor] = await Promise.all([
            mainWindow.innerPosition(),
            mainWindow.innerSize(),
            mainWindow.scaleFactor()
        ]);

        const winWidth = 500;
        const winHeight = 320;
        const x = Math.round((pos.x / factor) + ((size.width / factor) - winWidth) / 2);
        const y = Math.round((pos.y / factor) + ((size.height / factor) - winHeight) / 2);

        const win = new WebviewWindow(label, {
            url: `/?${queryParams.toString()}`,
            title: '場所が利用できません',
            width: winWidth,
            height: winHeight,
            x,
            y,
            resizable: false,
            maximizable: false,
            decorations: false,
            transparent: true,
        });

        await win.once('tauri://error', (e: any) => {
            console.error('Failed to create location error window', e);
        });
    },

    setShowHiddenFiles: (show) => set({ showHiddenFiles: show }),
    setShowFileExtensions: (show) => set({ showFileExtensions: show }),
    setShowItemCheckBoxes: (show) => set({ showItemCheckBoxes: show }),

    confirmOverwrite: (targetFile) => {
        return new Promise<boolean>((resolve) => {
            set({ overwriteConfirm: { targetFile, resolve } });
        });
    },

    resolveOverwrite: (overwrite) => set((state) => {
        if (state.overwriteConfirm?.resolve) {
            state.overwriteConfirm.resolve(overwrite);
        }
        return { overwriteConfirm: null };
    }),

    promptExtract: (sourcePath, defaultDestPath) => {
        return new Promise<any>((resolve) => {
            set({ extractPrompt: { sourcePath, destPath: defaultDestPath, showFiles: true, resolve } });
        });
    },

    resolveExtract: (result) => set((state) => {
        if (state.extractPrompt?.resolve) {
            state.extractPrompt.resolve(result);
        }
        return { extractPrompt: null };
    }),

    confirmTrash: (itemCount, permanent) => {
        return new Promise<boolean>((resolve) => {
            set({ trashConfirm: { itemCount, permanent, resolve } });
        });
    },

    resolveTrash: (confirmed) => set((state) => {
        if (state.trashConfirm?.resolve) {
            state.trashConfirm.resolve(confirmed);
        }
        return { trashConfirm: null };
    }),
}));

