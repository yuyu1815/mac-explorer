import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppStore } from '../../stores/appStore';
import { StatusBar } from './StatusBar';

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
        sortDesc: false
    }],
    activeTabId: 'test-tab',
    clipboard: null
});

describe('StatusBar', () => {
    beforeEach(() => {
        useAppStore.setState(createTestState());
    });

    it('should display total item count', () => {
        useAppStore.setState(createTestState({
            files: [
                { path: '/test/a.txt', name: 'a.txt', is_dir: false, size: 100, modified: 0, created: 0, file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '' },
                { path: '/test/b', name: 'b', is_dir: true, size: 0, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '' },
                { path: '/test/c.txt', name: 'c.txt', is_dir: false, size: 200, modified: 0, created: 0, file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '' }
            ]
        }));

        render(<StatusBar />);
        expect(screen.getByTestId('statusbar-total')).toHaveTextContent('3 個の項目');
    });

    it('should display zero items for empty folder', () => {
        render(<StatusBar />);
        expect(screen.getByTestId('statusbar-total')).toHaveTextContent('0 個の項目');
    });

    it('should display selected file count and size', () => {
        useAppStore.setState(createTestState({
            files: [
                { path: '/test/a.txt', name: 'a.txt', is_dir: false, size: 1024, modified: 0, created: 0, file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '' },
                { path: '/test/b.txt', name: 'b.txt', is_dir: false, size: 2048, modified: 0, created: 0, file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '' }
            ],
            selectedFiles: new Set(['/test/a.txt', '/test/b.txt'])
        }));

        render(<StatusBar />);
        const selectionInfo = screen.getByTestId('statusbar-selection');
        expect(selectionInfo).toHaveTextContent('2 個の項目を選択');
        expect(selectionInfo).toHaveTextContent('3.0 KB');
    });

    it('should exclude directory size from selection total', () => {
        useAppStore.setState(createTestState({
            files: [
                { path: '/test/dir', name: 'dir', is_dir: true, size: 4096, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '' },
                { path: '/test/file.txt', name: 'file.txt', is_dir: false, size: 512, modified: 0, created: 0, file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '' }
            ],
            selectedFiles: new Set(['/test/dir', '/test/file.txt'])
        }));

        render(<StatusBar />);
        const selectionInfo = screen.getByTestId('statusbar-selection');
        expect(selectionInfo).toHaveTextContent('2 個の項目を選択');
        expect(selectionInfo).toHaveTextContent('512 B');
    });

    it('should not show size when only directories are selected', () => {
        useAppStore.setState(createTestState({
            files: [
                { path: '/test/dir', name: 'dir', is_dir: true, size: 4096, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '' }
            ],
            selectedFiles: new Set(['/test/dir'])
        }));

        render(<StatusBar />);
        const selectionInfo = screen.getByTestId('statusbar-selection');
        expect(selectionInfo).toHaveTextContent('1 個の項目を選択');
        // ディレクトリだけ選択 → サイズは表示しない
        expect(selectionInfo.textContent).not.toContain('B');
    });
});
