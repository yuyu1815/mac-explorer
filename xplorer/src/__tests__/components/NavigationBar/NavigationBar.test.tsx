/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationBar } from '../../../components/NavigationBar/NavigationBar';
import { useAppStore } from '../../../stores/appStore';

// Tauri APIモック
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

describe('NavigationBar Component', () => {
    beforeEach(() => {
        useAppStore.setState({
            tabs: [{
                id: 'tab1',
                currentPath: '/Users/test/Documents',
                history: ['/Users', '/Users/test', '/Users/test/Documents'],
                historyIndex: 2,
                files: [],
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

    it('renders breadcrumbs correctly based on currentPath', () => {
        render(<NavigationBar />);

        expect(screen.getByText('Users')).toBeInTheDocument();
        expect(screen.getByText('test')).toBeInTheDocument();
        expect(screen.getByText('Documents')).toBeInTheDocument();
    });

    it('switches to input mode when breadcrumb container is clicked', () => {
        render(<NavigationBar />);

        // inputに最も近いdiv要素など（実質パンくずコンテナ全体）を探してクリック
        const documentsBreadcrumb = screen.getByText('Documents');
        // パンくずコンテナ（onClickを持つdiv）を取得するための上位探索
        const breadcrumbContainer = documentsBreadcrumb.closest('.win10-address-bar');

        if (breadcrumbContainer) {
            fireEvent.click(breadcrumbContainer);
        }

        // inputが表示され、パスが入っているはず
        const input = screen.getByDisplayValue('/Users/test/Documents');
        expect(input).toBeInTheDocument();
    });

    it('handles goBack and goForward buttons correctly', () => {
        useAppStore.setState({
            tabs: [{
                id: 'tab1',
                currentPath: '/Users/test',
                history: ['/Users', '/Users/test', '/Users/test/Documents'],
                historyIndex: 1, // mid-history
                files: [],
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

        render(<NavigationBar />);

        // ボタンの取得 (↑, ←, →, ↻ の順序などで探索されるが、RoleやIndexで探す)
        const buttons = screen.getAllByRole('button');
        const backBtn = buttons[0]; // ArrowLeft
        const forwardBtn = buttons[1]; // ArrowRight

        expect(backBtn).not.toBeDisabled();
        expect(forwardBtn).not.toBeDisabled();

        // 実行してストアの状態が変わるか
        fireEvent.click(backBtn);
        expect(useAppStore.getState().tabs[0].historyIndex).toBe(0);

        fireEvent.click(forwardBtn);
        expect(useAppStore.getState().tabs[0].historyIndex).toBe(1);
    });
});
