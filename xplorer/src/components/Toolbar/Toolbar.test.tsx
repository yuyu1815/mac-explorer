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
                sortDesc: false,
                focusedIndex: -1
            }],
            activeTabId: 'tab1',
            clipboard: null
        });
    });

    it('disables cut, copy, delete when no files are selected', () => {
        render(<Toolbar />);

        // 選択ファイルがない状態
        const cutBtn = screen.getByText('切り取り').closest('.ribbon-btn');
        const copyBtn = screen.getByText('コピー').closest('.ribbon-btn');
        const deleteBtn = screen.getByText('削除').closest('.ribbon-btn');

        expect(cutBtn).toHaveClass('disabled');
        expect(copyBtn).toHaveClass('disabled');
        expect(deleteBtn).toHaveClass('disabled');
    });

    it('enables cut, copy, delete when files are selected', () => {
        const store = useAppStore.getState();
        store.toggleSelection('/f1.txt', true, false);

        render(<Toolbar />);

        const cutBtn = screen.getByText('切り取り').closest('.ribbon-btn');
        const copyBtn = screen.getByText('コピー').closest('.ribbon-btn');
        const deleteBtn = screen.getByText('削除').closest('.ribbon-btn');

        expect(cutBtn).not.toHaveClass('disabled');
        expect(copyBtn).not.toHaveClass('disabled');
        expect(deleteBtn).not.toHaveClass('disabled');
    });

    it('changes view mode in store when clicked', () => {
        render(<Toolbar />);

        const viewTab = screen.getByText('表示');
        fireEvent.click(viewTab);

        const detailBtn = screen.getByText('詳細').closest('.ribbon-btn')!;
        const listBtn = screen.getByText('リスト').closest('.ribbon-btn')!;
        const iconBtn = screen.getByText('特大アイコン').closest('.ribbon-btn')!;

        fireEvent.click(listBtn);
        expect(useAppStore.getState().tabs[0].viewMode).toBe('list');

        fireEvent.click(iconBtn);
        expect(useAppStore.getState().tabs[0].viewMode).toBe('icon');

        fireEvent.click(detailBtn);
        expect(useAppStore.getState().tabs[0].viewMode).toBe('detail');
    });
});
