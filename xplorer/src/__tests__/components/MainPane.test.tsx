import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MainPane } from '../../components/MainPane';
import { useAppStore } from '../../stores/appStore';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

const createFile = (overrides: Partial<{ path: string, name: string, is_dir: boolean, size: number, modified: number, file_type: string, icon_id: string }> = {}) => ({
    path: '/tmp/test/file.txt',
    name: 'file.txt',
    is_dir: false,
    size: 100,
    modified: 1700000000,
    created: 0,
    file_type: 'txt',
    is_hidden: false,
    is_symlink: false,
    permissions: '',
    icon_id: '',
    ...overrides,
});

const basePath = '/tmp/test-project';

const defaultFiles = [
    createFile({ path: `${basePath}/file1.txt`, name: 'file1.txt', size: 100, file_type: 'txt' }),
    createFile({ path: `${basePath}/src`, name: 'src', is_dir: true, size: 0, file_type: 'folder' }),
];

const setupStore = (overrides: Record<string, unknown> = {}) => {
    useAppStore.setState({
        tabs: [{
            id: 'tab1',
            currentPath: basePath,
            history: [basePath],
            historyIndex: 0,
            files: [],
            selectedFiles: new Set<string>(),
            focusedIndex: -1,
            viewMode: 'detail' as const,
            sortBy: 'name' as const,
            sortDesc: false,
            searchQuery: '',
        }],
        activeTabId: 'tab1',
        clipboard: null,
        ...overrides,
    });
};

const mockInvoke = (fileList = defaultFiles) => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'list_files_sorted') return fileList;
        return null;
    });
};

describe('MainPane — マウント・描画', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupStore();
        mockInvoke();
    });

    it('マウント時に list_directory が呼ばれ、ファイル一覧がDOMに描画される', async () => {
        // Arrange
        render(<MainPane />);

        // Act & Assert
        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('list_files_sorted', { path: basePath, showHidden: false, sortBy: 'name', sortDesc: false, searchQuery: '' });
        });
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
        expect(screen.getByText('src')).toBeInTheDocument();
    });

    it('ファイル0件の場合「空のフォルダーです。」が表示される', async () => {
        // Arrange
        mockInvoke([]);
        render(<MainPane />);

        // Act & Assert
        await waitFor(() => {
            expect(screen.getByText('このフォルダーは空です。')).toBeInTheDocument();
        });
    });
});

describe('MainPane — ダブルクリック操作', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupStore();
        mockInvoke();
    });

    it('フォルダをダブルクリックするとパスが遷移する', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument());
        const srcRow = screen.getByText('src').closest('tr')!;

        // Act
        await act(async () => {
            fireEvent.doubleClick(srcRow);
        });

        // Assert
        const tab = useAppStore.getState().tabs[0];
        expect(tab.currentPath).toBe(`${basePath}/src`);
    });

    it('ファイルをダブルクリックすると open_file_default が呼ばれる', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const fileRow = screen.getByText('file1.txt').closest('tr')!;

        // Act
        await act(async () => {
            fireEvent.doubleClick(fileRow);
        });

        // Assert
        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('open_file_default', { path: `${basePath}/file1.txt` });
        });
    });
});

describe('MainPane — 選択操作とUI反映', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupStore();
        mockInvoke();
    });

    it('ファイルをクリックすると選択状態になり、背景色が変わる', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const row = screen.getByText('file1.txt').closest('tr')!;

        // Act
        await act(async () => {
            fireEvent.click(row);
        });

        // Assert
        expect(useAppStore.getState().tabs[0].selectedFiles.has(`${basePath}/file1.txt`)).toBe(true);
        expect(row.classList.contains('selected')).toBe(true);
    });

    it('Ctrl/Meta+クリックで複数選択できる', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1Row = screen.getByText('file1.txt').closest('tr')!;
        const srcRow = screen.getByText('src').closest('tr')!;

        // Act
        await act(async () => {
            fireEvent.click(file1Row);
            fireEvent.click(srcRow, { ctrlKey: true });
        });

        // Assert
        const selected = useAppStore.getState().tabs[0].selectedFiles;
        expect(selected.size).toBe(2);
        expect(selected.has(`${basePath}/file1.txt`)).toBe(true);
        expect(selected.has(`${basePath}/src`)).toBe(true);
    });

    it('背景クリックで選択がクリアされる', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const row = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.click(row);
        });
        expect(useAppStore.getState().tabs[0].selectedFiles.size).toBe(1);
        const container = row.closest('div[tabindex="0"]')!;

        // Act
        await act(async () => {
            fireEvent.click(container);
        });

        // Assert
        expect(useAppStore.getState().tabs[0].selectedFiles.size).toBe(0);
    });
});

describe('MainPane — インラインリネーム', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupStore();
        mockInvoke();
    });

    it('F2キーでリネーム用inputが表示される', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.click(file1);
        });
        const container = file1.closest('div[tabIndex="0"]')!;

        // Act
        await act(async () => {
            fireEvent.keyDown(container, { key: 'F2' });
        });

        // Assert
        const input = screen.getByTestId('rename-input') as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe('file1.txt');
    });

    it('Enterでリネームが確定され、rename_file が呼ばれる', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.click(file1);
        });
        const container = file1.closest('div[tabIndex="0"]')!;
        await act(async () => {
            fireEvent.keyDown(container, { key: 'F2' });
        });
        const input = screen.getByTestId('rename-input');

        // Act
        await act(async () => {
            fireEvent.change(input, { target: { value: 'renamed.txt' } });
            fireEvent.keyDown(input, { key: 'Enter' });
        });

        // Assert
        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('rename_file', {
                path: `${basePath}/file1.txt`,
                newName: 'renamed.txt',
            });
        });
        expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
    });

    it('Escapeでリネームがキャンセルされ、rename_file は呼ばれない', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.click(file1);
        });
        const container = file1.closest('div[tabIndex="0"]')!;
        await act(async () => {
            fireEvent.keyDown(container, { key: 'F2' });
        });
        const input = screen.getByTestId('rename-input');

        // Act
        await act(async () => {
            fireEvent.change(input, { target: { value: 'something.txt' } });
            fireEvent.keyDown(input, { key: 'Escape' });
        });

        // Assert
        expect(invoke).not.toHaveBeenCalledWith('rename_file', expect.anything());
        expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
    });

    it('元の名前と同じ場合はrename_fileが呼ばれない', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.click(file1);
        });
        const container = file1.closest('div[tabIndex="0"]')!;
        await act(async () => {
            fireEvent.keyDown(container, { key: 'F2' });
        });
        const input = screen.getByTestId('rename-input');

        // Act
        await act(async () => {
            fireEvent.keyDown(input, { key: 'Enter' });
        });

        // Assert
        expect(invoke).not.toHaveBeenCalledWith('rename_file', expect.anything());
    });

    it('未選択状態ではF2キーは何もしない', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const container = screen.getByText('file1.txt').closest('div[tabIndex="0"]')!;

        // Act
        await act(async () => {
            fireEvent.keyDown(container, { key: 'F2' });
        });

        // Assert
        expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
    });

    it('禁則文字（/ :）がリネーム入力からフィルタされ、警告が表示される', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.click(file1);
        });
        const container = file1.closest('div[tabIndex="0"]')!;
        await act(async () => {
            fireEvent.keyDown(container, { key: 'F2' });
        });
        const input = screen.getByTestId('rename-input');

        // Act
        await act(async () => {
            fireEvent.change(input, { target: { value: 'test/file:name.txt' } });
        });

        // Assert
        expect((input as HTMLInputElement).value).toBe('testfilename.txt');
        expect(screen.getByTestId('rename-warning')).toHaveTextContent('ファイル名には / \\ : * ? " < > | は使えません');
    });
});

describe('MainPane — コンテキストメニュー操作', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(window, 'confirm').mockImplementation(() => true);
        setupStore();
        mockInvoke();
    });

    it('コンテキストメニューの名前変更でインライン編集が始まる', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.click(file1);
            fireEvent.contextMenu(file1);
        });

        // Act
        await act(async () => {
            fireEvent.click(screen.getByText(/名前の変更/));
        });

        // Assert
        const input = screen.getByTestId('rename-input') as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe('file1.txt');
    });

    it('新規フォルダー作成後にインライン編集モードに入る', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const container = screen.getByText('file1.txt').closest('table')!.parentElement!;
        await act(async () => {
            fireEvent.contextMenu(container);
        });

        // Act
        await act(async () => {
            fireEvent.click(screen.getByText('フォルダー(F)'));
        });

        // Assert
        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('create_directory', { path: `${basePath}/新しいフォルダー` });
        });
    });

    it('削除後に一覧が再取得される', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.contextMenu(file1);
        });

        // Act
        await act(async () => {
            fireEvent.click(screen.getByText(/削除/));
        });

        // Assert
        expect(window.confirm).toHaveBeenCalled();
        expect(invoke).toHaveBeenCalledWith('delete_files', expect.objectContaining({ toTrash: true }));
        await waitFor(() => {
            const calls = vi.mocked(invoke).mock.calls.filter(c => c[0] === 'list_files_sorted');
            expect(calls.length).toBeGreaterThanOrEqual(2);
        });
    });

    it('コピー→貼り付け後に一覧が再取得される', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.contextMenu(file1);
        });

        // Act
        await act(async () => {
            fireEvent.click(screen.getByText('コピー(C)'));
        });

        // Assert
        expect(useAppStore.getState().clipboard).toEqual({
            files: [`${basePath}/file1.txt`],
            operation: 'copy',
        });

        // Act
        const container = screen.getByText('file1.txt').closest('table')!.parentElement!;
        await act(async () => {
            fireEvent.contextMenu(container);
            fireEvent.click(screen.getByText(/貼り付け/));
        });

        // Assert
        expect(invoke).toHaveBeenCalledWith('copy_files', {
            sources: [`${basePath}/file1.txt`],
            dest: basePath,
        });
    });

    it('切り取り→貼り付け後にクリップボードがクリアされる', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.contextMenu(file1);
        });

        // Act
        await act(async () => {
            fireEvent.click(screen.getByText(/切り取り/));
        });

        // Assert
        expect(useAppStore.getState().clipboard?.operation).toBe('cut');

        // Act
        await act(async () => {
            useAppStore.getState().setCurrentPath(`${basePath}/src`);
        });
        const container = screen.getByText('file1.txt').closest('table')!.parentElement!;
        await act(async () => {
            fireEvent.contextMenu(container);
            fireEvent.click(screen.getByText(/貼り付け/));
        });

        // Assert
        expect(invoke).toHaveBeenCalledWith('move_files', {
            sources: [`${basePath}/file1.txt`],
            dest: `${basePath}/src`,
        });
        await waitFor(() => {
            expect(useAppStore.getState().clipboard).toBeNull();
        });
    });
});

describe('MainPane — キーボード操作', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(window, 'confirm').mockImplementation(() => true);
        setupStore();
        mockInvoke();
    });

    it('Deleteキーで選択ファイルが削除される', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.click(file1);
        });
        const container = file1.closest('div[tabIndex="0"]')!;

        // Act
        await act(async () => {
            fireEvent.keyDown(container, { key: 'Delete' });
        });

        // Assert
        expect(window.confirm).toHaveBeenCalled();
        expect(invoke).toHaveBeenCalledWith('delete_files', {
            paths: [`${basePath}/file1.txt`],
            toTrash: true,
        });
    });

    it('未選択状態ではDeleteキーは何もしない', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const container = screen.getByText('file1.txt').closest('div[tabIndex="0"]')!;

        // Act
        await act(async () => {
            fireEvent.keyDown(container, { key: 'Delete' });
        });

        // Assert
        expect(window.confirm).not.toHaveBeenCalled();
    });
});

describe('MainPane — キャンセル操作', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupStore();
        mockInvoke();
    });

    it('confirmでキャンセルすると delete_files が呼ばれない', async () => {
        // Arrange
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const file1 = screen.getByText('file1.txt').closest('tr')!;
        await act(async () => {
            fireEvent.click(file1);
        });
        const container = file1.closest('div[tabIndex="0"]')!;

        // Act
        await act(async () => {
            fireEvent.keyDown(container, { key: 'Delete' });
        });

        // Assert
        expect(window.confirm).toHaveBeenCalled();
        expect(invoke).not.toHaveBeenCalledWith('delete_files', expect.anything());
    });
});

describe('MainPane — ソート', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupStore();
        mockInvoke();
    });

    it('名前ヘッダークリックでソートが切り替わる', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const nameHeader = screen.getByText('名前').closest('th')!;

        // Act
        await act(async () => {
            fireEvent.click(nameHeader);
        });

        // Assert
        expect(useAppStore.getState().tabs[0].sortBy).toBe('name');
        expect(useAppStore.getState().tabs[0].sortDesc).toBe(true);

        // Act
        await act(async () => {
            fireEvent.click(nameHeader);
        });

        // Assert
        expect(useAppStore.getState().tabs[0].sortDesc).toBe(false);
    });

    it('別カラムのヘッダークリックでソート列が切り替わる', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const sizeHeader = screen.getByText('サイズ').closest('th')!;

        // Act
        await act(async () => {
            fireEvent.click(sizeHeader);
        });

        // Assert
        expect(useAppStore.getState().tabs[0].sortBy).toBe('size');
    });
});

describe('MainPane — タブ操作', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupStore();
        mockInvoke();
    });

    it('同一パスで新規タブを追加しても、ファイル一覧が再取得される', async () => {
        // Arrange
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());
        const callsBefore = vi.mocked(invoke).mock.calls.filter(c => c[0] === 'list_files_sorted').length;

        // Act
        await act(async () => {
            useAppStore.getState().addTab(basePath);
        });

        // Assert
        await waitFor(() => {
            const callsAfter = vi.mocked(invoke).mock.calls.filter(c => c[0] === 'list_files_sorted').length;
            expect(callsAfter).toBeGreaterThan(callsBefore);
        });
    });

    it('タブ切替時にファイル一覧が再取得される', async () => {
        // Arrange
        await act(async () => {
            useAppStore.getState().addTab('/another/path');
        });
        const tab2Id = useAppStore.getState().activeTabId;
        const tab1Id = useAppStore.getState().tabs[0].id;
        await act(async () => {
            useAppStore.getState().setActiveTab(tab1Id);
        });
        render(<MainPane />);
        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('list_files_sorted', { path: basePath, showHidden: false, sortBy: 'name', sortDesc: false, searchQuery: '' });
        });
        const callsBefore = vi.mocked(invoke).mock.calls.filter(c => c[0] === 'list_files_sorted').length;

        // Act
        await act(async () => {
            useAppStore.getState().setActiveTab(tab2Id);
        });

        // Assert
        await waitFor(() => {
            const callsAfter = vi.mocked(invoke).mock.calls.filter(c => c[0] === 'list_files_sorted').length;
            expect(callsAfter).toBeGreaterThan(callsBefore);
        });
    });
});

describe('MainPane — エラーハンドリング', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupStore();
    });

    it('list_directory が失敗してもクラッシュしない', async () => {
        // Arrange
        vi.mocked(invoke).mockRejectedValue(new Error('Permission denied'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Act & Assert
        expect(() => render(<MainPane />)).not.toThrow();
        await waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith('Failed to list_files_sorted', expect.any(Error));
        });

        consoleSpy.mockRestore();
    });
});
