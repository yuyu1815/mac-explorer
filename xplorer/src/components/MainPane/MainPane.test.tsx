import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MainPane } from './MainPane';
import { useAppStore } from '../../stores/appStore';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

const createFile = (overrides: Partial<{ path: string, name: string, is_dir: boolean, size: number, modified: number, file_type: string }> = {}) => ({
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
        }],
        activeTabId: 'tab1',
        clipboard: null,
        ...overrides,
    });
};

const mockInvoke = (fileList = defaultFiles) => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === 'list_directory') return fileList;
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
        render(<MainPane />);

        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('list_directory', { path: basePath, showHidden: false });
        });

        expect(screen.getByText('file1.txt')).toBeInTheDocument();
        expect(screen.getByText('src')).toBeInTheDocument();
    });

    it('ファイル0件の場合「空のフォルダーです。」が表示される', async () => {
        mockInvoke([]);
        render(<MainPane />);

        await waitFor(() => {
            expect(screen.getByText('空のフォルダーです。')).toBeInTheDocument();
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
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument());

        const srcRow = screen.getByText('src').closest('tr')!;
        fireEvent.doubleClick(srcRow);

        const tab = useAppStore.getState().tabs[0];
        expect(tab.currentPath).toBe(`${basePath}/src`);
    });

    it('ファイルをダブルクリックすると open_file_default が呼ばれる', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const fileRow = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.doubleClick(fileRow);

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
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const row = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.click(row);

        expect(useAppStore.getState().tabs[0].selectedFiles.has(`${basePath}/file1.txt`)).toBe(true);
        expect(row.classList.contains('selected')).toBe(true);
    });

    it('Ctrl/Meta+クリックで複数選択できる', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1Row = screen.getByText('file1.txt').closest('tr')!;
        const srcRow = screen.getByText('src').closest('tr')!;

        fireEvent.click(file1Row);
        fireEvent.click(srcRow, { ctrlKey: true });

        const selected = useAppStore.getState().tabs[0].selectedFiles;
        expect(selected.size).toBe(2);
        expect(selected.has(`${basePath}/file1.txt`)).toBe(true);
        expect(selected.has(`${basePath}/src`)).toBe(true);
    });

    it('背景クリックで選択がクリアされる', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const row = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.click(row);
        expect(useAppStore.getState().tabs[0].selectedFiles.size).toBe(1);

        const container = row.closest('div[tabindex="0"]')!;
        fireEvent.click(container);

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
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1 = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.click(file1);

        const container = file1.closest('div[tabIndex="0"]')!;
        fireEvent.keyDown(container, { key: 'F2' });

        // inputが表示され、ファイル名がプリセットされている
        const input = screen.getByTestId('rename-input') as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe('file1.txt');
    });

    it('Enterでリネームが確定され、rename_file が呼ばれる', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1 = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.click(file1);

        const container = file1.closest('div[tabIndex="0"]')!;
        fireEvent.keyDown(container, { key: 'F2' });

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'renamed.txt' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('rename_file', {
                path: `${basePath}/file1.txt`,
                newName: 'renamed.txt',
            });
        });

        // inputが消えている
        expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
    });

    it('Escapeでリネームがキャンセルされ、rename_file は呼ばれない', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1 = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.click(file1);

        const container = file1.closest('div[tabIndex="0"]')!;
        fireEvent.keyDown(container, { key: 'F2' });

        const input = screen.getByTestId('rename-input');
        fireEvent.change(input, { target: { value: 'something.txt' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(invoke).not.toHaveBeenCalledWith('rename_file', expect.anything());
        expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
    });

    it('元の名前と同じ場合はrename_fileが呼ばれない', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1 = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.click(file1);

        const container = file1.closest('div[tabIndex="0"]')!;
        fireEvent.keyDown(container, { key: 'F2' });

        const input = screen.getByTestId('rename-input');
        // 名前を変更せずにEnter
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(invoke).not.toHaveBeenCalledWith('rename_file', expect.anything());
    });

    it('未選択状態ではF2キーは何もしない', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const container = screen.getByText('file1.txt').closest('div[tabIndex="0"]')!;
        fireEvent.keyDown(container, { key: 'F2' });

        expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
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
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1 = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.click(file1);
        fireEvent.contextMenu(file1);

        fireEvent.click(screen.getByText(/名前変更/));

        const input = screen.getByTestId('rename-input') as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe('file1.txt');
    });

    it('新規フォルダー作成後にインライン編集モードに入る', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const container = screen.getByText('file1.txt').closest('table')!.parentElement!;
        fireEvent.contextMenu(container);
        fireEvent.click(screen.getByText('📁 新規フォルダー'));

        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('create_directory', { path: `${basePath}/新しいフォルダー` });
        });
    });

    it('削除後に一覧が再取得される', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1 = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.contextMenu(file1);
        fireEvent.click(screen.getByText(/削除/));

        expect(window.confirm).toHaveBeenCalled();
        expect(invoke).toHaveBeenCalledWith('delete_files', expect.objectContaining({ toTrash: true }));

        await waitFor(() => {
            const calls = vi.mocked(invoke).mock.calls.filter(c => c[0] === 'list_directory');
            expect(calls.length).toBeGreaterThanOrEqual(2);
        });
    });

    it('コピー→貼り付け後に一覧が再取得される', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1 = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.contextMenu(file1);
        fireEvent.click(screen.getByText(/コピー/));

        expect(useAppStore.getState().clipboard).toEqual({
            files: [`${basePath}/file1.txt`],
            operation: 'copy',
        });

        const container = screen.getByText('file1.txt').closest('table')!.parentElement!;
        fireEvent.contextMenu(container);
        fireEvent.click(screen.getByText(/📋 貼り付け/));

        expect(invoke).toHaveBeenCalledWith('copy_files', {
            sources: [`${basePath}/file1.txt`],
            dest: basePath,
        });
    });

    it('切り取り→貼り付け後にクリップボードがクリアされる', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1 = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.contextMenu(file1);
        fireEvent.click(screen.getByText(/切り取り/));

        expect(useAppStore.getState().clipboard?.operation).toBe('cut');

        useAppStore.getState().setCurrentPath(`${basePath}/src`);

        const container = screen.getByText('file1.txt').closest('table')!.parentElement!;
        fireEvent.contextMenu(container);
        fireEvent.click(screen.getByText(/📋 貼り付け/));

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
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1 = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.click(file1);

        const container = file1.closest('div[tabIndex="0"]')!;
        fireEvent.keyDown(container, { key: 'Delete' });

        expect(window.confirm).toHaveBeenCalled();
        expect(invoke).toHaveBeenCalledWith('delete_files', {
            paths: [`${basePath}/file1.txt`],
            toTrash: true,
        });
    });

    it('未選択状態ではDeleteキーは何もしない', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const container = screen.getByText('file1.txt').closest('div[tabIndex="0"]')!;
        fireEvent.keyDown(container, { key: 'Delete' });

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
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const file1 = screen.getByText('file1.txt').closest('tr')!;
        fireEvent.click(file1);

        const container = file1.closest('div[tabIndex="0"]')!;
        fireEvent.keyDown(container, { key: 'Delete' });

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
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const nameHeader = screen.getByText('名前').closest('th')!;

        fireEvent.click(nameHeader);
        expect(useAppStore.getState().tabs[0].sortBy).toBe('name');
        expect(useAppStore.getState().tabs[0].sortDesc).toBe(true);

        fireEvent.click(nameHeader);
        expect(useAppStore.getState().tabs[0].sortDesc).toBe(false);
    });

    it('別カラムのヘッダークリックでソート列が切り替わる', async () => {
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const sizeHeader = screen.getByText('サイズ').closest('th')!;
        fireEvent.click(sizeHeader);

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
        render(<MainPane />);
        await waitFor(() => expect(screen.getByText('file1.txt')).toBeInTheDocument());

        const callsBefore = vi.mocked(invoke).mock.calls.filter(c => c[0] === 'list_directory').length;

        useAppStore.getState().addTab(basePath);

        await waitFor(() => {
            const callsAfter = vi.mocked(invoke).mock.calls.filter(c => c[0] === 'list_directory').length;
            expect(callsAfter).toBeGreaterThan(callsBefore);
        });
    });

    it('タブ切替時にファイル一覧が再取得される', async () => {
        useAppStore.getState().addTab('/another/path');
        const tab2Id = useAppStore.getState().activeTabId;
        const tab1Id = useAppStore.getState().tabs[0].id;
        useAppStore.getState().setActiveTab(tab1Id);

        render(<MainPane />);
        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('list_directory', { path: basePath, showHidden: false });
        });

        const callsBefore = vi.mocked(invoke).mock.calls.filter(c => c[0] === 'list_directory').length;

        useAppStore.getState().setActiveTab(tab2Id);

        await waitFor(() => {
            const callsAfter = vi.mocked(invoke).mock.calls.filter(c => c[0] === 'list_directory').length;
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
        vi.mocked(invoke).mockRejectedValue(new Error('Permission denied'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(() => render(<MainPane />)).not.toThrow();

        await waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith('Failed to list directory', expect.any(Error));
        });

        consoleSpy.mockRestore();
    });
});
