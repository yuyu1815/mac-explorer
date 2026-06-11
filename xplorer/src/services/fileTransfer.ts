import { ipc } from '@/services/ipc';
import { useAppStore } from '@/stores/appStore';
import { useUndoStore } from '@/stores/undoStore';
import { baseName, parentDir, joinPath, normalizeDir } from '@/utils/path';

// 衝突確認を行い、ユーザーがスキップしたものを除いたコピー対象を返す
const confirmConflicts = async (sources: string[], dest: string): Promise<string[]> => {
    const confirmed: string[] = [];
    for (const src of sources) {
        const target = joinPath(dest, baseName(src));
        const exists = await ipc.checkExists(target);
        if (!exists) {
            confirmed.push(src);
            continue;
        }
        const overwrite = await useAppStore.getState().confirmOverwrite(target);
        if (overwrite) confirmed.push(src);
    }
    return confirmed;
};

// コピー。同一ディレクトリ内コピーはRust側が「xxx - コピー」連番にリネームするため
// 衝突せず、上書き確認の対象から除外する。クロスディレクトリ分が全てスキップされても、
// 同一ディレクトリ分はユーザーが明示したコピー操作として実行する。
export const copyWithConfirm = async (sources: string[], destDir: string): Promise<void> => {
    const dest = normalizeDir(destDir);
    const sameDir = sources.filter((s) => parentDir(s) === dest);
    const crossDir = sources.filter((s) => parentDir(s) !== dest);
    const confirmed = [...sameDir, ...(await confirmConflicts(crossDir, dest))];
    if (confirmed.length === 0) return;

    // 部分失敗でも成功分は created_paths に入るため、先に Undo を記録してからエラーを通知する
    const { created_paths, errors } = await ipc.copyFiles(confirmed, dest);
    if (created_paths.length > 0) {
        useUndoStore.getState().record({ type: 'copy', sources: confirmed, dest, createdPaths: created_paths });
    }
    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }
};

// 移動。同一ディレクトリへの移動は無意味なので除外する。
export const moveWithConfirm = async (sources: string[], destDir: string): Promise<void> => {
    const dest = normalizeDir(destDir);
    const crossDir = sources.filter((s) => parentDir(s) !== dest);
    const confirmed = await confirmConflicts(crossDir, dest);
    if (confirmed.length === 0) return;

    await ipc.moveFiles(confirmed, dest);
    useUndoStore.getState().record({ type: 'move', originalPaths: confirmed, dest });
};
