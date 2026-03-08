import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppStore } from '@/stores/appStore';
import { StatusBar } from '@/components/layout/StatusBar';

const createTestState = (overrides: Partial<{
    files: any[];
    selectedFiles: Set<string>;
}> = {}) => ({
    tabs: [{
        id: 'test-tab',
        currentPath: '/test',
        history: ['/test'],
        historyIndex: 0,
        files: overrides.files || [],
        selectedFiles: overrides.selectedFiles || new Set<string>(),
        focusedIndex: -1,
        viewMode: 'detail' as const,
        sortBy: 'name' as const,
        sortDesc: false,
        searchQuery: ''
    }],
    activeTabId: 'test-tab',
    clipboard: null
});

describe('StatusBar', () => {
    beforeEach(() => {
        useAppStore.setState(createTestState());
    });

    it('should display total item count', () => {
        // Arrange
        useAppStore.setState(createTestState({
            files: [
                { path: '/test/a.txt', name: 'a.txt', is_dir: false, size: 100, size_formatted: '100 B', modified: 0, modified_formatted: '', created: 0, created_formatted: '', file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '', icon_id: '' },
                { path: '/test/b', name: 'b', is_dir: true, size: 0, size_formatted: '', modified: 0, modified_formatted: '', created: 0, created_formatted: '', file_type: '', is_hidden: false, is_symlink: false, permissions: '', icon_id: '' },
                { path: '/test/c.txt', name: 'c.txt', is_dir: false, size: 200, size_formatted: '200 B', modified: 0, modified_formatted: '', created: 0, created_formatted: '', file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '', icon_id: '' }
            ]
        }));

        // Act
        render(<StatusBar />);

        // Assert
        expect(screen.getByTestId('statusbar')).toHaveTextContent('3 個の項目');
    });

    it('should display zero items for empty folder', () => {
        // Arrange - default state has no files

        // Act
        render(<StatusBar />);

        // Assert
        expect(screen.getByTestId('statusbar')).toHaveTextContent('0 個の項目');
    });

    it('should display selected file count and size', () => {
        // Arrange
        useAppStore.setState(createTestState({
            files: [
                { path: '/test/a.txt', name: 'a.txt', is_dir: false, size: 1024, size_formatted: '1 KB', modified: 0, modified_formatted: '', created: 0, created_formatted: '', file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '', icon_id: '' },
                { path: '/test/b.txt', name: 'b.txt', is_dir: false, size: 2048, size_formatted: '2 KB', modified: 0, modified_formatted: '', created: 0, created_formatted: '', file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '', icon_id: '' }
            ],
            selectedFiles: new Set(['/test/a.txt', '/test/b.txt'])
        }));

        // Act
        render(<StatusBar />);

        // Assert
        const statusBar = screen.getByTestId('statusbar');
        expect(statusBar).toHaveTextContent('2 個の項目を選択');
        expect(statusBar).toHaveTextContent('3 KB');
    });

    it('should exclude directory size from selection total', () => {
        // Arrange
        useAppStore.setState(createTestState({
            files: [
                { path: '/test/dir', name: 'dir', is_dir: true, size: 4096, size_formatted: '4 KB', modified: 0, modified_formatted: '', created: 0, created_formatted: '', file_type: '', is_hidden: false, is_symlink: false, permissions: '', icon_id: '' },
                { path: '/test/file.txt', name: 'file.txt', is_dir: false, size: 512, size_formatted: '512 B', modified: 0, modified_formatted: '', created: 0, created_formatted: '', file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '', icon_id: '' }
            ],
            selectedFiles: new Set(['/test/dir', '/test/file.txt'])
        }));

        // Act
        render(<StatusBar />);

        // Assert
        const statusBar = screen.getByTestId('statusbar');
        expect(statusBar).toHaveTextContent('2 個の項目を選択');
        expect(statusBar).toHaveTextContent('512 B');
    });

    it('should not show size when only directories are selected', () => {
        // Arrange
        useAppStore.setState(createTestState({
            files: [
                { path: '/test/dir', name: 'dir', is_dir: true, size: 4096, size_formatted: '4 KB', modified: 0, modified_formatted: '', created: 0, created_formatted: '', file_type: '', is_hidden: false, is_symlink: false, permissions: '', icon_id: '' }
            ],
            selectedFiles: new Set(['/test/dir'])
        }));

        // Act
        render(<StatusBar />);

        // Assert
        const statusBar = screen.getByTestId('statusbar');
        expect(statusBar).toHaveTextContent('1 個の項目を選択');
        expect(statusBar.textContent).not.toContain('B');
    });
});
