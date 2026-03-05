import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContextMenu } from '../../components/ContextMenu';
import { useAppStore } from '../../stores/appStore';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

const basePath = '/tmp/test-project';

const setupStore = (overrides: Record<string, unknown> = {}) => {
    useAppStore.setState({
        tabs: [{
            id: 'tab1',
            currentPath: basePath,
            history: [basePath],
            historyIndex: 0,
            searchQuery: '',
            files: [
                { path: `${basePath}/file1.txt`, name: 'file1.txt', is_dir: false, size: 100, modified: 0, created: 0, file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '', size_formatted: '100 B', modified_formatted: '2024/01/01 12:00', created_formatted: '2024/01/01 12:00', icon_id: '' },
                { path: `${basePath}/file2.txt`, name: 'file2.txt', is_dir: false, size: 200, modified: 0, created: 0, file_type: 'txt', is_hidden: false, is_symlink: false, permissions: '', size_formatted: '200 B', modified_formatted: '2024/01/01 12:00', created_formatted: '2024/01/01 12:00', icon_id: '' },
            ],
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

const defaultProps = {
    x: 100,
    y: 100,
    onClose: vi.fn(),
    onStartRename: vi.fn(),
    onCreateFolder: vi.fn(),
};

describe('ContextMenu — 空白右クリック（targetPath=null）', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(invoke).mockResolvedValue([]);
        setupStore();
        defaultProps.onClose = vi.fn();
        defaultProps.onStartRename = vi.fn();
        defaultProps.onCreateFolder = vi.fn();
    });

    it('「表示」「並び替え」「最新の情報に更新」等が表示される', () => {
        // Arrange
        render(<ContextMenu {...defaultProps} targetPath={null} />);

        // Act - component renders on mount

        // Assert
        expect(screen.getByText('表示(V) ▸')).toBeInTheDocument();
        expect(screen.getByText('並べ替え(O) ▸')).toBeInTheDocument();
        expect(screen.getByText(/最新の情報/)).toBeInTheDocument();
        expect(screen.getByText(/貼り付け/)).toBeInTheDocument();
        expect(screen.getByText(/新規作成/)).toBeInTheDocument();
        expect(screen.queryByText(/切り取り/)).not.toBeInTheDocument();
        expect(screen.queryByText(/コピー/)).not.toBeInTheDocument();
        expect(screen.queryByText(/名前の変更/)).not.toBeInTheDocument();
    });

    it('clipboard=null のとき「貼り付け」は半透明（opacity: 0.5）', () => {
        // Arrange
        render(<ContextMenu {...defaultProps} targetPath={null} />);

        // Act
        const pasteItem = screen.getByText('貼り付け(P)').parentElement as HTMLElement;

        // Assert
        expect(pasteItem.classList.contains('disabled')).toBe(true);
    });

    it('clipboardにデータがあるとき「貼り付け」は有効（opacity: 1）', () => {
        // Arrange
        setupStore({ clipboard: { files: [`${basePath}/file1.txt`], operation: 'copy' } });
        render(<ContextMenu {...defaultProps} targetPath={null} />);

        // Act
        const pasteItem = screen.getByText('貼り付け(P)').parentElement as HTMLElement;

        // Assert
        expect(pasteItem.classList.contains('disabled')).toBe(false);
    });

    it('新規作成の下層にあるフォルダをクリックすると onCreateFolder が呼ばれる', async () => {
        // Arrange
        render(<ContextMenu {...defaultProps} targetPath={null} />);

        // Act
        fireEvent.click(screen.getByText('フォルダー(F)'));

        // Assert
        await waitFor(() => {
            expect(defaultProps.onCreateFolder).toHaveBeenCalled();
        });
    });
});

describe('ContextMenu — ファイル右クリック（targetPath指定）', () => {
    const targetFile = `${basePath}/file1.txt`;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(invoke).mockResolvedValue([]);
        setupStore();
        defaultProps.onClose = vi.fn();
        defaultProps.onStartRename = vi.fn();
        defaultProps.onCreateFolder = vi.fn();
        useAppStore.getState().toggleSelection(targetFile, true, false);
    });

    it('「開く」「切り取り」「コピー」「名前変更」「削除」が全て表示される', () => {
        // Arrange
        render(<ContextMenu {...defaultProps} targetPath={targetFile} />);

        // Act - component renders on mount

        // Assert
        expect(screen.getByText(/開く/)).toBeInTheDocument();
        expect(screen.getByText(/切り取り/)).toBeInTheDocument();
        expect(screen.getByText('コピー(C)')).toBeInTheDocument();
        expect(screen.getByText(/名前の変更/)).toBeInTheDocument();
        expect(screen.getByText(/削除/)).toBeInTheDocument();
    });

    it('切り取りクリックでクリップボードに "cut" がセットされる', () => {
        // Arrange
        render(<ContextMenu {...defaultProps} targetPath={targetFile} />);

        // Act
        fireEvent.click(screen.getByText(/切り取り/));

        // Assert
        expect(useAppStore.getState().clipboard).toEqual({ files: [targetFile], operation: 'cut' });
    });

    it('コピークリックでクリップボードに "copy" がセットされる', () => {
        // Arrange
        render(<ContextMenu {...defaultProps} targetPath={targetFile} />);

        // Act
        fireEvent.click(screen.getByText('コピー(C)'));

        // Assert
        expect(useAppStore.getState().clipboard).toEqual({ files: [targetFile], operation: 'copy' });
    });

    it('名前変更で onStartRename が呼ばれる（promptは使わない）', () => {
        // Arrange
        render(<ContextMenu {...defaultProps} targetPath={targetFile} />);

        // Act
        fireEvent.click(screen.getByText(/名前の変更/));

        // Assert
        expect(defaultProps.onStartRename).toHaveBeenCalledWith(targetFile);
    });

    it('削除の confirm → delete_files が呼ばれる', async () => {
        // Arrange
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<ContextMenu {...defaultProps} targetPath={targetFile} />);

        // Act
        fireEvent.click(screen.getByText(/削除/));

        // Assert
        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('delete_files', { paths: [targetFile], toTrash: true });
        });
    });

    it('削除の confirm キャンセルで delete_files は呼ばれない', async () => {
        // Arrange
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<ContextMenu {...defaultProps} targetPath={targetFile} />);

        // Act
        fireEvent.click(screen.getByText(/削除/));

        // Assert
        await waitFor(() => {
            expect(defaultProps.onClose).toHaveBeenCalled();
        });
        expect(invoke).not.toHaveBeenCalledWith('delete_files', expect.anything());
    });

    it('開くクリックで open_file_default が呼ばれる', async () => {
        // Arrange
        render(<ContextMenu {...defaultProps} targetPath={targetFile} />);

        // Act
        fireEvent.click(screen.getByText(/開く/));

        // Assert
        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('open_file_default', { path: targetFile });
        });
    });
});

describe('ContextMenu — 複数選択時の制御', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(invoke).mockResolvedValue([]);
        setupStore();
        defaultProps.onClose = vi.fn();
        defaultProps.onStartRename = vi.fn();
        defaultProps.onCreateFolder = vi.fn();
        const store = useAppStore.getState();
        store.toggleSelection(`${basePath}/file1.txt`, true, false);
        store.toggleSelection(`${basePath}/file2.txt`, false, false);
    });

    it('複数選択時は「開く」と「名前変更」が表示されない', () => {
        // Arrange
        render(<ContextMenu {...defaultProps} targetPath={`${basePath}/file1.txt`} />);

        // Act - component renders on mount

        // Assert
        expect(screen.queryByText(/開く/)).not.toBeInTheDocument();
        expect(screen.queryByText(/名前の変更/)).not.toBeInTheDocument();
        expect(screen.getByText(/切り取り/)).toBeInTheDocument();
        expect(screen.getByText('コピー(C)')).toBeInTheDocument();
        expect(screen.getByText(/削除/)).toBeInTheDocument();
    });

    it('複数選択の切り取りで全ファイルがクリップボードに入る', () => {
        // Arrange
        render(<ContextMenu {...defaultProps} targetPath={`${basePath}/file1.txt`} />);

        // Act
        fireEvent.click(screen.getByText(/切り取り/));

        // Assert
        const clip = useAppStore.getState().clipboard!;
        expect(clip.files).toContain(`${basePath}/file1.txt`);
        expect(clip.files).toContain(`${basePath}/file2.txt`);
        expect(clip.operation).toBe('cut');
    });

    it('複数選択の削除で全ファイルが delete_files に渡される', async () => {
        // Arrange
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<ContextMenu {...defaultProps} targetPath={`${basePath}/file1.txt`} />);

        // Act
        fireEvent.click(screen.getByText(/削除/));

        // Assert
        await waitFor(() => {
            expect(invoke).toHaveBeenCalledWith('delete_files', {
                paths: expect.arrayContaining([`${basePath}/file1.txt`, `${basePath}/file2.txt`]),
                toTrash: true,
            });
        });
    });
});

describe('ContextMenu — 外クリックで閉じる', () => {
    it('メニュー外をクリックすると onClose が呼ばれる', () => {
        // Arrange
        setupStore();
        vi.mocked(invoke).mockResolvedValue([]);
        const onClose = vi.fn();

        // Act
        render(
            <div>
                <div data-testid="outside">外側</div>
                <ContextMenu {...defaultProps} targetPath={null} onClose={onClose} />
            </div>
        );
        fireEvent.mouseDown(screen.getByTestId('outside'));

        // Assert
        expect(onClose).toHaveBeenCalled();
    });
});
