/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from '../../components/layout/Toolbar';
import { useAppStore } from '../../stores/appStore';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

describe('Toolbar Component', () => {
    beforeEach(() => {
        useAppStore.setState({
            tabs: [{
                id: 'tab1',
                currentPath: '/test/path',
                history: ['/test/path'],
                historyIndex: 0,
                files: [
                    { path: '/f1.txt', name: 'f1.txt', is_dir: false, size: 0, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '', size_formatted: '0 B', modified_formatted: '2024/01/01 12:00', created_formatted: '2024/01/01 12:00', icon_id: '' }
                ],
                selectedFiles: new Set(),
                viewMode: 'detail',
                sortBy: 'name',
                sortDesc: false,
                focusedIndex: -1,
                searchQuery: ''
            }],
            activeTabId: 'tab1',
            clipboard: null
        });
    });

    it('disables cut, copy, delete when no files are selected', () => {
        // Arrange
        render(<Toolbar />);

        // Act
        const cutBtn = screen.getByText('切り取り').closest('.ribbon-btn');
        const copyBtn = screen.getByText('コピー').closest('.ribbon-btn');
        const deleteBtn = screen.getByText('削除').closest('.ribbon-btn');

        // Assert
        expect(cutBtn).toHaveClass('disabled');
        expect(copyBtn).toHaveClass('disabled');
        expect(deleteBtn).toHaveClass('disabled');
    });

    it('enables cut, copy, delete when files are selected', () => {
        // Arrange
        useAppStore.getState().toggleSelection('/f1.txt', true, false, ['/f1.txt']);
        render(<Toolbar />);

        // Act
        const cutBtn = screen.getByText('切り取り').closest('.ribbon-btn');
        const copyBtn = screen.getByText('コピー').closest('.ribbon-btn');
        const deleteBtn = screen.getByText('削除').closest('.ribbon-btn');

        // Assert
        expect(cutBtn).not.toHaveClass('disabled');
        expect(copyBtn).not.toHaveClass('disabled');
        expect(deleteBtn).not.toHaveClass('disabled');
    });

    it('changes view mode in store when clicked', () => {
        // Arrange
        render(<Toolbar />);
        fireEvent.click(screen.getByText('表示'));

        // Act
        const listBtn = screen.getByText('一覧').closest('.ribbon-btn')!;
        const iconBtn = screen.getByText('特大アイコン').closest('.ribbon-btn')!;
        const detailBtn = screen.getByText('詳細').closest('.ribbon-btn')!;

        fireEvent.click(listBtn);

        // Assert
        expect(useAppStore.getState().tabs[0].viewMode).toBe('list');

        // Act
        fireEvent.click(iconBtn);

        // Assert
        expect(useAppStore.getState().tabs[0].viewMode).toBe('extra_large_icon');

        // Act
        fireEvent.click(detailBtn);

        // Assert
        expect(useAppStore.getState().tabs[0].viewMode).toBe('detail');
    });
});
