import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../stores/appStore';

// Mock tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(async (cmd, args) => {
        if (cmd === 'get_parent_path') {
            const p = args.path as string;
            if (p === '/') return '/';
            const parts = p.split('/').filter(Boolean);
            if (parts.length <= 1) return '/';
            return '/' + parts.slice(0, -1).join('/');
        }
        return '';
    })
}));

describe('AppStore - Tab Management', () => {
    beforeEach(() => {
        useAppStore.setState({
            tabs: [{
                id: 'default-tab',
                currentPath: '',
                history: [],
                historyIndex: -1,
                files: [],
                selectedFiles: new Set(),
                focusedIndex: -1,
                viewMode: 'detail',
                sortBy: 'name',
                sortDesc: false,
                searchQuery: ''
            }],
            activeTabId: 'default-tab'
        });
    });

    it('should add a new tab', () => {
        // Arrange
        const store = useAppStore.getState();

        // Act
        store.addTab('/test');

        // Assert
        expect(useAppStore.getState().tabs.length).toBe(2);
        expect(useAppStore.getState().tabs[1].currentPath).toBe('/test');
    });

    it('should switch active tab', () => {
        // Arrange
        const store = useAppStore.getState();
        store.addTab('/test');
        const newTabId = useAppStore.getState().tabs[1].id;

        // Act
        store.setActiveTab(newTabId);

        // Assert
        expect(useAppStore.getState().activeTabId).toBe(newTabId);
    });

    it('should close a tab', () => {
        // Arrange
        const store = useAppStore.getState();
        store.addTab('/test');
        const idToClose = useAppStore.getState().tabs[0].id;

        // Act
        store.closeTab(idToClose);

        // Assert
        expect(useAppStore.getState().tabs.length).toBe(1);
        expect(useAppStore.getState().tabs[0].currentPath).toBe('/test');
    });
});

describe('AppStore - Navigation', () => {
    beforeEach(() => {
        useAppStore.setState({
            tabs: [{
                id: 'tab1',
                currentPath: '/',
                history: ['/'],
                historyIndex: 0,
                files: [],
                selectedFiles: new Set(),
                focusedIndex: -1,
                viewMode: 'detail',
                sortBy: 'name',
                sortDesc: false,
                searchQuery: ''
            }],
            activeTabId: 'tab1'
        });
    });

    it('should update path and history', () => {
        // Arrange
        const store = useAppStore.getState();

        // Act
        store.setCurrentPath('/users');

        // Assert
        const activeTab = useAppStore.getState().tabs[0];
        expect(activeTab.currentPath).toBe('/users');
        expect(activeTab.history).toContain('/users');
        expect(activeTab.historyIndex).toBe(1);
    });

    it('should go back and forward', () => {
        // Arrange
        const store = useAppStore.getState();
        store.setCurrentPath('/a');
        store.setCurrentPath('/b');

        // Act
        store.goBack();

        // Assert
        expect(useAppStore.getState().tabs[0].currentPath).toBe('/a');

        // Act
        store.goForward();

        // Assert
        expect(useAppStore.getState().tabs[0].currentPath).toBe('/b');
    });

    it('should go up to parent directory', async () => {
        // Arrange
        const store = useAppStore.getState();
        store.setCurrentPath('/parent/child');

        // Act
        await store.goUp();

        // Assert
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
                    { path: '/f1.txt', name: 'f1.txt', is_dir: false, size: 0, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '', size_formatted: '0 B', modified_formatted: '2024/01/01 12:00', created_formatted: '2024/01/01 12:00', icon_id: '' },
                    { path: '/f2.txt', name: 'f2.txt', is_dir: false, size: 0, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '', size_formatted: '0 B', modified_formatted: '2024/01/01 12:00', created_formatted: '2024/01/01 12:00', icon_id: '' },
                    { path: '/f3.txt', name: 'f3.txt', is_dir: false, size: 0, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '', size_formatted: '0 B', modified_formatted: '2024/01/01 12:00', created_formatted: '2024/01/01 12:00', icon_id: '' }
                ],
                selectedFiles: new Set(),
                focusedIndex: -1,
                viewMode: 'detail',
                sortBy: 'name',
                sortDesc: false,
                searchQuery: ''
            }],
            activeTabId: 'tab1',
            clipboard: null
        });
    });

    it('should toggle selection', () => {
        // Arrange
        const store = useAppStore.getState();

        // Act
        store.toggleSelection('/f1.txt', true, false, ['/f1.txt', '/f2.txt', '/f3.txt']);

        // Assert
        expect(useAppStore.getState().tabs[0].selectedFiles.has('/f1.txt')).toBe(true);

        // Act
        store.toggleSelection('/f1.txt', false, false, ['/f1.txt', '/f2.txt', '/f3.txt']);

        // Assert
        expect(useAppStore.getState().tabs[0].selectedFiles.has('/f1.txt')).toBe(false);
    });

    it('should select all', () => {
        // Arrange
        const store = useAppStore.getState();

        // Act
        store.selectAll();

        // Assert
        expect(useAppStore.getState().tabs[0].selectedFiles.size).toBe(3);
    });

    it('should clear selection', () => {
        // Arrange
        const store = useAppStore.getState();
        store.selectAll();

        // Act
        store.clearSelection();

        // Assert
        expect(useAppStore.getState().tabs[0].selectedFiles.size).toBe(0);
    });

    it('should set clipboard', () => {
        // Arrange
        const store = useAppStore.getState();
        const clip = { files: ['/f1.txt'], operation: 'copy' as const };

        // Act
        store.setClipboard(clip);

        // Assert
        expect(useAppStore.getState().clipboard).toEqual(clip);
    });
});
