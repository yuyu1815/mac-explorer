/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from './Toolbar';
import { useAppStore } from '../../stores/appStore';

// Tauri APIをモック
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

describe('Toolbar Component', () => {
    beforeEach(() => {
        // Zustand ストアとアクティブなタブの状態をリセット
        useAppStore.setState({
            tabs: [{
                id: 'tab1',
                currentPath: '/test/path',
                history: ['/test/path'],
                historyIndex: 0,
                files: [
                    { path: '/f1.txt', name: 'f1.txt', is_dir: false, size: 0, modified: 0, created: 0, file_type: '', is_hidden: false, is_symlink: false, permissions: '' }
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

    it('disables cut, copy, delete when no files are selected', () => {
        render(<Toolbar />);

        // 選択ファイルがない状態
        const cutBtn = screen.getByText('切り取り').closest('button');
        const copyBtn = screen.getByText('コピー').closest('button');
        const deleteBtn = screen.getByText('削除').closest('button');

        expect(cutBtn).toBeDisabled();
        expect(copyBtn).toBeDisabled();
        expect(deleteBtn).toBeDisabled();
    });

    it('enables cut, copy, delete when files are selected', () => {
        const store = useAppStore.getState();
        store.toggleSelection('/f1.txt', true, false);

        render(<Toolbar />);

        const cutBtn = screen.getByText('切り取り').closest('button');
        const copyBtn = screen.getByText('コピー').closest('button');
        const deleteBtn = screen.getByText('削除').closest('button');

        expect(cutBtn).not.toBeDisabled();
        expect(copyBtn).not.toBeDisabled();
        expect(deleteBtn).not.toBeDisabled();
    });

    it('changes view mode in store when clicked', () => {
        render(<Toolbar />);

        const detailBtn = screen.getByTitle('詳細');
        const listBtn = screen.getByTitle('リスト');
        const iconBtn = screen.getByTitle('アイコン');

        fireEvent.click(listBtn);
        expect(useAppStore.getState().tabs[0].viewMode).toBe('list');

        fireEvent.click(iconBtn);
        expect(useAppStore.getState().tabs[0].viewMode).toBe('icon');

        fireEvent.click(detailBtn);
        expect(useAppStore.getState().tabs[0].viewMode).toBe('detail');
    });
});
