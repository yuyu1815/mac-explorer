import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './appStore';

describe('AppStore - Tab Management', () => {
    beforeEach(() => {
        // Zustand store reset helper or manual reset
        const store = useAppStore.getState();
        // Force reset to initial state
        useAppStore.setState({
            tabs: [{
                id: 'default-tab',
                currentPath: '',
                history: [],
                historyIndex: -1,
                files: [],
                selectedFiles: new Set(),
                viewMode: 'detail',
                sortBy: 'name',
                sortDesc: false
            }],
            activeTabId: 'default-tab',
            clipboard: null
        });
    });

    it('should initialize with one default tab', () => {
        const state = useAppStore.getState();
        expect(state.tabs.length).toBe(1);
        expect(state.activeTabId).toBe('default-tab');
    });

    it('should add a new tab and set it as active', () => {
        useAppStore.getState().addTab('/new/path');
        const state = useAppStore.getState();

        expect(state.tabs.length).toBe(2);
        expect(state.activeTabId).not.toBe('default-tab');

        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        expect(activeTab?.currentPath).toBe('/new/path');
        expect(activeTab?.history).toEqual(['/new/path']);
    });

    it('should close a tab and fallback to another tab', () => {
        const store = useAppStore.getState();
        store.addTab('/second/path');

        let state = useAppStore.getState();
        const secondTabId = state.activeTabId;

        // Close the newly added active tab
        store.closeTab(secondTabId);

        state = useAppStore.getState();
        expect(state.tabs.length).toBe(1);
        expect(state.activeTabId).toBe('default-tab');
    });

    it('should not close the last remaining tab', () => {
        const store = useAppStore.getState();
        store.closeTab('default-tab');

        const state = useAppStore.getState();
        expect(state.tabs.length).toBe(1);
    });
});

describe('AppStore - Navigation History', () => {
    beforeEach(() => {
        useAppStore.setState({
            tabs: [{
                id: 'test-tab',
                currentPath: '/start',
                history: ['/start'],
                historyIndex: 0,
                files: [],
                selectedFiles: new Set(),
                viewMode: 'detail',
                sortBy: 'name',
                sortDesc: false
            }],
            activeTabId: 'test-tab',
            clipboard: null
        });
    });

    it('should append new path to history when setCurrentPath is called', () => {
        useAppStore.getState().setCurrentPath('/next/path');
        const activeTab = useAppStore.getState().tabs[0];

        expect(activeTab.currentPath).toBe('/next/path');
        expect(activeTab.history).toEqual(['/start', '/next/path']);
        expect(activeTab.historyIndex).toBe(1);
    });

    it('should go back in history', () => {
        const store = useAppStore.getState();
        store.setCurrentPath('/second');
        store.setCurrentPath('/third');

        store.goBack();

        const activeTab = useAppStore.getState().tabs[0];
        expect(activeTab.currentPath).toBe('/second');
        expect(activeTab.historyIndex).toBe(1);
        expect(activeTab.history.length).toBe(3); // History is preserved
    });

    it('should go forward in history', () => {
        const store = useAppStore.getState();
        store.setCurrentPath('/second');
        store.goBack(); // Now at /start

        store.goForward(); // Should go back to /second

        const activeTab = useAppStore.getState().tabs[0];
        expect(activeTab.currentPath).toBe('/second');
        expect(activeTab.historyIndex).toBe(1);
    });

    it('should go up to parent directory', () => {
        const store = useAppStore.getState();
        store.setCurrentPath('/parent/child');

        store.goUp();

        const activeTab = useAppStore.getState().tabs[0];
        expect(activeTab.currentPath).toBe('/parent');
    });
});

describe('AppStore - Selection and Clipboard', () => {
    beforeEach(() => {
        useAppStore.setState({
            tabs: [{
                id: 'tab1',
                currentPath: '/',
                history: ['/'],
                historyIndex: 0,
                files: [
                    { path: '/f1.txt', name: 'f1.txt', is_dir: false, size: 0, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '' },
                    { path: '/f2.txt', name: 'f2.txt', is_dir: false, size: 0, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '' },
                    { path: '/f3.txt', name: 'f3.txt', is_dir: false, size: 0, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '' }
                ],
                selectedFiles: new Set(),
                viewMode: 'detail',
                sortBy: 'name',
                sortDesc: false
            }],
            activeTabId: 'tab1',
            clipboard: null
        });
    });

    it('should toggle selection for a single file', () => {
        const store = useAppStore.getState();

        // toggle on
        store.toggleSelection('/f1.txt', true, false);
        expect(useAppStore.getState().tabs[0].selectedFiles.has('/f1.txt')).toBe(true);
        expect(useAppStore.getState().tabs[0].selectedFiles.size).toBe(1);

        // toggle off
        store.toggleSelection('/f1.txt', false, false);
        expect(useAppStore.getState().tabs[0].selectedFiles.has('/f1.txt')).toBe(false);
    });

    it('should clear selection when navigating', () => {
        const store = useAppStore.getState();
        store.toggleSelection('/f1.txt', true, false);
        expect(useAppStore.getState().tabs[0].selectedFiles.size).toBe(1);

        store.setCurrentPath('/new-dir');
        expect(useAppStore.getState().tabs[0].selectedFiles.size).toBe(0);
    });

    it('should set clipboard data', () => {
        const store = useAppStore.getState();
        store.setClipboard({ files: ['/f1.txt'], operation: 'copy' });

        expect(useAppStore.getState().clipboard).toEqual({ files: ['/f1.txt'], operation: 'copy' });
    });
});
