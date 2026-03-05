/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationBar } from '../../components/NavigationBar';
import { useAppStore } from '../../stores/appStore';

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
        // Arrange
        render(<NavigationBar />);

        // Act - component renders on mount

        // Assert
        expect(screen.getByText('Users')).toBeInTheDocument();
        expect(screen.getByText('test')).toBeInTheDocument();
        expect(screen.getByText('Documents')).toBeInTheDocument();
    });

    it('switches to input mode when breadcrumb container is clicked', () => {
        // Arrange
        render(<NavigationBar />);
        const documentsBreadcrumb = screen.getByText('Documents');
        const breadcrumbContainer = documentsBreadcrumb.closest('.win10-address-bar');

        // Act
        if (breadcrumbContainer) {
            fireEvent.click(breadcrumbContainer);
        }

        // Assert
        const input = screen.getByDisplayValue('/Users/test/Documents');
        expect(input).toBeInTheDocument();
    });

    it('handles goBack and goForward buttons correctly', () => {
        // Arrange
        useAppStore.setState({
            tabs: [{
                id: 'tab1',
                currentPath: '/Users/test',
                history: ['/Users', '/Users/test', '/Users/test/Documents'],
                historyIndex: 1,
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
        const buttons = screen.getAllByRole('button');
        const backBtn = buttons[0];
        const forwardBtn = buttons[1];

        // Assert initial state
        expect(backBtn).not.toBeDisabled();
        expect(forwardBtn).not.toBeDisabled();

        // Act - click back
        fireEvent.click(backBtn);

        // Assert
        expect(useAppStore.getState().tabs[0].historyIndex).toBe(0);

        // Act - click forward
        fireEvent.click(forwardBtn);

        // Assert
        expect(useAppStore.getState().tabs[0].historyIndex).toBe(1);
    });
});
