import { FileEntry, ViewMode, SortColumn } from './file-system';

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

export interface AppState {
    tabs: Tab[];
    activeTabId: string;
    clipboard: { files: string[]; operation: 'copy' | 'cut' } | null;
    renameTriggerId: number;
    showDetailsPane: boolean;
    loading: boolean;
    showHiddenFiles: boolean;
    showFileExtensions: boolean;
    showItemCheckBoxes: boolean;
    overwriteConfirm: {
        targetFile: string;
        resolve: (overwrite: boolean) => void;
    } | null;
    extractPrompt: {
        sourcePath: string;
        destPath: string;
        showFiles: boolean;
        resolve: (result: { destPath: string; showFiles: boolean } | null) => void;
    } | null;

    // Actions
    addTab: (path?: string) => void;
    closeTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    setCurrentPath: (path: string) => void;
    goBack: () => void;
    goForward: () => void;
    goUp: () => void;
    setFiles: (files: FileEntry[]) => void;
    toggleSelection: (path: string, exclusive: boolean, range?: boolean, orderedPaths?: string[]) => void;
    clearSelection: () => void;
    selectAll: () => void;
    invertSelection: () => void;
    setFocusedIndex: (index: number) => void;
    setClipboard: (clipboard: { files: string[]; operation: 'copy' | 'cut' } | null) => void;
    triggerRename: () => void;
    setViewMode: (mode: ViewMode) => void;
    setSortParams: (column: SortColumn, desc: boolean) => void;
    setSelectedFiles: (paths: Set<string>) => void;
    toggleDetailsPane: () => void;
    setSearchQuery: (query: string) => void;
    setLoading: (loading: boolean) => void;
    openPropertiesDialog: (path: string) => Promise<void>;
    setShowHiddenFiles: (show: boolean) => void;
    setShowFileExtensions: (show: boolean) => void;
    setShowItemCheckBoxes: (show: boolean) => void;
    confirmOverwrite: (targetFile: string) => Promise<boolean>;
    resolveOverwrite: (overwrite: boolean) => void;
    promptExtract: (sourcePath: string, defaultDestPath: string) => Promise<{ destPath: string; showFiles: boolean } | null>;
    resolveExtract: (result: { destPath: string; showFiles: boolean } | null) => void;
}
